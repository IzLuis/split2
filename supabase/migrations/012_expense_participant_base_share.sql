alter table public.expense_participants
  add column if not exists base_share_amount_cents integer;

update public.expense_participants ep
set base_share_amount_cents = coalesce(base_share_amount_cents, ep.share_amount_cents)
where base_share_amount_cents is null;

alter table public.expense_participants
  alter column base_share_amount_cents set not null,
  drop constraint if exists expense_participants_base_share_nonnegative_check,
  add constraint expense_participants_base_share_nonnegative_check check (base_share_amount_cents >= 0);
