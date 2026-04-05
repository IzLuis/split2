create table if not exists public.receipt_ocr_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists receipt_ocr_requests_user_created_idx
  on public.receipt_ocr_requests (user_id, created_at desc);

alter table public.receipt_ocr_requests enable row level security;

drop policy if exists "receipt_ocr_requests_select_own" on public.receipt_ocr_requests;
create policy "receipt_ocr_requests_select_own"
on public.receipt_ocr_requests
for select
using (auth.uid() = user_id);

drop policy if exists "receipt_ocr_requests_insert_own" on public.receipt_ocr_requests;
create policy "receipt_ocr_requests_insert_own"
on public.receipt_ocr_requests
for insert
with check (auth.uid() = user_id);
