-- Apply once in Supabase SQL Editor BEFORE deploying the corresponding app code.
-- Uses the existing counseling_requests table; does not rewrite existing records.
begin;

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
