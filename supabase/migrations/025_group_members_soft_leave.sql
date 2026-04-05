alter table public.group_members
  add column if not exists left_at timestamptz;

create index if not exists idx_group_members_user_active
  on public.group_members(user_id, left_at);

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
      and gm.left_at is null
  );
$$;

grant execute on function public.is_group_member(uuid) to authenticated, anon;
