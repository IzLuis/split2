import { calculateGroupBalances } from '@/lib/domain/balances';
import type { ExpenseWithParticipants, GroupMember, SettlementWithProfiles } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

type GroupListItem = {
  id: string;
  name: string;
  description: string | null;
  default_currency: string;
  calculation_mode: 'normal' | 'reduced';
  created_at: string;
  role: 'owner' | 'member';
};

function isMissingLeftAtColumnError(message: string | undefined) {
  return (message ?? '').includes('column group_members.left_at does not exist');
}

export async function getUserGroups(
  supabase: SupabaseClient,
  userId: string,
): Promise<GroupListItem[]> {
  const baseQuery = supabase
    .from('group_members')
    .select(
      `
      group_id,
      role,
      groups (
        id,
        name,
        description,
        default_currency,
        calculation_mode,
        created_at
      )
    `,
    );
  let { data, error } = await baseQuery
    .eq('user_id', userId)
    .is('left_at', null)
    .order('created_at', { foreignTable: 'groups', ascending: false });

  if (error && isMissingLeftAtColumnError(error.message)) {
    const fallback = await supabase
      .from('group_members')
      .select(
        `
        group_id,
        role,
        groups (
          id,
          name,
          description,
          default_currency,
          calculation_mode,
          created_at
        )
      `,
      )
      .eq('user_id', userId)
      .order('created_at', { foreignTable: 'groups', ascending: false });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(`Could not load groups: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;

    return {
      id: group?.id as string,
      name: group?.name as string,
      description: (group?.description as string | null) ?? null,
      default_currency: (group?.default_currency as string) ?? 'USD',
      calculation_mode: (group?.calculation_mode as 'normal' | 'reduced') ?? 'normal',
      created_at: group?.created_at as string,
      role: row.role as 'owner' | 'member',
    };
  });
}

export async function getGroupMembers(
  supabase: SupabaseClient,
  groupId: string,
): Promise<GroupMember[]> {
  const baseQuery = supabase
    .from('group_members')
    .select(
      `
      user_id,
      role,
      invited_at,
      accepted_at,
      profiles!group_members_user_id_fkey (
        full_name,
        email
      )
    `,
    );

  let { data, error } = await baseQuery
    .eq('group_id', groupId)
    .is('left_at', null)
    .order('created_at', { ascending: true });

  if (error && isMissingLeftAtColumnError(error.message)) {
    const fallback = await supabase
      .from('group_members')
      .select(
        `
        user_id,
        role,
        invited_at,
        accepted_at,
        profiles!group_members_user_id_fkey (
          full_name,
          email
        )
      `,
      )
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(`Could not load group members: ${error.message}`);
  }

  return (data ?? []).map((member) => ({
    user_id: member.user_id as string,
    role: member.role as 'owner' | 'member',
    invited_at: (member.invited_at as string | null) ?? null,
    accepted_at: (member.accepted_at as string | null) ?? null,
    profiles: Array.isArray(member.profiles)
      ? (member.profiles[0] as { full_name: string | null; email: string } | undefined) ?? null
      : (member.profiles as { full_name: string | null; email: string } | null),
  }));
}

export async function getGroup(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, description, default_currency, calculation_mode, created_at')
    .eq('id', groupId)
    .maybeSingle();

  if (error) {
    throw new Error(`Group not found: ${error.message}`);
  }

  return data;
}

export async function getGroupExpenses(
  supabase: SupabaseClient,
  groupId: string,
): Promise<ExpenseWithParticipants[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(
      `
      id,
      title,
      description,
      is_itemized,
      itemization_status,
      assigned_amount_cents,
      unassigned_amount_cents,
      subtotal_amount_cents,
      total_amount_cents,
      tip_percentage,
      tip_amount_cents,
      delivery_fee_cents,
      currency,
      expense_date,
      paid_by,
      split_type,
      event:expense_events!expenses_event_id_fkey (
        id,
        name,
        color
      ),
      created_at,
      participants:expense_participants (
        user_id,
        base_share_amount_cents,
        share_amount_cents,
        share_percentage,
        input_amount_cents
      )
    `,
    )
    .eq('group_id', groupId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Could not load expenses: ${error.message}`);
  }

  return ((data ?? []) as Array<ExpenseWithParticipants & { event: ExpenseWithParticipants['event'] | ExpenseWithParticipants['event'][] }>).map(
    (expense) => ({
      ...expense,
      event: Array.isArray(expense.event) ? expense.event[0] ?? null : expense.event,
    }),
  );
}

export async function getGroupSettlements(
  supabase: SupabaseClient,
  groupId: string,
): Promise<SettlementWithProfiles[]> {
  const { data, error } = await supabase
    .from('settlements')
    .select(
      `
      id,
      amount_cents,
      currency,
      settled_on,
      note,
      created_at,
      payer_id,
      receiver_id
    `,
    )
    .eq('group_id', groupId)
    .order('settled_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Could not load settlements: ${error.message}`);
  }

  return (data ?? []) as SettlementWithProfiles[];
}

export async function getGroupBalanceSummary(
  supabase: SupabaseClient,
  groupId: string,
  mode: 'normal' | 'reduced' = 'normal',
) {
  const expenses = await getGroupExpenses(supabase, groupId);
  const settlements = await getGroupSettlements(supabase, groupId);

  const result = calculateGroupBalances(
    expenses.map((expense) => ({
      id: expense.id,
      paidBy: expense.paid_by,
      totalAmountCents: expense.total_amount_cents,
      splits: expense.participants.map((participant) => ({
        userId: participant.user_id,
        amountCents: participant.share_amount_cents,
      })),
    })),
    settlements.map((settlement) => ({
      payerId: settlement.payer_id,
      receiverId: settlement.receiver_id,
      amountCents: settlement.amount_cents,
    })),
    mode,
  );

  return {
    ...result,
    expenses,
    settlements,
  };
}
