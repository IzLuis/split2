-- Allow any active group member to edit expenses/itemized rows,
-- while preserving original creator and tracking the last editor.

alter table public.expenses
  add column if not exists updated_by uuid references public.profiles(id);

update public.expenses
set updated_by = coalesce(updated_by, created_by)
where updated_by is null;

create index if not exists idx_expenses_updated_by on public.expenses(updated_by);

create or replace function public.set_expense_audit_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Keep expense identity and ownership immutable after creation.
  new.id := old.id;
  new.group_id := old.group_id;
  new.created_by := old.created_by;

  -- Track the latest editor when available.
  new.updated_by := coalesce(auth.uid(), old.updated_by, old.created_by);
  return new;
end;
$$;

drop trigger if exists set_expenses_audit_fields on public.expenses;
create trigger set_expenses_audit_fields
before update on public.expenses
for each row execute procedure public.set_expense_audit_fields();

alter table public.groups enable row level security;

drop policy if exists "groups_insert_creator" on public.groups;
create policy "groups_insert_creator"
on public.groups
for insert
to authenticated
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

drop policy if exists "expenses_update_creator" on public.expenses;
drop policy if exists "expenses_update_member" on public.expenses;
create policy "expenses_update_member"
on public.expenses
for update
to authenticated
using (public.is_group_member(group_id))
with check (public.is_group_member(group_id));

drop policy if exists "expense_items_insert_expense_creator" on public.expense_items;
drop policy if exists "expense_items_update_expense_creator" on public.expense_items;
drop policy if exists "expense_items_delete_expense_creator" on public.expense_items;
drop policy if exists "expense_items_insert_member" on public.expense_items;
drop policy if exists "expense_items_update_member" on public.expense_items;
drop policy if exists "expense_items_delete_member" on public.expense_items;

create policy "expense_items_insert_member"
on public.expense_items
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_group_member(group_id)
  and exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
  )
);

create policy "expense_items_update_member"
on public.expense_items
for update
to authenticated
using (
  public.is_group_member(group_id)
  and exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
  )
)
with check (
  public.is_group_member(group_id)
  and exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
  )
);

create policy "expense_items_delete_member"
on public.expense_items
for delete
to authenticated
using (
  public.is_group_member(group_id)
  and exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
  )
);

drop policy if exists "expense_participants_update_expense_creator" on public.expense_participants;
drop policy if exists "expense_participants_delete_expense_creator" on public.expense_participants;
drop policy if exists "expense_participants_update_itemized_member" on public.expense_participants;
drop policy if exists "expense_participants_delete_itemized_member" on public.expense_participants;
drop policy if exists "expense_participants_update_member" on public.expense_participants;
drop policy if exists "expense_participants_delete_member" on public.expense_participants;

create policy "expense_participants_update_member"
on public.expense_participants
for update
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and public.is_group_member(e.group_id)
  )
)
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and public.is_group_member(e.group_id)
  )
);

create policy "expense_participants_delete_member"
on public.expense_participants
for delete
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and public.is_group_member(e.group_id)
  )
);
