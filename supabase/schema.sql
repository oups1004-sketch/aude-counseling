create extension if not exists pgcrypto;

create table if not exists public.submission_counters (
  kind text not null,
  year integer not null,
  last_value integer not null default 0,
  primary key (kind, year)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  reference_code text unique,
  kind text not null check (kind in ('intake', 'assessment', 'story')),
  status text not null default '신규' check (status in ('신규', '확인', '연락 완료', '진행', '종결')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text, nickname text, age_group text, contact text, service text,
  preferred_time text, message text,
  content_consent boolean not null default false,
  privacy_version text not null,
  admin_note text
);

create or replace function public.assign_submission_reference()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prefix text;
  submitted_year integer;
  next_number integer;
begin
  prefix := case new.kind when 'intake' then 'I' when 'assessment' then 'T' when 'story' then 'S' end;
  submitted_year := extract(year from coalesce(new.created_at, now()))::integer;
  insert into public.submission_counters(kind, year, last_value)
  values (new.kind, submitted_year, 1)
  on conflict (kind, year) do update set last_value = public.submission_counters.last_value + 1
  returning last_value into next_number;
  new.reference_code := prefix || '-' || submitted_year || '-' || lpad(next_number::text, 4, '0');
  return new;
end;
$$;

create or replace function public.touch_submission_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists submissions_assign_reference on public.submissions;
create trigger submissions_assign_reference before insert on public.submissions
for each row execute function public.assign_submission_reference();
drop trigger if exists submissions_touch_updated_at on public.submissions;
create trigger submissions_touch_updated_at before update on public.submissions
for each row execute function public.touch_submission_updated_at();

alter table public.submissions enable row level security;
alter table public.submission_counters enable row level security;
revoke all on table public.submissions from anon, authenticated;
revoke all on table public.submission_counters from anon, authenticated;
