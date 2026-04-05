alter table public.groups
  add column if not exists default_currency char(3) not null default 'USD',
  add column if not exists calculation_mode text not null default 'normal';

alter table public.groups
  drop constraint if exists groups_default_currency_check,
  add constraint groups_default_currency_check check (default_currency in ('USD', 'MXN'));

alter table public.groups
  drop constraint if exists groups_calculation_mode_check,
  add constraint groups_calculation_mode_check check (calculation_mode in ('normal', 'reduced'));
