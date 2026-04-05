drop policy if exists "group_members_delete_self" on public.group_members;

create policy "group_members_delete_self"
on public.group_members
for delete
to authenticated
using (user_id = auth.uid());
