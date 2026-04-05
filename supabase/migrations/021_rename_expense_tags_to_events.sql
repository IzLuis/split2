-- Rename internal expense "tags" model to "events".

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'expense_tags'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'expense_events'
  ) then
    alter table public.expense_tags rename to expense_events;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'tag_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'event_id'
  ) then
    alter table public.expenses rename column tag_id to event_id;
  end if;
end
$$;

alter table public.expenses
  drop constraint if exists expenses_tag_id_fkey;

alter table public.expenses
  drop constraint if exists expenses_event_id_fkey;

alter table public.expenses
  add constraint expenses_event_id_fkey
  foreign key (event_id)
  references public.expense_events(id)
  on delete set null;

drop index if exists public.idx_expenses_group_tag;
create index if not exists idx_expenses_group_event
  on public.expenses (group_id, event_id, expense_date desc, created_at desc);

do $$
begin
  if exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_expense_tags_group_name_unique'
  ) then
    alter index public.idx_expense_tags_group_name_unique rename to idx_expense_events_group_name_unique;
  end if;

  if exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_expense_tags_group_created'
  ) then
    alter index public.idx_expense_tags_group_created rename to idx_expense_events_group_created;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'expense_events'
      and constraint_name = 'expense_tags_name_nonempty'
  ) then
    alter table public.expense_events
      rename constraint expense_tags_name_nonempty to expense_events_name_nonempty;
  end if;

  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'expense_events'
      and constraint_name = 'expense_tags_color_hex_check'
  ) then
    alter table public.expense_events
      rename constraint expense_tags_color_hex_check to expense_events_color_hex_check;
  end if;
end
$$;

create or replace function public.validate_expense_event_group()
returns trigger
language plpgsql
as $$
begin
  if new.event_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.expense_events e
    where e.id = new.event_id
      and e.group_id = new.group_id
  ) then
    raise exception 'Expense event must belong to the same group.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_expense_tag_group on public.expenses;
drop trigger if exists validate_expense_event_group on public.expenses;
create trigger validate_expense_event_group
before insert or update of group_id, event_id on public.expenses
for each row execute procedure public.validate_expense_event_group();

drop trigger if exists set_expense_tags_updated_at on public.expense_events;
drop trigger if exists set_expense_events_updated_at on public.expense_events;
create trigger set_expense_events_updated_at
before update on public.expense_events
for each row execute procedure public.set_updated_at();

alter table public.expense_events enable row level security;

drop policy if exists "expense_tags_select_member" on public.expense_events;
drop policy if exists "expense_events_select_member" on public.expense_events;
create policy "expense_events_select_member"
on public.expense_events
for select
using (public.is_group_member(group_id));

drop policy if exists "expense_tags_insert_member" on public.expense_events;
drop policy if exists "expense_events_insert_member" on public.expense_events;
create policy "expense_events_insert_member"
on public.expense_events
for insert
with check (
  created_by = auth.uid()
  and public.is_group_member(group_id)
);

drop policy if exists "expense_tags_delete_owner" on public.expense_events;
drop policy if exists "expense_events_delete_owner" on public.expense_events;
create policy "expense_events_delete_owner"
on public.expense_events
for delete
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = expense_events.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  )
);
