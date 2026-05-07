alter table public.final_exam_settings
add column if not exists notification_template text not null default '';