begin;
-- Administrator-only, atomic record deletion. Stock consumption has no test content.
create or replace function public.delete_aude_assessment(target_client uuid, target_key text, expected_record jsonb, cleanup_files jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 c public.counseling_requests%rowtype;
 r public.counseling_requests%rowtype;
 item jsonb;
 source text := split_part(target_key, ':', 1);
 record_id text := split_part(target_key, ':', 2);
 next_data jsonb;
 stock_id text;
 used jsonb;
begin
 select * into c from public.counseling_requests where id=target_client for update;
 if c.id is null or c.data->>'adminManagedClient' is distinct from 'true' or c.data->>'admissionStatus' is distinct from '확정'
 or source not in ('slot','tat','rorschach') or record_id !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or jsonb_typeof(cleanup_files) is distinct from 'array' then raise exception 'Invalid assessment deletion'; end if;
 if source='slot' then
  select value into item from jsonb_array_elements(coalesce(c.data->'assessments','[]')) where value->>'id'=record_id;
 else
  select * into r from public.counseling_requests where id=record_id::uuid for update;
  if r.id is not null and (r.data->>'clientId' is distinct from target_client::text or r.data->>'type' is distinct from case when source='tat' then 'tat-session' else 'rorschach-record' end) then raise exception 'Invalid assessment owner'; end if;
  item:=r.data;
 end if;
 if item is null then return jsonb_build_object('ok',true); end if;
 if item is distinct from expected_record then raise exception 'Assessment changed; refresh records'; end if;
 next_data:=c.data;
 if source='slot' then
  next_data:=jsonb_set(next_data,'{assessments}',coalesce((select jsonb_agg(value) from jsonb_array_elements(c.data->'assessments') where value->>'id'<>record_id),'[]'));
  stock_id:=item->>'stockItemId';
  if coalesce(stock_id,'')<>'' then
   used:=coalesce(next_data->'assessmentUsage','{}');
   used:=jsonb_set(used,array[stock_id],to_jsonb(coalesce((used->>stock_id)::integer,0)+1));
   next_data:=jsonb_set(next_data,'{assessmentUsage}',used);
  end if;
 else
  delete from public.counseling_requests where id=r.id;
 end if;
 next_data:=jsonb_set(next_data,'{assessmentFileCleanup}',coalesce(next_data->'assessmentFileCleanup','[]')||cleanup_files);
 update public.counseling_requests set data=next_data where id=c.id;
 -- Preserve schedule, fees and other linked tests; reject stale calendar edits via version.
 update public.counseling_requests a set data=jsonb_set(jsonb_set(jsonb_set(a.data,'{assessmentKeys}',
  coalesce((select jsonb_agg(k.value) from jsonb_array_elements(a.data->'assessmentKeys') k where k.value<>to_jsonb(target_key)),'[]')),
  '{version}',to_jsonb(coalesce((a.data->>'version')::integer,0)+1)),'{updatedAt}',to_jsonb(now()))
 where a.data->>'type'='aude-appointment' and a.data->>'clientId'=target_client::text and a.data->'assessmentKeys' ? target_key;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.delete_aude_assessment(uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.delete_aude_assessment(uuid,text,jsonb,jsonb) to service_role;

create or replace function public.save_aude_appointment(
  appointment_id uuid, appointment_data jsonb, appointment_version integer,
  charge_id uuid, charge_data jsonb, charge_version integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.counseling_requests%rowtype;
  c public.counseling_requests%rowtype;
begin
  if appointment_id is null or charge_id is null or appointment_id = charge_id
     or appointment_data->>'type' is distinct from 'aude-appointment'
     or charge_data->>'type' is distinct from 'aude-charge'
     or appointment_data->>'chargeId' is distinct from charge_id::text
     or appointment_data->>'clientId' is null
     or appointment_data->>'clientId' is distinct from charge_data->>'clientId'
     or appointment_data->>'creationSignature' is null
     or charge_data->>'creationSignature' is null
     or (appointment_data->>'version')::integer is distinct from coalesce(appointment_version + 1, 0)
     or (charge_data->>'version')::integer is distinct from coalesce(charge_version + 1, 0)
     or appointment_data->>'amount' is distinct from charge_data->>'amount'
  then raise exception 'Invalid appointment pair'; end if;

  -- Use the same client lock as permanent deletion, before appointment/charge locks.
  perform id from public.counseling_requests where id=(appointment_data->>'clientId')::uuid for update;
  if exists (
   select 1 from jsonb_array_elements_text(coalesce(appointment_data->'assessmentKeys','[]')) k(value)
   where not (
    (split_part(k.value,':',1)='slot' and exists (
     select 1 from public.counseling_requests cl, jsonb_array_elements(coalesce(cl.data->'assessments','[]')) s
     where cl.id=(appointment_data->>'clientId')::uuid and s->>'id'=split_part(k.value,':',2) and coalesce(s->>'deletedAt','')=''))
    or exists (select 1 from public.counseling_requests p where p.id::text=split_part(k.value,':',2)
     and p.data->>'clientId'=appointment_data->>'clientId' and coalesce(p.data->>'deletedAt','')=''
     and ((split_part(k.value,':',1)='tat' and p.data->>'type'='tat-session') or (split_part(k.value,':',1)='rorschach' and p.data->>'type'='rorschach-record')))
   )
  ) then raise exception 'Assessment changed; refresh records'; end if;

  -- Serialize creation retries, then lock existing rows in a stable order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(appointment_id::text, 0));
  perform id from public.counseling_requests
    where id in (appointment_id, charge_id) order by id for update;
  select * into a from public.counseling_requests where id = appointment_id;
  select * into c from public.counseling_requests where id = charge_id;

  if appointment_version is null then
    if a.id is not null then
      -- A lost response can be retried without duplicating or replacing records.
      if a.data::jsonb = appointment_data and c.data::jsonb = charge_data then
        return jsonb_build_object('appointment', to_jsonb(a), 'charge', to_jsonb(c));
      end if;
      raise exception 'Creation request already used; refresh records';
    end if;
    if c.id is not null or charge_version is not null then
      raise exception 'Charge already exists';
    end if;
  else
    if a.id is null or a.data->>'type' is distinct from 'aude-appointment'
       or (a.data->>'version')::integer is distinct from appointment_version
       or a.data->>'creationSignature' is distinct from appointment_data->>'creationSignature'
       or a.data->>'creationNonce' is distinct from appointment_data->>'creationNonce'
       or a.data->>'clientId' is distinct from appointment_data->>'clientId'
       or (coalesce(a.data->>'chargeId', '') <> '' and a.data->>'chargeId' <> charge_id::text)
    then raise exception 'Appointment changed; refresh records'; end if;
  end if;

  if charge_version is null then
    if c.id is not null then raise exception 'Charge already exists'; end if;
    insert into public.counseling_requests(id, data) values (charge_id, charge_data)
      returning * into c;
  else
    if c.id is null or c.data->>'type' is distinct from 'aude-charge'
       or (c.data->>'version')::integer is distinct from charge_version
       or c.data->>'creationSignature' is distinct from charge_data->>'creationSignature'
       or c.data->>'creationNonce' is distinct from charge_data->>'creationNonce'
       or c.data->>'clientId' is distinct from charge_data->>'clientId'
       or c.data->'payments' is distinct from charge_data->'payments'
    then raise exception 'Charge changed; refresh records'; end if;
    update public.counseling_requests set data = charge_data where id = charge_id returning * into c;
  end if;

  if appointment_version is null then
    insert into public.counseling_requests(id, data) values (appointment_id, appointment_data)
      returning * into a;
  else
    update public.counseling_requests set data = appointment_data where id = appointment_id returning * into a;
  end if;
  return jsonb_build_object('appointment', to_jsonb(a), 'charge', to_jsonb(c));
end;
$$;

-- Public application forms must never be able to call this administrator write API.
revoke all on function public.save_aude_appointment(uuid,jsonb,integer,uuid,jsonb,integer) from public, anon, authenticated;
grant execute on function public.save_aude_appointment(uuid,jsonb,integer,uuid,jsonb,integer) to service_role;
notify pgrst, 'reload schema';
commit;
