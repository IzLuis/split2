alter table public.expenses
  add column if not exists is_itemized boolean not null default false,
  add column if not exists itemization_status text not null default 'not_itemized',
  add column if not exists assigned_amount_cents integer,
  add column if not exists unassigned_amount_cents integer;

update public.expenses
set
  assigned_amount_cents = coalesce(assigned_amount_cents, total_amount_cents),
  unassigned_amount_cents = coalesce(unassigned_amount_cents, 0);

update public.expenses
set itemization_status = case
  when coalesce(is_itemized, false) = false then 'not_itemized'
  when coalesce(assigned_amount_cents, 0) <= 0 then 'open'
  when coalesce(unassigned_amount_cents, 0) <= 0 then 'fully_assigned'
  else 'partially_assigned'
end;

alter table public.expenses
  alter column assigned_amount_cents set default 0,
  alter column assigned_amount_cents set not null,
  alter column unassigned_amount_cents set default 0,
  alter column unassigned_amount_cents set not null;

alter table public.expenses
  drop constraint if exists expenses_itemization_status_check,
  add constraint expenses_itemization_status_check check (
    itemization_status in ('not_itemized', 'open', 'partially_assigned', 'fully_assigned')
  ),
  drop constraint if exists expenses_assigned_nonnegative_check,
  add constraint expenses_assigned_nonnegative_check check (
    assigned_amount_cents >= 0 and unassigned_amount_cents >= 0
  ),
  drop constraint if exists expenses_assigned_total_consistency_check,
  add constraint expenses_assigned_total_consistency_check check (
    assigned_amount_cents + unassigned_amount_cents = total_amount_cents
  ),
  drop constraint if exists expenses_non_itemized_assignment_check,
  add constraint expenses_non_itemized_assignment_check check (
    is_itemized
    or (
      itemization_status = 'not_itemized'
      and assigned_amount_cents = total_amount_cents
      and unassigned_amount_cents = 0
    )
  ),
  drop constraint if exists expenses_itemized_status_check,
  add constraint expenses_itemized_status_check check (
    (is_itemized and itemization_status in ('open', 'partially_assigned', 'fully_assigned'))
    or ((not is_itemized) and itemization_status = 'not_itemized')
  );

create index if not exists idx_expenses_group_itemization
  on public.expenses(group_id, is_itemized, itemization_status);

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
  foreign key (group_id, created_by) references public.group_members(group_id, user_id)
);

alter table public.expense_items
  drop constraint if exists expense_items_unit_positive_check,
  add constraint expense_items_unit_positive_check check (unit_amount_cents > 0),
  drop constraint if exists expense_items_quantity_positive_check,
  add constraint expense_items_quantity_positive_check check (quantity > 0),
  drop constraint if exists expense_items_line_positive_check,
  add constraint expense_items_line_positive_check check (line_total_cents > 0),
  drop constraint if exists expense_items_line_total_consistency_check,
  add constraint expense_items_line_total_consistency_check check (
    line_total_cents = unit_amount_cents * quantity
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

alter table public.expense_items enable row level security;
alter table public.expense_item_claims enable row level security;

drop trigger if exists set_expense_items_updated_at on public.expense_items;
create trigger set_expense_items_updated_at
before update on public.expense_items
for each row execute procedure public.set_updated_at();

drop policy if exists "expense_items_select_member" on public.expense_items;
create policy "expense_items_select_member"
on public.expense_items
for select
using (public.is_group_member(group_id));

drop policy if exists "expense_items_insert_expense_creator" on public.expense_items;
create policy "expense_items_insert_expense_creator"
on public.expense_items
for insert
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
