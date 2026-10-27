-- Anonymous public-homepage visits. Only the server's service role can access them.
create table public.site_visits (
  visit_date date not null,
  visitor_key text not null check (visitor_key ~ '^[0-9a-f]{64}$'),
  primary key (visit_date, visitor_key)
);
alter table public.site_visits enable row level security;
revoke all on public.site_visits from public, anon, authenticated;
grant select, insert, delete on public.site_visits to service_role;

create function public.site_visitor_stats()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with clock as (select (now() at time zone 'Asia/Seoul')::date as today)
  select jsonb_build_object(
    'date', clock.today,
    'today', (select count(*) from public.site_visits where visit_date = clock.today),
    'month', (select count(distinct visitor_key) from public.site_visits
      where visit_date >= date_trunc('month', clock.today)::date and visit_date <= clock.today)
  ) from clock;
$$;
revoke all on function public.site_visitor_stats() from public, anon, authenticated;
grant execute on function public.site_visitor_stats() to service_role;
