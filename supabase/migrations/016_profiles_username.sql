alter table public.profiles
  add column if not exists username text;

update public.profiles
set username = nullif(lower(trim(username)), '')
where username is not null;

alter table public.profiles
  drop constraint if exists profiles_username_format_check,
  add constraint profiles_username_format_check check (
    username is null
    or username ~ '^[a-z0-9_]{3,30}$'
  ),
  drop constraint if exists profiles_username_lowercase_check,
  add constraint profiles_username_lowercase_check check (
    username is null
    or username = lower(username)
  );

create unique index if not exists idx_profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;
