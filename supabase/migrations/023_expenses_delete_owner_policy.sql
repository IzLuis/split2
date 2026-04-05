drop policy if exists "expenses_delete_creator" on public.expenses;
drop policy if exists "expenses_delete_creator_or_owner" on public.expenses;

create policy "expenses_delete_creator_or_owner"
on public.expenses
for delete
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.group_members gm
    where gm.group_id = expenses.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  )
);
