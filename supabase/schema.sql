create table if not exists public.readings (
  id uuid primary key default gen_random_uuid(),
  machine_id smallint not null check (machine_id between 1 and 6),
  motor_id text not null check (char_length(motor_id) between 1 and 64),
  temperature_c double precision not null check (temperature_c between -40 and 250),
  current_a double precision not null check (current_a between 0 and 10000),
  vibration_mm_s double precision not null check (vibration_mm_s between 0 and 1000),
  timestamp timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists readings_machine_motor_timestamp_idx
  on public.readings (machine_id, motor_id, timestamp desc, received_at desc);

alter table public.readings enable row level security;
revoke all on table public.readings from public, anon, authenticated;
grant all on table public.readings to service_role;

create or replace function public.latest_motor_readings()
returns setof public.readings
language sql
stable
as $$
  select distinct on (machine_id, motor_id) *
  from public.readings
  order by machine_id, motor_id, timestamp desc, received_at desc;
$$;

revoke execute on function public.latest_motor_readings() from public, anon, authenticated;
grant execute on function public.latest_motor_readings() to service_role;
