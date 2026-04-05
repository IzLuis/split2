-- 999_v1_baseline_schema.sql
--
-- One-file baseline schema for fresh deployments of v1.
--
-- Use this file to bootstrap a new Supabase database without applying every historical
-- migration manually. Legacy migrations are kept for audit/history and existing installs.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format_check check (
    username is null
    or username ~ '^[a-z0-9_]{3,30}$'
  ),
  constraint profiles_username_lowercase_check check (
    username is null
    or username = lower(username)
  )
);

create unique index if not exists idx_profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.profiles(id),
  default_currency char(3) not null default 'USD',
  calculation_mode text not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_default_currency_check check (default_currency in ('USD', 'MXN')),
  constraint groups_calculation_mode_check check (calculation_mode in ('normal', 'reduced'))
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  added_by uuid references public.profiles(id),
  invited_at timestamptz,
  accepted_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_members_acceptance_dates_check check (
    accepted_at is null
    or invited_at is null
    or accepted_at >= invited_at
  )
);

create table if not exists public.expense_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  color text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_events_name_nonempty check (length(trim(name)) > 0),
  constraint expense_events_color_hex_check check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists idx_expense_events_group_name_unique
  on public.expense_events (group_id, lower(name));

create index if not exists idx_expense_events_group_created
  on public.expense_events (group_id, created_at desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  description text,
  is_itemized boolean not null default false,
  itemization_status text not null default 'not_itemized',
  assigned_amount_cents integer not null default 0,
  unassigned_amount_cents integer not null default 0,
  subtotal_amount_cents integer not null,
  total_amount_cents integer not null,
  tip_percentage numeric(6, 3) not null default 0,
  tip_amount_cents integer not null default 0,
  delivery_fee_cents integer not null default 0,
  event_id uuid references public.expense_events(id) on delete set null,
  currency char(3) not null,
  expense_date date not null,
  paid_by uuid not null,
  split_type text not null check (split_type in ('equal', 'custom', 'percentage')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id),
  foreign key (group_id, paid_by) references public.group_members(group_id, user_id),
  constraint expenses_subtotal_positive_check check (subtotal_amount_cents > 0),
  constraint expenses_tip_nonnegative_check check (tip_amount_cents >= 0 and tip_percentage >= 0),
  constraint expenses_delivery_fee_nonnegative_check check (delivery_fee_cents >= 0),
  constraint expenses_total_consistency_check check (
    total_amount_cents = subtotal_amount_cents + tip_amount_cents + delivery_fee_cents
  ),
  constraint expenses_itemization_status_check check (
    itemization_status in ('not_itemized', 'open', 'partially_assigned', 'fully_assigned')
  ),
  constraint expenses_assigned_nonnegative_check check (
    assigned_amount_cents >= 0 and unassigned_amount_cents >= 0
  ),
  constraint expenses_assigned_total_consistency_check check (
    assigned_amount_cents + unassigned_amount_cents = total_amount_cents
  ),
  constraint expenses_non_itemized_assignment_check check (
    is_itemized
    or (
      itemization_status = 'not_itemized'
      and assigned_amount_cents = total_amount_cents
      and unassigned_amount_cents = 0
    )
  ),
  constraint expenses_itemized_status_check check (
    (is_itemized and itemization_status in ('open', 'partially_assigned', 'fully_assigned'))
    or ((not is_itemized) and itemization_status = 'not_itemized')
  )
);

create index if not exists idx_expenses_group_date
  on public.expenses(group_id, expense_date desc, created_at desc);

create index if not exists idx_expenses_group_itemization
  on public.expenses(group_id, is_itemized, itemization_status);

create index if not exists idx_expenses_group_event
  on public.expenses (group_id, event_id, expense_date desc, created_at desc);

create table if not exists public.expense_participants (
  expense_id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  base_share_amount_cents integer not null,
  share_amount_cents integer not null check (share_amount_cents >= 0),
  share_percentage numeric(6, 3),
  input_amount_cents integer,
  created_at timestamptz not null default now(),
  primary key (expense_id, user_id),
  foreign key (expense_id, group_id) references public.expenses(id, group_id) on delete cascade,
  foreign key (group_id, user_id) references public.group_members(group_id, user_id),
  constraint expense_participants_base_share_nonnegative_check check (base_share_amount_cents >= 0)
);

create index if not exists idx_expense_participants_group_user
  on public.expense_participants(group_id, user_id);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  payer_id uuid not null,
  receiver_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  currency char(3) not null,
  settled_on date not null,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (payer_id <> receiver_id),
  foreign key (group_id, payer_id) references public.group_members(group_id, user_id),
  foreign key (group_id, receiver_id) references public.group_members(group_id, user_id)
);

create index if not exists idx_settlements_group_date
  on public.settlements(group_id, settled_on desc, created_at desc);

create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  group_id uuid not null,
  name text not null,
  unit_amount_cents integer not null,
  quantity integer not null,
  line_total_cents integer not null,
  is_shared boolean not null default false,
  notes text,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (expense_id, group_id) references public.expenses(id, group_id) on delete cascade,
  foreign key (group_id, created_by) references public.group_members(group_id, user_id),
  constraint expense_items_unit_positive_check check (unit_amount_cents > 0),
  constraint expense_items_quantity_positive_check check (quantity > 0),
  constraint expense_items_line_positive_check check (line_total_cents > 0),
  constraint expense_items_line_total_consistency_check check (
    line_total_cents = unit_amount_cents * quantity
  )
);

create index if not exists idx_expense_items_expense_sort
  on public.expense_items(expense_id, sort_order, created_at);

create table if not exists public.expense_item_claims (
  expense_item_id uuid not null references public.expense_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (expense_item_id, user_id)
);

create index if not exists idx_expense_item_claims_user
  on public.expense_item_claims(user_id);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id),
  check (status in ('pending', 'accepted', 'declined', 'canceled'))
);

create unique index if not exists idx_friend_requests_pending_pair_unique
  on public.friend_requests (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  )
  where status = 'pending';

create index if not exists idx_friend_requests_addressee_pending
  on public.friend_requests(addressee_id, created_at desc)
  where status = 'pending';

create index if not exists idx_friend_requests_requester_pending
  on public.friend_requests(requester_id, created_at desc)
  where status = 'pending';

create table if not exists public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_from_request_id uuid references public.friend_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a <> user_b),
  check (user_a < user_b)
);

create index if not exists idx_friendships_user_a on public.friendships(user_a);
create index if not exists idx_friendships_user_b on public.friendships(user_b);

create table if not exists public.receipt_ocr_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists receipt_ocr_requests_user_created_idx
  on public.receipt_ocr_requests (user_id, created_at desc);

create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_group_members_group_accepted on public.group_members(group_id, accepted_at);
create index if not exists idx_group_members_user_active on public.group_members(user_id, left_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      updated_at = now();

  return new;
end;
$$;

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

create or replace function public.validate_expense_event_group()
returns trigger
language plpgsql
as $$
begin
  if new.event_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.expense_events e
    where e.id = new.event_id
      and e.group_id = new.group_id
  ) then
    raise exception 'Expense event must belong to the same group.';
  end if;

  return new;
end;
$$;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_groups_updated_at on public.groups;
create trigger set_groups_updated_at
before update on public.groups
for each row execute procedure public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row execute procedure public.set_updated_at();

drop trigger if exists set_expense_events_updated_at on public.expense_events;
create trigger set_expense_events_updated_at
before update on public.expense_events
for each row execute procedure public.set_updated_at();

drop trigger if exists set_expense_items_updated_at on public.expense_items;
create trigger set_expense_items_updated_at
before update on public.expense_items
for each row execute procedure public.set_updated_at();

drop trigger if exists validate_expense_event_group on public.expenses;
create trigger validate_expense_event_group
before insert or update of group_id, event_id on public.expenses
for each row execute procedure public.validate_expense_event_group();

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.settlements enable row level security;
alter table public.expense_events enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_item_claims enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.receipt_ocr_requests enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
on public.groups
for select
to authenticated
using (public.is_group_member(id));

drop policy if exists "groups_insert_creator" on public.groups;
create policy "groups_insert_creator"
on public.groups
for insert
to public
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

drop policy if exists "groups_update_owner" on public.groups;
create policy "groups_update_owner"
on public.groups
for update
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
      and gm.left_at is null
  )
)
with check (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
      and gm.left_at is null
  )
);

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
      and gm.left_at is null
  )
);

drop policy if exists "group_members_select_member" on public.group_members;
create policy "group_members_select_member"
on public.group_members
for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "group_members_insert_owner_or_self" on public.group_members;
create policy "group_members_insert_owner_or_self"
on public.group_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
      and gm.left_at is null
  )
);

drop policy if exists "group_members_delete_owner" on public.group_members;
create policy "group_members_delete_owner"
on public.group_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
      and gm.left_at is null
  )
);

drop policy if exists "group_members_delete_self" on public.group_members;
create policy "group_members_delete_self"
on public.group_members
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "expenses_select_member" on public.expenses;
create policy "expenses_select_member"
on public.expenses
for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "expenses_insert_member" on public.expenses;
create policy "expenses_insert_member"
on public.expenses
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_group_member(group_id)
);

drop policy if exists "expenses_update_creator" on public.expenses;
create policy "expenses_update_creator"
on public.expenses
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "expenses_delete_creator_or_owner" on public.expenses;
create policy "expenses_delete_creator_or_owner"
on public.expenses
for delete
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.group_members gm
    where gm.group_id = expenses.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
      and gm.left_at is null
  )
);

drop policy if exists "expense_participants_select_member" on public.expense_participants;
create policy "expense_participants_select_member"
on public.expense_participants
for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "expense_participants_insert_member" on public.expense_participants;
create policy "expense_participants_insert_member"
on public.expense_participants
for insert
to authenticated
with check (public.is_group_member(group_id));

drop policy if exists "expense_participants_update_expense_creator" on public.expense_participants;
create policy "expense_participants_update_expense_creator"
on public.expense_participants
for update
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists "expense_participants_delete_expense_creator" on public.expense_participants;
create policy "expense_participants_delete_expense_creator"
on public.expense_participants
for delete
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists "expense_participants_update_itemized_member" on public.expense_participants;
create policy "expense_participants_update_itemized_member"
on public.expense_participants
for update
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.is_itemized = true
      and public.is_group_member(e.group_id)
  )
)
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.is_itemized = true
      and public.is_group_member(e.group_id)
  )
);

drop policy if exists "expense_participants_delete_itemized_member" on public.expense_participants;
create policy "expense_participants_delete_itemized_member"
on public.expense_participants
for delete
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and e.is_itemized = true
      and public.is_group_member(e.group_id)
  )
);

drop policy if exists "settlements_select_member" on public.settlements;
create policy "settlements_select_member"
on public.settlements
for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "settlements_insert_member" on public.settlements;
create policy "settlements_insert_member"
on public.settlements
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_group_member(group_id)
);

drop policy if exists "expense_events_select_member" on public.expense_events;
create policy "expense_events_select_member"
on public.expense_events
for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "expense_events_insert_member" on public.expense_events;
create policy "expense_events_insert_member"
on public.expense_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_group_member(group_id)
);

drop policy if exists "expense_events_delete_owner" on public.expense_events;
create policy "expense_events_delete_owner"
on public.expense_events
for delete
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = expense_events.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
      and gm.left_at is null
  )
);

drop policy if exists "expense_items_select_member" on public.expense_items;
create policy "expense_items_select_member"
on public.expense_items
for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "expense_items_insert_expense_creator" on public.expense_items;
create policy "expense_items_insert_expense_creator"
on public.expense_items
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists "expense_items_update_expense_creator" on public.expense_items;
create policy "expense_items_update_expense_creator"
on public.expense_items
for update
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
      and e.created_by = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists "expense_items_delete_expense_creator" on public.expense_items;
create policy "expense_items_delete_expense_creator"
on public.expense_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists "expense_item_claims_select_member" on public.expense_item_claims;
create policy "expense_item_claims_select_member"
on public.expense_item_claims
for select
to authenticated
using (
  exists (
    select 1
    from public.expense_items ei
    where ei.id = expense_item_claims.expense_item_id
      and public.is_group_member(ei.group_id)
  )
);

drop policy if exists "expense_item_claims_insert_member_or_creator" on public.expense_item_claims;
create policy "expense_item_claims_insert_member_or_creator"
on public.expense_item_claims
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.expense_items ei
    join public.expenses e
      on e.id = ei.expense_id
      and e.group_id = ei.group_id
    join public.group_members gm_target
      on gm_target.group_id = ei.group_id
      and gm_target.user_id = expense_item_claims.user_id
      and gm_target.left_at is null
    where ei.id = expense_item_claims.expense_item_id
      and public.is_group_member(ei.group_id)
      and (
        expense_item_claims.user_id = auth.uid()
        or e.created_by = auth.uid()
      )
  )
);

drop policy if exists "expense_item_claims_delete_self_or_creator" on public.expense_item_claims;
create policy "expense_item_claims_delete_self_or_creator"
on public.expense_item_claims
for delete
to authenticated
using (
  exists (
    select 1
    from public.expense_items ei
    join public.expenses e
      on e.id = ei.expense_id
      and e.group_id = ei.group_id
    where ei.id = expense_item_claims.expense_item_id
      and public.is_group_member(ei.group_id)
      and (
        expense_item_claims.user_id = auth.uid()
        or e.created_by = auth.uid()
      )
  )
);

drop policy if exists "friend_requests_select_self" on public.friend_requests;
create policy "friend_requests_select_self"
on public.friend_requests
for select
to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friend_requests_insert_requester" on public.friend_requests;
create policy "friend_requests_insert_requester"
on public.friend_requests
for insert
to authenticated
with check (
  auth.uid() = requester_id
  and requester_id <> addressee_id
);

drop policy if exists "friend_requests_update_addressee" on public.friend_requests;
create policy "friend_requests_update_addressee"
on public.friend_requests
for update
to authenticated
using (
  status = 'pending'
  and auth.uid() = addressee_id
)
with check (
  auth.uid() = addressee_id
  and status in ('accepted', 'declined')
  and requester_id <> addressee_id
);

drop policy if exists "friend_requests_update_requester_cancel" on public.friend_requests;
create policy "friend_requests_update_requester_cancel"
on public.friend_requests
for update
to authenticated
using (
  status = 'pending'
  and auth.uid() = requester_id
)
with check (
  auth.uid() = requester_id
  and status = 'canceled'
  and requester_id <> addressee_id
);

drop policy if exists "friendships_select_member" on public.friendships;
create policy "friendships_select_member"
on public.friendships
for select
to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "friendships_insert_member" on public.friendships;
create policy "friendships_insert_member"
on public.friendships
for insert
to authenticated
with check (
  auth.uid() = user_a
  or auth.uid() = user_b
);

drop policy if exists "friendships_delete_member" on public.friendships;
create policy "friendships_delete_member"
on public.friendships
for delete
to authenticated
using (
  auth.uid() = user_a
  or auth.uid() = user_b
);

drop policy if exists "receipt_ocr_requests_select_own" on public.receipt_ocr_requests;
create policy "receipt_ocr_requests_select_own"
on public.receipt_ocr_requests
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "receipt_ocr_requests_insert_own" on public.receipt_ocr_requests;
create policy "receipt_ocr_requests_insert_own"
on public.receipt_ocr_requests
for insert
to authenticated
with check (auth.uid() = user_id);
