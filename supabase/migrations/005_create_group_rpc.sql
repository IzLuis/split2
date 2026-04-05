-- Robust group creation via security-definer RPC to avoid client-side RLS edge cases.

create or replace function public.create_group(
  p_name text,
  p_description text default null,
  p_member_emails text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_group_id uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Group name must have at least 2 characters.' using errcode = '22023';
  end if;

  insert into public.groups (name, description, created_by)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    v_uid
  )
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role, added_by)
  values (v_group_id, v_uid, 'owner', v_uid)
  on conflict (group_id, user_id) do nothing;

  if p_member_emails is not null and array_length(p_member_emails, 1) > 0 then
    insert into public.group_members (group_id, user_id, role, added_by)
    select v_group_id, p.id, 'member', v_uid
    from public.profiles p
    where lower(p.email) = any(p_member_emails)
      and p.id <> v_uid
    on conflict (group_id, user_id) do nothing;
  end if;

  return v_group_id;
end;
$$;

revoke all on function public.create_group(text, text, text[]) from public;
grant execute on function public.create_group(text, text, text[]) to authenticated;
