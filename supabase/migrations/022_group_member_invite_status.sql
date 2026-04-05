-- Add lightweight invite acceptance tracking for group members.

alter table public.group_members
  add column if not exists invited_at timestamptz,
  add column if not exists accepted_at timestamptz;

update public.group_members
set accepted_at = coalesce(accepted_at, created_at)
where accepted_at is null;

create index if not exists idx_group_members_group_accepted
  on public.group_members (group_id, accepted_at);

alter table public.group_members
  drop constraint if exists group_members_acceptance_dates_check;

alter table public.group_members
  add constraint group_members_acceptance_dates_check
  check (
    accepted_at is null
    or invited_at is null
    or accepted_at >= invited_at
  );

create or replace function public.create_group(
  p_name text,
  p_description text default null,
  p_default_currency text default 'USD',
  p_calculation_mode text default 'normal',
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
  v_currency text;
  v_mode text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Group name must have at least 2 characters.' using errcode = '22023';
  end if;

  v_currency := upper(coalesce(p_default_currency, 'USD'));
  if v_currency not in ('USD', 'MXN') then
    raise exception 'Unsupported default currency.' using errcode = '22023';
  end if;

  v_mode := lower(coalesce(p_calculation_mode, 'normal'));
  if v_mode not in ('normal', 'reduced') then
    raise exception 'Unsupported calculation mode.' using errcode = '22023';
  end if;

  insert into public.groups (name, description, created_by, default_currency, calculation_mode)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    v_uid,
    v_currency,
    v_mode
  )
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role, added_by, accepted_at)
  values (v_group_id, v_uid, 'owner', v_uid, now())
  on conflict (group_id, user_id) do nothing;

  if p_member_emails is not null and array_length(p_member_emails, 1) > 0 then
    insert into public.group_members (group_id, user_id, role, added_by, accepted_at)
    select v_group_id, p.id, 'member', v_uid, now()
    from public.profiles p
    where lower(p.email) = any(p_member_emails)
      and p.id <> v_uid
    on conflict (group_id, user_id) do nothing;
  end if;

  return v_group_id;
end;
$$;

revoke all on function public.create_group(text, text, text, text, text[]) from public;
grant execute on function public.create_group(text, text, text, text, text[]) to authenticated;

