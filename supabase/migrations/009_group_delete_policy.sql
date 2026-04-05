drop policy if exists "groups_delete_owner" on public.groups;

create policy "groups_delete_owner"
on public.groups
for delete
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  )
);
