drop policy if exists "expenses_delete_creator" on public.expenses;

create policy "expenses_delete_creator"
on public.expenses
for delete
to authenticated
using (created_by = auth.uid());
