-- 018_friends_system.sql
-- Purpose:
-- 1) Add friend request workflow tables.
-- 2) Add canonical friendships table (ordered pair).
-- 3) Protect access with RLS so users only manage their own relationships.

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

-- RLS
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "friend_requests_select_self" on public.friend_requests;
create policy "friend_requests_select_self"
on public.friend_requests
for select
using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friend_requests_insert_requester" on public.friend_requests;
create policy "friend_requests_insert_requester"
on public.friend_requests
for insert
with check (
  auth.uid() = requester_id
  and requester_id <> addressee_id
);

drop policy if exists "friend_requests_update_addressee" on public.friend_requests;
create policy "friend_requests_update_addressee"
on public.friend_requests
for update
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
using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "friendships_insert_member" on public.friendships;
create policy "friendships_insert_member"
on public.friendships
for insert
with check (
  auth.uid() = user_a
  or auth.uid() = user_b
);

drop policy if exists "friendships_delete_member" on public.friendships;
create policy "friendships_delete_member"
on public.friendships
for delete
using (
  auth.uid() = user_a
  or auth.uid() = user_b
);
