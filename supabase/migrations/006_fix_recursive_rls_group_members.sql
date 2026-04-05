-- Fix recursive RLS evaluation between group_members policies and is_group_member().

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
  );
$$;

-- Ensure app roles can call the function in policy expressions.
grant execute on function public.is_group_member(uuid) to authenticated, anon;
