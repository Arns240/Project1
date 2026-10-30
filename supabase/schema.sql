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

create table if not exists public.maintenance_inspections (
  id uuid primary key default gen_random_uuid(),
  machine_id smallint not null check (machine_id between 1 and 6),
  schedule_day text not null check (schedule_day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  maintenance_date date not null,
  motor_ids text[] not null check (cardinality(motor_ids) between 1 and 10),
  functionality_status text not null check (functionality_status in ('satisfactory', 'attention', 'not_checked')),
  wiring_status text not null check (wiring_status in ('satisfactory', 'attention', 'not_checked')),
  sensor_status text not null check (sensor_status in ('satisfactory', 'attention', 'not_checked')),
  mounting_status text not null check (mounting_status in ('satisfactory', 'attention', 'not_checked')),
  noise_vibration_status text not null check (noise_vibration_status in ('satisfactory', 'attention', 'not_checked')),
  safety_status text not null check (safety_status in ('satisfactory', 'attention', 'not_checked')),
  lubrication_status text not null check (lubrication_status in ('satisfactory', 'attention', 'not_checked')),
  comments text not null default '' check (char_length(comments) <= 3000),
  follow_up_actions text not null default '' check (char_length(follow_up_actions) <= 2000),
  engineer_id uuid not null references auth.users(id),
  engineer_email text not null default '' check (char_length(engineer_email) <= 320),
  created_at timestamptz not null default now(),
  constraint maintenance_inspections_schedule_machine_check check (
    (machine_id = 1 and schedule_day = 'Monday') or
    (machine_id = 2 and schedule_day = 'Tuesday') or
    (machine_id = 3 and schedule_day = 'Wednesday') or
    (machine_id = 4 and schedule_day = 'Thursday') or
    (machine_id = 5 and schedule_day = 'Friday') or
    (machine_id = 6 and schedule_day = 'Saturday')
  )
);

create index if not exists maintenance_inspections_date_idx
  on public.maintenance_inspections (maintenance_date desc, created_at desc);

alter table public.maintenance_inspections enable row level security;
revoke all on table public.maintenance_inspections from public, anon, authenticated;
grant select, insert on table public.maintenance_inspections to service_role;
