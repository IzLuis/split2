# Split2 MVP

Simple Splitwise-like app for personal/shared expenses, built for a strong, maintainable MVP.

## Stack
- Frontend: Next.js App Router + TypeScript
- UI: Tailwind CSS
- Backend/Auth/DB: Supabase + PostgreSQL + Supabase Auth
- Deployment target: Vercel

## Architecture Summary
- `Next.js App Router` server components for data reads and page rendering.
- `Server Actions` for writes (auth, create group, create expense, create settlement).
- `Supabase RLS` as first-class security boundary.
- `Domain logic` extracted in `src/lib/domain`:
  - `balances.ts` for owes/owed/net calculations
  - `splits.ts` for equal/custom/percentage split validation + share computation
- `Normalized schema` with foreign keys to preserve consistency and auditable history.

## Folder Structure
```txt
src/
  app/
    (auth)/login/
      actions.ts
      page.tsx
    (app)/
      layout.tsx
      app/
        page.tsx
        actions.ts
        groups/
          new/
            actions.ts
            page.tsx
          [groupId]/
            page.tsx
            expenses/
              new/
                actions.ts
                expense-form.tsx
                page.tsx
              [expenseId]/
                page.tsx
            settlements/
              new/
                actions.ts
                settlement-form.tsx
                page.tsx
  components/
    action-toast.tsx
    app-toaster.tsx
    form-submit.tsx
  lib/
    action-result.ts
    auth.ts
    expense-events.ts
    group-invitations.ts
    group-data.ts
    utils.ts
    validation.ts
    types.ts
    domain/
      balances.ts
      balances.test.ts
      splits.ts
      splits.test.ts
    supabase/
      admin.ts
      client.ts
      server.ts
      middleware.ts
middleware.ts
supabase/
  migrations/
    001_initial_schema.sql
  seed.sql
```

## Database Schema / SQL
- Migration: `supabase/migrations/001_initial_schema.sql`
- Includes:
  - Tables: `profiles`, `groups`, `group_members`, `expenses`, `expense_participants`, `settlements`
  - FK constraints for member consistency and auditable event history
  - Triggers:
    - `handle_new_user` to upsert `profiles` from `auth.users`
    - `set_updated_at`
  - RLS enabled on all app tables
  - Policies to restrict reads/writes to authorized users and group members

## Entity Relationships
- `profiles (id)` 1:N `group_members.user_id`
- `groups (id)` 1:N `group_members.group_id`
- `groups (id)` 1:N `expenses.group_id`
- `expenses (id, group_id)` 1:N `expense_participants.expense_id`
- `groups (id)` 1:N `settlements.group_id`
- `expenses.paid_by` and `settlements.payer_id/receiver_id` must be valid members of that group

## Environment Variables
Create `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_OCR_MODEL=gpt-4.1-mini
OPENAI_OCR_COOLDOWN_SECONDS=20
OPENAI_OCR_DAILY_LIMIT=30
```

(Template file is included as `.env.example`.)

## Local Setup
1. Install deps:
```bash
npm install
```

2. Run SQL migration in Supabase SQL editor:
- Fresh install (recommended): run only:
  - `supabase/migrations/999_v1_baseline_schema.sql`
- Existing installs already using incremental migrations:
  - keep using `supabase/migrations/001` through the latest migration as needed.
  - historical migration files are kept for audit/history and upgrade continuity.

3. (Optional) seed sample data:
- `supabase/seed.sql`

4. Start app:
```bash
npm run dev
```

5. Quality checks:
```bash
npm run lint
npm run test
npm run build -- --webpack
```

## Seed Data
- File: `supabase/seed.sql`
- Includes sample profiles, one group, members, one expense with participants, and one settlement.
- Replace UUIDs/emails with users that exist in your Supabase auth instance if needed.

## MVP Features Implemented
- Authentication: sign up/sign in/sign out, persistent sessions via Supabase middleware.
- Groups: create group, add existing users by email, list user groups.
- Group management: edit group settings, member leave-group option (non-owner), and owner-only group delete.
- Expenses: create expense with:
  - title/description
  - total amount
  - currency
  - date
  - paid by
  - participants
  - split type (`equal`, `custom`, `percentage`)
- Expense management: edit expense and delete expense.
- Split validation:
  - custom amounts must equal total
  - percentages must total 100
- Balances:
  - net per member
  - pairwise “A owes B” statements
- Settlements: record payments that offset balances without mutating expenses.
- Toast notifications (Sonner): success/error feedback for group/expense/settlement writes.
- Typed Server Action responses for writes: `{ success, message, ... }` used by client to trigger toasts.
- Invite flow:
  - group member add forms support direct email invites
  - if email does not exist, the app creates a placeholder profile and sends Supabase invite email
  - group members show a **Pending** badge until invite acceptance is completed
- History:
  - group expense list
  - expense detail page
  - settlement history in group page
- OCR receipt parsing:
  - upload a receipt image in create/edit expense
  - auto-prefill itemized line items, date, currency, subtotal, tip %, and delivery fee
  - detects whether tax is already included (for example, receipts that say `IVA incluido`)
  - only maps tax into delivery fee when tax is not included
  - totals are normalized so extracted items + adjustments align with receipt total when possible
- OCR cost guards:
  - client-side cooldown on scan button to reduce accidental double submits
  - server-side per-user cooldown (`OPENAI_OCR_COOLDOWN_SECONDS`)
  - server-side per-user daily cap (`OPENAI_OCR_DAILY_LIMIT`)
  - usage tracked in `receipt_ocr_requests` for auditable throttling
- Responsive UI for mobile/desktop with clear forms and basic empty/error states.
- UI naming:
  - internal code and user-facing text both use **Event**
- Localization:
  - bilingual UI support (English + Spanish)
  - Spanish copy is tuned for Mexican/Latin American usage
  - locale follows browser/system language through `Accept-Language` (server) and document locale (client)
- Motion polish:
  - Events dropdown uses a smooth accordion-style reveal/collapse animation (respects reduced-motion)
  - subtle hover-lift motion on key group/expense cards

## OCR Flow (OpenAI)
1. User uploads receipt image in expense create/edit screen.
2. Browser sends file to `POST /api/ocr/receipt`.
3. Server route enforces auth + cooldown + daily cap.
4. Server calls OpenAI Responses API (`OPENAI_OCR_MODEL`) with image input.
5. Parsed JSON is validated/normalized and returned as a draft.
6. Form is prefilled, and user must review/edit before saving.
7. Balances are only affected after final expense save.

## Tests
- `src/lib/domain/balances.test.ts`
- `src/lib/domain/splits.test.ts`

These validate core business logic for reliable balance/split behavior.

## Notes / MVP Constraints
- Currency conversion is out of scope; balances are shown using stored currency values.

## Short Roadmap (Post-MVP)
1. Editing + soft-delete with immutable audit events
2. Invitation flow for non-registered emails
3. Per-group default currency and mixed-currency handling rules
4. Better status feedback (toasts) + optimistic UI polish
5. Recurring expenses
6. Export (CSV/PDF)
7. E2E tests for core user flows
