-- 019_expense_tags_and_events.sql
-- Purpose:
-- 1) Add group-level expense tags.
-- 2) Link expenses to tags.
-- 3) Enforce tag/group consistency.
-- 4) Protect tag data with RLS.

create table if not exists public.expense_tags (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  color text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_tags_name_nonempty check (length(trim(name)) > 0),
  constraint expense_tags_color_hex_check check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists idx_expense_tags_group_name_unique
  on public.expense_tags (group_id, lower(name));

create index if not exists idx_expense_tags_group_created
  on public.expense_tags (group_id, created_at desc);

alter table public.expenses
  add column if not exists tag_id uuid references public.expense_tags(id) on delete set null;

create index if not exists idx_expenses_group_tag
  on public.expenses (group_id, tag_id, expense_date desc, created_at desc);

create or replace function public.validate_expense_tag_group()
returns trigger
language plpgsql
as $$
begin
  if new.tag_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.expense_tags t
    where t.id = new.tag_id
      and t.group_id = new.group_id
  ) then
    raise exception 'Expense tag must belong to the same group.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_expense_tag_group on public.expenses;
create trigger validate_expense_tag_group
before insert or update of group_id, tag_id on public.expenses
for each row execute procedure public.validate_expense_tag_group();

drop trigger if exists set_expense_tags_updated_at on public.expense_tags;
create trigger set_expense_tags_updated_at
before update on public.expense_tags
for each row execute procedure public.set_updated_at();

alter table public.expense_tags enable row level security;

drop policy if exists "expense_tags_select_member" on public.expense_tags;
create policy "expense_tags_select_member"
on public.expense_tags
for select
using (public.is_group_member(group_id));

drop policy if exists "expense_tags_insert_member" on public.expense_tags;
create policy "expense_tags_insert_member"
on public.expense_tags
for insert
with check (
  created_by = auth.uid()
  and public.is_group_member(group_id)
);

drop policy if exists "expense_tags_delete_owner" on public.expense_tags;
create policy "expense_tags_delete_owner"
on public.expense_tags
for delete
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = expense_tags.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  )
);
