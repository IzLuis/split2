-- 017_expenses_delivery_fee.sql
-- Purpose:
-- 1) Add delivery_fee_cents to expenses.
-- 2) Backfill existing rows safely.
-- 3) Enforce non-negative fee and total consistency:
--    total = subtotal + tip + delivery fee.

alter table public.expenses
  add column if not exists delivery_fee_cents integer;

-- Backfill rows created before delivery fee existed.
update public.expenses
set delivery_fee_cents = coalesce(delivery_fee_cents, 0)
where delivery_fee_cents is null;

-- Ensure defaults/constraints are explicit for future writes.
alter table public.expenses
  alter column delivery_fee_cents set not null,
  alter column delivery_fee_cents set default 0;

alter table public.expenses
  drop constraint if exists expenses_delivery_fee_nonnegative_check,
  add constraint expenses_delivery_fee_nonnegative_check check (delivery_fee_cents >= 0),
  drop constraint if exists expenses_total_consistency_check,
  add constraint expenses_total_consistency_check check (
    total_amount_cents = subtotal_amount_cents + tip_amount_cents + delivery_fee_cents
  );
