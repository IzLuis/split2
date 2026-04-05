create or replace function public.leave_group(target_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_role text;
begin
  select gm.role
    into membership_role
  from public.group_members gm
  where gm.group_id = target_group_id
    and gm.user_id = auth.uid()
    and gm.left_at is null
  for update;

  if membership_role is null then
    return false;
  end if;

  if membership_role = 'owner' then
    raise exception 'Group owners cannot leave the group.';
  end if;

  update public.group_members
  set left_at = now()
  where group_id = target_group_id
    and user_id = auth.uid()
    and left_at is null;

  return found;
end;
$$;

grant execute on function public.leave_group(uuid) to authenticated;
