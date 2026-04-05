-- Fix group creation RLS policy for authenticated sessions.
-- Compatible with both anon/publishable JWT roles used by Supabase clients.

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'groups'
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.groups', policy_row.policyname);
  end loop;
end;
$$;

create policy "groups_insert_creator"
on public.groups
for insert
to public
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);
