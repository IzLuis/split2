-- Seed data for local testing.
-- Replace UUIDs/emails with users that exist in auth.users for your local Supabase.

insert into public.profiles (id, email, full_name)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', 'Alice'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', 'Bob'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com', 'Carol')
on conflict (id) do nothing;

insert into public.groups (id, name, description, created_by)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Apartment', 'Shared apartment costs', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.group_members (group_id, user_id, role, added_by, accepted_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', '11111111-1111-1111-1111-111111111111', now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', '11111111-1111-1111-1111-111111111111', now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member', '11111111-1111-1111-1111-111111111111', now())
on conflict (group_id, user_id) do nothing;

insert into public.expenses (
  id,
  group_id,
  title,
  description,
  total_amount_cents,
  currency,
  expense_date,
  paid_by,
  split_type,
  created_by
)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Groceries',
    'Weekly groceries',
    9000,
    'USD',
    current_date - interval '2 day',
    '11111111-1111-1111-1111-111111111111',
    'equal',
    '11111111-1111-1111-1111-111111111111'
  )
on conflict (id) do nothing;

insert into public.expense_participants (
  expense_id,
  group_id,
  user_id,
  share_amount_cents,
  share_percentage,
  input_amount_cents
)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 3000, null, null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 3000, null, null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 3000, null, null)
on conflict (expense_id, user_id) do nothing;

insert into public.settlements (
  id,
  group_id,
  payer_id,
  receiver_id,
  amount_cents,
  currency,
  settled_on,
  note,
  created_by
)
values
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    1000,
    'USD',
    current_date - interval '1 day',
    'Partial repayment',
    '22222222-2222-2222-2222-222222222222'
  )
on conflict (id) do nothing;
