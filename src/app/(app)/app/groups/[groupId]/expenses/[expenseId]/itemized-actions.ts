'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ensureProfileAndClient } from '@/lib/auth';
import { recomputeAndPersistItemizedExpense } from '@/lib/itemized-expenses';

export async function claimExpenseItemAction(groupId: string, expenseId: string, expenseItemId: string) {
  const { user, supabase } = await ensureProfileAndClient();

  const { data: item, error: itemError } = await supabase
    .from('expense_items')
    .select(
      `
      id,
      is_shared,
      claims:expense_item_claims (
        user_id
      )
    `,
    )
    .eq('group_id', groupId)
    .eq('expense_id', expenseId)
    .eq('id', expenseItemId)
    .single();

  if (itemError || !item) {
    throw new Error(`Could not load expense item: ${itemError?.message ?? 'Item not found.'}`);
  }

  const existingClaimers = new Set(
    ((item.claims as Array<{ user_id: string }> | null) ?? []).map((claim) => claim.user_id),
  );

  if (!item.is_shared && existingClaimers.size > 0 && !existingClaimers.has(user.id)) {
    throw new Error('This non-shared item is already claimed by another user.');
  }

  const { error: claimError } = await supabase
    .from('expense_item_claims')
    .upsert(
      [
        {
          expense_item_id: expenseItemId,
          user_id: user.id,
          created_by: user.id,
        },
      ],
      { onConflict: 'expense_item_id,user_id', ignoreDuplicates: true },
    );

  if (claimError) {
    throw new Error(`Could not claim item: ${claimError.message}`);
  }

  const synced = await recomputeAndPersistItemizedExpense(supabase, groupId, expenseId);
  if (synced.error) {
    throw new Error(`Could not refresh itemized balances: ${synced.error}`);
  }

  revalidatePath(`/app/groups/${groupId}`);
  revalidatePath(`/app/groups/${groupId}/expenses/${expenseId}`);
  redirect(`/app/groups/${groupId}/expenses/${expenseId}`);
}

export async function unclaimExpenseItemAction(groupId: string, expenseId: string, expenseItemId: string) {
  const { user, supabase } = await ensureProfileAndClient();

  const { error: unclaimError } = await supabase
    .from('expense_item_claims')
    .delete()
    .eq('expense_item_id', expenseItemId)
    .eq('user_id', user.id);

  if (unclaimError) {
    throw new Error(`Could not remove claim: ${unclaimError.message}`);
  }

  const synced = await recomputeAndPersistItemizedExpense(supabase, groupId, expenseId);
  if (synced.error) {
    throw new Error(`Could not refresh itemized balances: ${synced.error}`);
  }

  revalidatePath(`/app/groups/${groupId}`);
  revalidatePath(`/app/groups/${groupId}/expenses/${expenseId}`);
  redirect(`/app/groups/${groupId}/expenses/${expenseId}`);
}
