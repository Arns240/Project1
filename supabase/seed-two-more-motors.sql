-- Fictional prototype readings for motors 2 and 3 on each of the six machines.
-- Existing motor IDs and readings are left untouched. Re-running this file is safe.
with demo_readings (machine_id, motor_id, temperature_c, current_a, vibration_mm_s) as (
  values
    (1, 'motor-2', 38.2, 6.1, 1.8), (1, 'motor-3', 40.5, 7.3, 2.2),
    (2, 'motor-2', 39.1, 6.8, 1.7), (2, 'motor-3', 42.0, 7.6, 2.4),
    (3, 'motor-2', 41.3, 7.0, 2.0), (3, 'motor-3', 43.2, 8.1, 2.6),
    (4, 'motor-2', 37.9, 6.4, 1.6), (4, 'motor-3', 40.8, 7.2, 2.1),
    (5, 'motor-2', 42.4, 7.7, 2.3), (5, 'motor-3', 44.0, 8.3, 2.8),
    (6, 'motor-2', 39.8, 6.9, 1.9), (6, 'motor-3', 41.6, 7.8, 2.5)
)
insert into public.readings (
  machine_id,
  motor_id,
  temperature_c,
  current_a,
  vibration_mm_s,
  timestamp
)
select
  demo.machine_id,
  demo.motor_id,
  demo.temperature_c,
  demo.current_a,
  demo.vibration_mm_s,
  now()
from demo_readings as demo
where not exists (
  select 1
  from public.readings as existing
  where existing.machine_id = demo.machine_id
    and existing.motor_id = demo.motor_id
);
