drop policy if exists "expense_participants_update_itemized_member" on public.expense_participants;
create policy "expense_participants_update_itemized_member"
on public.expense_participants
for update
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.is_itemized = true
      and public.is_group_member(e.group_id)
  )
)
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.is_itemized = true
      and public.is_group_member(e.group_id)
  )
);

drop policy if exists "expense_participants_delete_itemized_member" on public.expense_participants;
create policy "expense_participants_delete_itemized_member"
on public.expense_participants
for delete
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.is_itemized = true
      and public.is_group_member(e.group_id)
  )
);
