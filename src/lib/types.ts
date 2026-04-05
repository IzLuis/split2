export type SplitType = 'equal' | 'custom' | 'percentage';
export type ItemizationStatus = 'not_itemized' | 'open' | 'partially_assigned' | 'fully_assigned';

export type ExpenseEvent = {
  id: string;
  name: string;
  color: string;
};

export type GroupMember = {
  user_id: string;
  role: 'owner' | 'member';
  invited_at: string | null;
  accepted_at: string | null;
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
};

export type ExpenseWithParticipants = {
  id: string;
  title: string;
  description: string | null;
  is_itemized: boolean;
  itemization_status: ItemizationStatus;
  assigned_amount_cents: number;
  unassigned_amount_cents: number;
  subtotal_amount_cents: number;
  total_amount_cents: number;
  tip_percentage: number;
  tip_amount_cents: number;
  delivery_fee_cents: number;
  currency: string;
  expense_date: string;
  paid_by: string;
  split_type: SplitType;
  event: ExpenseEvent | null;
  created_at: string;
  participants: Array<{
    user_id: string;
    base_share_amount_cents: number;
    share_amount_cents: number;
    share_percentage: number | null;
    input_amount_cents: number | null;
  }>;
};

export type SettlementWithProfiles = {
  id: string;
  amount_cents: number;
  currency: string;
  settled_on: string;
  note: string | null;
  created_at: string;
  payer_id: string;
  receiver_id: string;
};

export type ExpenseItemWithClaims = {
  id: string;
  expense_id: string;
  group_id: string;
  name: string;
  unit_amount_cents: number;
  quantity: number;
  line_total_cents: number;
  is_shared: boolean;
  notes: string | null;
  sort_order: number;
  claims: Array<{
    user_id: string;
    created_by: string;
  }>;
};
