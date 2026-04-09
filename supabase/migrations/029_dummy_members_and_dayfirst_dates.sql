alter table public.profiles
  add column if not exists is_dummy boolean not null default false;

create index if not exists idx_profiles_is_dummy on public.profiles (is_dummy);

alter table public.group_members
  add column if not exists left_at timestamptz;

create or replace function public.replace_dummy_group_member(
  p_group_id uuid,
  p_dummy_user_id uuid,
  p_real_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null then
    raise exception 'You must be authenticated.';
  end if;

  if p_dummy_user_id is null or p_real_user_id is null then
    raise exception 'Both dummy and replacement users are required.';
  end if;

  if p_dummy_user_id = p_real_user_id then
    return;
  end if;

  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = actor_user_id
      and gm.role = 'owner'
      and gm.left_at is null
  ) then
    raise exception 'Only group owner can replace placeholder members.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_dummy_user_id
      and p.is_dummy = true
  ) then
    raise exception 'Selected placeholder member is invalid.';
  end if;

  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_dummy_user_id
      and gm.left_at is null
  ) then
    raise exception 'Placeholder member is not active in this group.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_real_user_id
      and coalesce(p.is_dummy, false) = false
  ) then
    raise exception 'Replacement user is invalid.';
  end if;

  insert into public.group_members (
    group_id,
    user_id,
    role,
    added_by,
    accepted_at,
    invited_at,
    left_at
  )
  values (
    p_group_id,
    p_real_user_id,
    'member',
    actor_user_id,
    now(),
    null,
    null
  )
  on conflict (group_id, user_id) do update
    set left_at = null,
        accepted_at = coalesce(public.group_members.accepted_at, excluded.accepted_at);

  update public.expense_participants target
  set
    base_share_amount_cents = target.base_share_amount_cents + source.base_share_amount_cents,
    share_amount_cents = target.share_amount_cents + source.share_amount_cents,
    share_percentage = case
      when target.share_percentage is null and source.share_percentage is null then null
      else coalesce(target.share_percentage, 0) + coalesce(source.share_percentage, 0)
    end,
    input_amount_cents = case
      when target.input_amount_cents is null and source.input_amount_cents is null then null
      else coalesce(target.input_amount_cents, 0) + coalesce(source.input_amount_cents, 0)
    end
  from public.expense_participants source
  where source.group_id = p_group_id
    and source.user_id = p_dummy_user_id
    and target.group_id = source.group_id
    and target.expense_id = source.expense_id
    and target.user_id = p_real_user_id;

  delete from public.expense_participants source
  using public.expense_participants target
  where source.group_id = p_group_id
    and source.user_id = p_dummy_user_id
    and target.group_id = source.group_id
    and target.expense_id = source.expense_id
    and target.user_id = p_real_user_id;

  update public.expense_participants
  set user_id = p_real_user_id
  where group_id = p_group_id
    and user_id = p_dummy_user_id;

  update public.expenses
  set paid_by = p_real_user_id
  where group_id = p_group_id
    and paid_by = p_dummy_user_id;

  delete from public.settlements
  where group_id = p_group_id
    and (
      (payer_id = p_dummy_user_id and receiver_id = p_real_user_id)
      or (payer_id = p_real_user_id and receiver_id = p_dummy_user_id)
      or (payer_id = p_dummy_user_id and receiver_id = p_dummy_user_id)
    );

  update public.settlements
  set payer_id = p_real_user_id
  where group_id = p_group_id
    and payer_id = p_dummy_user_id;

  update public.settlements
  set receiver_id = p_real_user_id
  where group_id = p_group_id
    and receiver_id = p_dummy_user_id;

  update public.expense_items
  set created_by = p_real_user_id
  where group_id = p_group_id
    and created_by = p_dummy_user_id;

  insert into public.expense_item_claims (
    expense_item_id,
    user_id,
    created_by,
    created_at
  )
  select
    c.expense_item_id,
    p_real_user_id,
    c.created_by,
    c.created_at
  from public.expense_item_claims c
  join public.expense_items ei
    on ei.id = c.expense_item_id
  left join public.expense_item_claims existing_claim
    on existing_claim.expense_item_id = c.expense_item_id
    and existing_claim.user_id = p_real_user_id
  where c.user_id = p_dummy_user_id
    and ei.group_id = p_group_id
    and existing_claim.expense_item_id is null;

  delete from public.expense_item_claims c
  using public.expense_items ei
  where c.expense_item_id = ei.id
    and ei.group_id = p_group_id
    and c.user_id = p_dummy_user_id;

  delete from public.group_members
  where group_id = p_group_id
    and user_id = p_dummy_user_id;
end;
$$;

grant execute on function public.replace_dummy_group_member(uuid, uuid, uuid) to authenticated;
