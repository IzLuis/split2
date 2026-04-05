drop policy if exists "expense_participants_update_expense_creator" on public.expense_participants;
create policy "expense_participants_update_expense_creator"
on public.expense_participants
for update
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists "expense_participants_delete_expense_creator" on public.expense_participants;
create policy "expense_participants_delete_expense_creator"
on public.expense_participants
for delete
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.created_by = auth.uid()
  )
);
