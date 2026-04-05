-- Allow authenticated users to create their own profile row.
-- Needed for ensureProfile fallback when profile is missing.

drop policy if exists "profiles_insert_self" on public.profiles;

create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());
