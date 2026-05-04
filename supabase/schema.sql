create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'user_role'
  ) then
    create type public.user_role as enum ('admin', 'student', 'reciter', 'trainee');
  end if;
end
$$;

alter type public.user_role add value if not exists 'male_manager';
alter type public.user_role add value if not exists 'female_manager';

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('male', 'female')),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role public.user_role not null,
  login_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  login_code text not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  note text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reciters (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  user_id uuid unique references public.users(id) on delete set null,
  branch_id uuid references public.branches(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table if exists public.reciters
add column if not exists branch_id uuid references public.branches(id) on delete restrict;

create table if not exists public.reciter_students (
  reciter_id uuid not null references public.reciters(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reciter_id, student_id)
);

create table if not exists public.student_parts (
  student_id uuid not null references public.students(id) on delete cascade,
  part_number integer not null check (part_number between 1 and 30),
  marked_by_reciter_id uuid references public.reciters(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (student_id, part_number)
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  entity_type text not null default 'course' check (entity_type in ('course', 'task')),
  task_mode text check (task_mode in ('questions', 'document')),
  task_template_id uuid,
  task_template_name text not null default '',
  task_template_content text not null default '',
  is_active boolean not null default false,
  is_pre_enabled boolean not null default true,
  is_post_enabled boolean not null default true,
  is_tasks_enabled boolean not null default true,
  male_pre_enabled boolean not null default true,
  female_pre_enabled boolean not null default true,
  male_post_enabled boolean not null default true,
  female_post_enabled boolean not null default true,
  male_tasks_enabled boolean not null default true,
  female_tasks_enabled boolean not null default true,
  assessment_windows jsonb not null default '{}'::jsonb,
  assessment_notification_templates jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.courses add column if not exists is_pre_enabled boolean not null default true;
alter table public.courses add column if not exists is_post_enabled boolean not null default true;
alter table public.courses add column if not exists is_tasks_enabled boolean not null default true;
alter table public.courses add column if not exists male_pre_enabled boolean not null default true;
alter table public.courses add column if not exists female_pre_enabled boolean not null default true;
alter table public.courses add column if not exists male_post_enabled boolean not null default true;
alter table public.courses add column if not exists female_post_enabled boolean not null default true;
alter table public.courses add column if not exists male_tasks_enabled boolean not null default true;
alter table public.courses add column if not exists female_tasks_enabled boolean not null default true;
alter table public.courses add column if not exists assessment_windows jsonb not null default '{}'::jsonb;
alter table public.courses add column if not exists assessment_notification_templates jsonb not null default '{}'::jsonb;
alter table public.courses add column if not exists entity_type text not null default 'course';
alter table public.courses add column if not exists task_mode text;
alter table public.courses add column if not exists task_template_id uuid;
alter table public.courses add column if not exists task_template_name text not null default '';
alter table public.courses add column if not exists task_template_content text not null default '';
alter table public.courses add column if not exists youtube_url text not null default '';
alter table public.courses add column if not exists sort_order integer not null default 0;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  target_branch_code text check (target_branch_code in ('male', 'female')),
  target_login_ids text[] not null default '{}',
  created_by_name text,
  created_by_role public.user_role,
  created_at timestamptz not null default now()
);

alter table if exists public.notifications add column if not exists target_login_ids text[] not null default '{}';

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  content text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_course_idx
on public.courses ((is_active))
where is_active = true;

create table if not exists public.course_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('pre', 'post', 'tasks')),
  question_type text not null check (question_type in ('multiple', 'text')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  allow_file boolean not null default false,
  points integer not null default 0 check (points >= 0),
  correct_answer text not null default '',
  attachment_name text not null default '',
  attachment_type text not null default '',
  attachment_data_url text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.course_questions add column if not exists points integer not null default 1;
-- Fix existing questions that were inserted before the points column (they got default 0)
update public.course_questions set points = 1 where points = 0;
alter table public.course_questions add column if not exists correct_answer text not null default '';
alter table public.course_questions add column if not exists attachment_name text not null default '';
alter table public.course_questions add column if not exists attachment_type text not null default '';
alter table public.course_questions add column if not exists attachment_data_url text not null default '';

create table if not exists public.course_submissions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('pre', 'post', 'tasks')),
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  login_code text not null,
  manual_score numeric,
  submitted_at timestamptz not null default now()
);

alter table public.course_submissions add column if not exists manual_score numeric;

create table if not exists public.course_submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.course_submissions(id) on delete cascade,
  question_id uuid not null references public.course_questions(id) on delete cascade,
  answer_text text,
  file_name text,
  file_type text,
  file_data_url text,
  created_at timestamptz not null default now()
);

alter table public.course_submission_answers add column if not exists file_type text;
alter table public.course_submission_answers add column if not exists file_data_url text;

create table if not exists public.course_attendance (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  login_code text not null,
  source text not null default 'post-test' check (source in ('post-test')),
  created_at timestamptz not null default now(),
  unique (course_id, login_code)
);

alter table if exists public.branches disable row level security;
alter table if exists public.users disable row level security;
alter table if exists public.students disable row level security;
alter table if exists public.reciters disable row level security;
alter table if exists public.reciter_students disable row level security;
alter table if exists public.student_parts disable row level security;
alter table if exists public.courses disable row level security;
alter table if exists public.task_templates disable row level security;
alter table if exists public.course_questions disable row level security;
alter table if exists public.course_submissions disable row level security;
alter table if exists public.course_submission_answers disable row level security;
alter table if exists public.course_attendance disable row level security;
alter table if exists public.notifications disable row level security;

insert into public.branches (code, name)
values
  ('male', 'رجالي'),
  ('female', 'نسائي')
on conflict (code) do update
set name = excluded.name;

insert into public.users (full_name, role, login_code)
values
  ('إبراهيم محمد ابا الخيل', 'admin', '1483'),
  ('متدرب', 'trainee', 'trainee')
on conflict (login_code) do update
set
  full_name = excluded.full_name,
  role = excluded.role;

create or replace function public.create_admin_account(admin_name text, admin_login_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_dashboard_account(admin_name, admin_login_code, 'admin');
end;
$$;

grant execute on function public.create_admin_account(text, text) to anon, authenticated, service_role;

create or replace function public.create_dashboard_account(account_name text, account_login_code text, account_role public.user_role)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed_name text := btrim(account_name);
  trimmed_login_code text := btrim(account_login_code);
  inserted_user_id uuid;
begin
  if trimmed_name = '' or trimmed_login_code = '' then
    raise exception 'أدخل الاسم ورقم الدخول.';
  end if;

  if account_role not in ('admin', 'male_manager', 'female_manager') then
    raise exception 'نوع الحساب الإشرافي غير صالح.';
  end if;

  if exists (
    select 1
    from public.users
    where login_code = trimmed_login_code
  ) then
    raise exception 'رقم الدخول مستخدم مسبقًا.';
  end if;

  insert into public.users (full_name, role, login_code)
  values (trimmed_name, account_role, trimmed_login_code)
  returning id into inserted_user_id;

  return inserted_user_id;
end;
$$;

grant execute on function public.create_dashboard_account(text, text, public.user_role) to anon, authenticated, service_role;

create or replace function public.list_admin_accounts()
returns table (
  id uuid,
  full_name text,
  login_code text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select accounts.id, accounts.full_name, accounts.login_code
  from public.list_dashboard_accounts() as accounts
  where accounts.role = 'admin'
  order by accounts.created_at asc;
end;
$$;

grant execute on function public.list_admin_accounts() to anon, authenticated, service_role;

create or replace function public.list_dashboard_accounts()
returns table (
  id uuid,
  full_name text,
  login_code text,
  role public.user_role,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select users.id, users.full_name, users.login_code, users.role, users.created_at
  from public.users
  where users.role in ('admin', 'male_manager', 'female_manager')
  order by users.created_at asc;
end;
$$;

grant execute on function public.list_dashboard_accounts() to anon, authenticated, service_role;

create or replace function public.delete_admin_account(target_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.delete_dashboard_account(target_admin_id);
end;
$$;

grant execute on function public.delete_admin_account(uuid) to anon, authenticated, service_role;

create or replace function public.delete_dashboard_account(target_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.users
  where id = target_account_id
    and role in ('admin', 'male_manager', 'female_manager');
end;
$$;

grant execute on function public.delete_dashboard_account(uuid) to anon, authenticated, service_role;

create or replace function public.create_student_account(
  student_name text,
  student_login_code text,
  student_branch_code text,
  student_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed_name text := btrim(student_name);
  trimmed_login_code text := btrim(student_login_code);
  trimmed_branch_code text := btrim(student_branch_code);
  normalized_note text := coalesce(student_note, '');
  resolved_branch_id uuid;
  inserted_student_id uuid;
begin
  if trimmed_name = '' or trimmed_login_code = '' or trimmed_branch_code = '' then
    raise exception 'أدخل اسم الطالب والفرع ورقم الدخول.';
  end if;

  if exists (
    select 1
    from public.students
    where login_code = trimmed_login_code
  ) then
    raise exception 'رقم الدخول مستخدم مسبقًا.';
  end if;

  select id
  into resolved_branch_id
  from public.branches
  where code = trimmed_branch_code;

  if resolved_branch_id is null then
    raise exception 'اختر فرعًا صحيحًا للطالب.';
  end if;

  insert into public.students (full_name, login_code, branch_id, note)
  values (trimmed_name, trimmed_login_code, resolved_branch_id, normalized_note)
  returning id into inserted_student_id;

  return inserted_student_id;
end;
$$;

grant execute on function public.create_student_account(text, text, text, text) to anon, authenticated, service_role;

create or replace function public.save_reciter_account(current_login_code text, reciter_name text, reciter_login_code text, reciter_branch_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed_current_login_code text := btrim(coalesce(current_login_code, ''));
  trimmed_name text := btrim(reciter_name);
  trimmed_login_code text := btrim(reciter_login_code);
  trimmed_branch_code text := btrim(reciter_branch_code);
  current_user_id uuid;
  target_user_id uuid;
  resolved_user_id uuid;
  resolved_reciter_id uuid;
  resolved_branch_id uuid;
begin
  if trimmed_name = '' or trimmed_login_code = '' or trimmed_branch_code = '' then
    raise exception 'أدخل اسم المقرئ والفرع ورقم الدخول.';
  end if;

  select id
  into resolved_branch_id
  from public.branches
  where code = trimmed_branch_code;

  if resolved_branch_id is null then
    raise exception 'اختر فرعًا صحيحًا للمقرئ.';
  end if;

  if trimmed_current_login_code <> '' then
    select id
    into current_user_id
    from public.users
    where login_code = trimmed_current_login_code
      and role = 'reciter';
  end if;

  select id
  into target_user_id
  from public.users
  where login_code = trimmed_login_code
    and role = 'reciter';

  if target_user_id is not null and current_user_id is distinct from target_user_id then
    raise exception 'رقم دخول المقرئ مستخدم مسبقًا.';
  end if;

  resolved_user_id := coalesce(current_user_id, target_user_id);

  if resolved_user_id is not null then
    update public.users
    set full_name = trimmed_name,
        login_code = trimmed_login_code,
        role = 'reciter'
    where id = resolved_user_id;
  else
    insert into public.users (full_name, role, login_code)
    values (trimmed_name, 'reciter', trimmed_login_code)
    returning id into resolved_user_id;
  end if;

  select id
  into resolved_reciter_id
  from public.reciters
  where user_id = resolved_user_id;

  if resolved_reciter_id is not null then
    update public.reciters
    set full_name = trimmed_name,
        user_id = resolved_user_id,
        branch_id = resolved_branch_id
    where id = resolved_reciter_id;
  else
    insert into public.reciters (full_name, user_id, branch_id)
    values (trimmed_name, resolved_user_id, resolved_branch_id)
    returning id into resolved_reciter_id;
  end if;

  return resolved_reciter_id;
end;
$$;

grant execute on function public.save_reciter_account(text, text, text, text) to anon, authenticated, service_role;

create or replace function public.delete_reciter_account(target_login_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed_login_code text := btrim(target_login_code);
  resolved_user_id uuid;
  resolved_reciter_id uuid;
begin
  if trimmed_login_code = '' then
    return null;
  end if;

  select id
  into resolved_user_id
  from public.users
  where login_code = trimmed_login_code
    and role = 'reciter';

  if resolved_user_id is null then
    return null;
  end if;

  select id
  into resolved_reciter_id
  from public.reciters
  where user_id = resolved_user_id;

  if resolved_reciter_id is not null then
    delete from public.reciter_students where reciter_id = resolved_reciter_id;
    delete from public.reciters where id = resolved_reciter_id;
  end if;

  delete from public.users where id = resolved_user_id;

  return resolved_reciter_id;
end;
$$;

grant execute on function public.delete_reciter_account(text) to anon, authenticated, service_role;

create or replace function public.get_branch_id_by_code(branch_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed_code text := btrim(branch_code);
  resolved_branch_id uuid;
begin
  if trimmed_code = '' then
    raise exception 'أدخل رمز الفرع.';
  end if;

  select id
  into resolved_branch_id
  from public.branches
  where code = trimmed_code;

  if resolved_branch_id is null then
    raise exception 'الفرع % غير موجود.', trimmed_code;
  end if;

  return resolved_branch_id;
end;
$$;

grant execute on function public.get_branch_id_by_code(text) to anon, authenticated, service_role;

create or replace view public.student_memorization_progress as
select
  students.id,
  students.full_name,
  students.login_code,
  branches.name as branch_name,
  count(student_parts.part_number) as completed_parts_count
from public.students
join public.branches on branches.id = students.branch_id
left join public.student_parts on student_parts.student_id = students.id
group by students.id, students.full_name, students.login_code, branches.name
order by completed_parts_count desc, students.full_name asc;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  login_code text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (login_code, endpoint)
);

alter table if exists public.push_subscriptions disable row level security;

create or replace view public.active_course_details as
select
  courses.id,
  courses.title,
  courses.created_at,
  count(case when course_questions.assessment_type = 'pre' then 1 end) as pre_questions_count,
  count(case when course_questions.assessment_type = 'post' then 1 end) as post_questions_count,
  count(case when course_questions.assessment_type = 'tasks' then 1 end) as task_questions_count
from public.courses
left join public.course_questions on course_questions.course_id = courses.id
where courses.is_active = true
group by courses.id, courses.title, courses.created_at;