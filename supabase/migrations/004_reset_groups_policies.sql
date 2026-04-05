-- Reset all policies on public.groups and recreate known-good policies.
-- This fixes cases where legacy or ALL policies still block INSERT.

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'groups'
  loop
    execute format('drop policy if exists %I on public.groups', policy_row.policyname);
  end loop;
end;
$$;

create policy "groups_select_member"
on public.groups
for select
to authenticated
using (public.is_group_member(id));

create policy "groups_insert_creator"
on public.groups
for insert
to public
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

create policy "groups_update_owner"
on public.groups
for update
to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = id and gm.user_id = auth.uid() and gm.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = id and gm.user_id = auth.uid() and gm.role = 'owner'
  )
);
