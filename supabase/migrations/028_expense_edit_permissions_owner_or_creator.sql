-- Restrict expense editing to expense creator or active group owner.
-- Also allow owners/creators to rebuild itemized claims for all members.

alter table public.expenses enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_participants enable row level security;
alter table public.expense_item_claims enable row level security;
alter table public.group_members add column if not exists left_at timestamptz;

drop policy if exists "expenses_update_member" on public.expenses;
drop policy if exists "expenses_update_creator" on public.expenses;
drop policy if exists "expenses_update_creator_or_owner" on public.expenses;
create policy "expenses_update_creator_or_owner"
on public.expenses
for update
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
)
with check (
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

drop policy if exists "expense_items_insert_expense_creator" on public.expense_items;
drop policy if exists "expense_items_update_expense_creator" on public.expense_items;
drop policy if exists "expense_items_delete_expense_creator" on public.expense_items;
drop policy if exists "expense_items_insert_member" on public.expense_items;
drop policy if exists "expense_items_update_member" on public.expense_items;
drop policy if exists "expense_items_delete_member" on public.expense_items;
drop policy if exists "expense_items_insert_creator_or_owner" on public.expense_items;
drop policy if exists "expense_items_update_creator_or_owner" on public.expense_items;
drop policy if exists "expense_items_delete_creator_or_owner" on public.expense_items;

create policy "expense_items_insert_creator_or_owner"
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
      and (
        e.created_by = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = auth.uid()
            and gm.role = 'owner'
            and gm.left_at is null
        )
      )
  )
);

create policy "expense_items_update_creator_or_owner"
on public.expense_items
for update
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
      and (
        e.created_by = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = auth.uid()
            and gm.role = 'owner'
            and gm.left_at is null
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
      and (
        e.created_by = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = auth.uid()
            and gm.role = 'owner'
            and gm.left_at is null
        )
      )
  )
);

create policy "expense_items_delete_creator_or_owner"
on public.expense_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_items.expense_id
      and e.group_id = expense_items.group_id
      and (
        e.created_by = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = auth.uid()
            and gm.role = 'owner'
            and gm.left_at is null
        )
      )
  )
);

drop policy if exists "expense_participants_insert_member" on public.expense_participants;
drop policy if exists "expense_participants_update_expense_creator" on public.expense_participants;
drop policy if exists "expense_participants_delete_expense_creator" on public.expense_participants;
drop policy if exists "expense_participants_update_itemized_member" on public.expense_participants;
drop policy if exists "expense_participants_delete_itemized_member" on public.expense_participants;
drop policy if exists "expense_participants_update_member" on public.expense_participants;
drop policy if exists "expense_participants_delete_member" on public.expense_participants;
drop policy if exists "expense_participants_insert_creator_or_owner" on public.expense_participants;
drop policy if exists "expense_participants_update_creator_or_owner" on public.expense_participants;
drop policy if exists "expense_participants_delete_creator_or_owner" on public.expense_participants;

create policy "expense_participants_insert_creator_or_owner"
on public.expense_participants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and (
        e.created_by = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = auth.uid()
            and gm.role = 'owner'
            and gm.left_at is null
        )
      )
  )
);

create policy "expense_participants_update_creator_or_owner"
on public.expense_participants
for update
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and (
        e.created_by = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = auth.uid()
            and gm.role = 'owner'
            and gm.left_at is null
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and (
        e.created_by = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = auth.uid()
            and gm.role = 'owner'
            and gm.left_at is null
        )
      )
  )
);

create policy "expense_participants_delete_creator_or_owner"
on public.expense_participants
for delete
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_participants.expense_id
      and e.group_id = expense_participants.group_id
      and (
        e.created_by = auth.uid()
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = e.group_id
            and gm.user_id = auth.uid()
            and gm.role = 'owner'
            and gm.left_at is null
        )
      )
  )
);

drop policy if exists "expense_item_claims_insert_member_or_creator" on public.expense_item_claims;
drop policy if exists "expense_item_claims_insert_self_creator_or_owner" on public.expense_item_claims;
create policy "expense_item_claims_insert_self_creator_or_owner"
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
        or exists (
          select 1
          from public.group_members gm_owner
          where gm_owner.group_id = ei.group_id
            and gm_owner.user_id = auth.uid()
            and gm_owner.role = 'owner'
            and gm_owner.left_at is null
        )
      )
  )
);
