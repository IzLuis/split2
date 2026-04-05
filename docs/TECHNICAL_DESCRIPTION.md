# Split2 Technical Description

## 1. Purpose
Split2 is a Splitwise-like web app for small social circles (friends, family, roommates, trips) to:
- create groups,
- track shared expenses,
- compute balances,
- record settlements,
- support itemized receipts with claim/unclaim,
- manage a friend list and friend requests.

The current codebase prioritizes MVP correctness, clear flows, and maintainability over heavy abstraction.

## 2. Stack
- Frontend/SSR: Next.js App Router (TypeScript)
- Styling: Tailwind CSS
- Backend/Data/Auth: Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- Database: PostgreSQL (Supabase)
- Auth: Supabase Auth
- Testing: Vitest (domain logic)

## 3. High-Level Architecture
- `src/app/*`: Route pages and UI entry points (server components + client forms)
- `src/app/.../actions.ts`: Server Actions for write operations
- `src/lib/*`: Data access and domain logic
- `src/lib/domain/*`: Pure testable business logic (splits, tips, balances, itemized)
- `supabase/migrations/*`: SQL schema, constraints, and RLS policies

Pattern used:
1. Form submits to a Server Action.
2. Server Action validates and normalizes input.
3. Domain logic computes exact cent-level outputs.
4. Action persists to Supabase.
5. Action returns a typed result (`success/message/...`), client shows toast, then navigates if needed.

## 4. Main Modules

### 4.1 Auth/Profile
- `src/lib/auth.ts` ensures authenticated user and profile existence.
- Profile screen supports editable `full_name` and `username`.

### 4.2 Groups
- Create/edit/delete groups.
- Group settings include default currency and calculation mode (`normal` / `reduced`).
- Member management supports:
  - selecting existing friends,
  - direct email invite for non-registered users (Supabase Auth invite email),
  - pending acceptance state.
- Group membership drives access permissions.

### 4.3 Expenses
Two modes:
1. **Normal expenses** (`equal`, `custom`, `percentage` split)
2. **Itemized expenses** (receipt lines + participant claims)

Shared fields include:
- title, description, date, payer, currency,
- subtotal, tip %, tip amount,
- delivery fee,
- total amount,
- optional event (`event_id`) for grouping.

### 4.4 Balances
- Group balance summary combines:
  - computed participant shares from expenses,
  - settlements.
- Supports two transfer strategies:
  - `normal`
  - `reduced` (optimized fewer transfers)

### 4.5 Settlements
- Records peer-to-peer settlement payments.
- Settlements affect balances without mutating historical expenses.

### 4.6 Friends
- Add by username or email.
- Request lifecycle: `pending -> accepted|declined|canceled`.
- Accepted requests create a canonical friendship pair.
- Friends are used as invite candidates in group create/edit UI.

## 5. Domain Rules and Calculations

## 5.1 Money and Rounding
- All persisted monetary values are integers in cents.
- Domain logic allocates remainders deterministically.

## 5.2 Tip
- Tip is applied proportionally to participant base shares.

## 5.3 Delivery Fee
- Available on all expense types.
- Normal expense: split evenly across selected participants.
- Itemized expense: split evenly across unique users who currently have claimed assigned amounts.
- If nobody is assigned/claimed yet, delivery fee remains part of unassigned total (not silently distributed).

## 5.4 Itemized Assignment
- Itemized expense can be partially assigned.
- Only assigned amounts contribute to balances.
- Unassigned amount stays explicit and visible.
- Status model:
  - `open` (no assigned amount)
  - `partially_assigned`
  - `fully_assigned`
  - `not_itemized`

## 6. Data Model (Core Tables)
- `profiles`
- `groups`
- `group_members`
- `expense_events`
- `expenses`
- `expense_participants`
- `settlements`
- `expense_items`
- `expense_item_claims`
- `friend_requests`
- `friendships`

## 7. Security Model
- Supabase RLS is enabled on core tables.
- Access principle: users only read/write data tied to groups they belong to (or own profile/friend records involving themselves).
- Group owner-only operations (for example, some group mutations) are policy-constrained.

## 8. Key Migrations
- `999_v1_baseline_schema.sql`: one-file fresh-install baseline (current v1 schema, functions, indexes, RLS)
- `001_initial_schema.sql`: Base schema + foundational RLS
- `011_expense_tip_fields.sql`: tip/subtotal support
- `012/013`: participant base share + mutation policies
- `014/015`: itemized schema and member mutation policies
- `016_profiles_username.sql`: profile usernames
- `017_expenses_delivery_fee.sql`: delivery fee field + total consistency check
- `018_friends_system.sql`: friend requests/friendships + RLS
- `019_expense_tags_and_events.sql`: original event grouping feature introduction
- `020_receipt_ocr_rate_limits.sql`: OCR throttle tracking table
- `021_rename_expense_tags_to_events.sql`: internal rename to `expense_events` + `event_id`
- `022_group_member_invite_status.sql`: `invited_at` / `accepted_at` lifecycle
- `023_expenses_delete_owner_policy.sql`: owners can delete all group expenses
- `024_group_members_self_leave_policy.sql`: direct self-leave policy (legacy path)
- `025_group_members_soft_leave.sql`: soft-leave support via `left_at` + active membership semantics
- `026_leave_group_rpc.sql`: secure leave-group RPC

## 9. UI/UX Notes
- Mobile-first form layouts.
- Sticky form values on validation/server errors.
- Toast feedback for create/update/delete flows (Sonner).
- Explicit warning for unresolved itemized balances.
- Pending member badge for invited users who have not accepted yet.
- Role badges:
  - Owner: purple
  - Member: light green

## 10. Testing Strategy
- Unit tests focus on critical pure logic:
  - split calculations,
  - balance settlement correctness,
  - itemized assignment behavior,
  - delivery fee distribution.

## 11. Known Operational Requirement
After pulling latest code, new SQL migrations must be run in Supabase SQL editor (or migration pipeline) before using new features.
