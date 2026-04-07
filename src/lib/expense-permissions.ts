import type { SupabaseClient } from '@supabase/supabase-js';

function isMissingLeftAtColumnError(message: string | undefined) {
  return (message ?? '').includes('column group_members.left_at does not exist');
}

export async function canUserEditExpense(
  supabase: SupabaseClient,
  groupId: string,
  expenseId: string,
  userId: string,
): Promise<{ allowed: boolean; reason: string | null }> {
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .select('id, created_by')
    .eq('group_id', groupId)
    .eq('id', expenseId)
    .maybeSingle();

  if (expenseError) {
    return { allowed: false, reason: expenseError.message };
  }

  if (!expense) {
    return { allowed: false, reason: 'Expense not found.' };
  }

  if (expense.created_by === userId) {
    return { allowed: true, reason: null };
  }

  let { data: membership, error: membershipError } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();

  if (membershipError && isMissingLeftAtColumnError(membershipError.message)) {
    const fallback = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    membership = fallback.data;
    membershipError = fallback.error;
  }

  if (membershipError) {
    return { allowed: false, reason: membershipError.message };
  }

  if (membership?.role === 'owner') {
    return { allowed: true, reason: null };
  }

  return { allowed: false, reason: "You're not authorized to do this." };
}
