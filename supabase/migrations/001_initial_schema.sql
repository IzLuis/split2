create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  description text,
  total_amount_cents integer not null check (total_amount_cents > 0),
  currency char(3) not null,
  expense_date date not null,
  paid_by uuid not null,
  split_type text not null check (split_type in ('equal', 'custom', 'percentage')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id),
  foreign key (group_id, paid_by) references public.group_members(group_id, user_id)
);

create table if not exists public.expense_participants (
  expense_id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  share_amount_cents integer not null check (share_amount_cents >= 0),
  share_percentage numeric(6, 3),
  input_amount_cents integer,
  created_at timestamptz not null default now(),
  primary key (expense_id, user_id),
  foreign key (expense_id, group_id) references public.expenses(id, group_id) on delete cascade,
  foreign key (group_id, user_id) references public.group_members(group_id, user_id)
);

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

create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_expenses_group_date on public.expenses(group_id, expense_date desc, created_at desc);
create index if not exists idx_expense_participants_group_user on public.expense_participants(group_id, user_id);
create index if not exists idx_settlements_group_date on public.settlements(group_id, settled_on desc, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      updated_at = now();
  return new;
end;
$$;

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

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.settlements enable row level security;

create policy "profiles_select_authenticated"
on public.profiles
for select
using (auth.role() = 'authenticated');

create policy "profiles_update_self"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "groups_select_member"
on public.groups
for select
using (public.is_group_member(id));

create policy "groups_insert_creator"
on public.groups
for insert
with check (created_by = auth.uid());

create policy "groups_update_owner"
on public.groups
for update
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

create policy "group_members_select_member"
on public.group_members
for select
using (public.is_group_member(group_id));

create policy "group_members_insert_owner_or_self"
on public.group_members
for insert
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  )
);

create policy "group_members_delete_owner"
on public.group_members
for delete
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  )
);

create policy "expenses_select_member"
on public.expenses
for select
using (public.is_group_member(group_id));

create policy "expenses_insert_member"
on public.expenses
for insert
with check (
  created_by = auth.uid()
  and public.is_group_member(group_id)
);

create policy "expenses_update_creator"
on public.expenses
for update
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "expense_participants_select_member"
on public.expense_participants
for select
using (public.is_group_member(group_id));

create policy "expense_participants_insert_member"
on public.expense_participants
for insert
with check (public.is_group_member(group_id));

create policy "settlements_select_member"
on public.settlements
for select
using (public.is_group_member(group_id));

create policy "settlements_insert_member"
on public.settlements
for insert
with check (
  created_by = auth.uid()
  and public.is_group_member(group_id)
);
