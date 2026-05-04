alter table public.satisfaction_questions
add column if not exists course_id uuid references public.courses(id) on delete cascade;

create index if not exists satisfaction_questions_course_id_idx
on public.satisfaction_questions (course_id, sort_order);