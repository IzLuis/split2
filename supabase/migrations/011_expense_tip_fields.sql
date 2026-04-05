alter table public.expenses
  add column if not exists subtotal_amount_cents integer,
  add column if not exists tip_percentage numeric(6, 3),
  add column if not exists tip_amount_cents integer;

update public.expenses
set
  subtotal_amount_cents = coalesce(subtotal_amount_cents, total_amount_cents),
  tip_percentage = coalesce(tip_percentage, 0),
  tip_amount_cents = coalesce(tip_amount_cents, 0);

alter table public.expenses
  alter column subtotal_amount_cents set not null,
  alter column tip_percentage set not null,
  alter column tip_amount_cents set not null,
  alter column tip_percentage set default 0,
  alter column tip_amount_cents set default 0;

alter table public.expenses
  drop constraint if exists expenses_subtotal_positive_check,
  add constraint expenses_subtotal_positive_check check (subtotal_amount_cents > 0),
  drop constraint if exists expenses_tip_nonnegative_check,
  add constraint expenses_tip_nonnegative_check check (tip_amount_cents >= 0 and tip_percentage >= 0),
  drop constraint if exists expenses_total_consistency_check,
  add constraint expenses_total_consistency_check check (total_amount_cents = subtotal_amount_cents + tip_amount_cents);
