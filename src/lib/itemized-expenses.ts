import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeItemizedExpenseBalances,
  type ItemizedExpenseClaimInput,
  type ItemizedExpenseItemInput,
} from '@/lib/domain/itemized';
import { toCents } from '@/lib/utils';

export type ItemizedFormItemValue = {
  name: string;
  unitPrice: string;
  quantity: string;
  isShared: boolean;
  notes: string;
  assigneeUserIds: string[];
};

export type NormalizedItemizedItem = {
  databaseId?: string;
  sortOrder: number;
  itemKey: string;
  name: string;
  unitAmountCents: number;
  quantity: number;
  lineTotalCents: number;
  isShared: boolean;
  notes: string | null;
  assigneeUserIds: string[];
};

export type ItemizedParticipantRow = {
  user_id: string;
  base_share_amount_cents: number;
  share_amount_cents: number;
  share_percentage: number | null;
  input_amount_cents: number | null;
};

export function emptyItemizedFormItem(): ItemizedFormItemValue {
  return {
    name: '',
    unitPrice: '',
    quantity: '1',
    isShared: false,
    notes: '',
    assigneeUserIds: [],
  };
}

export function parseItemizedItemsFromFormData(formData: FormData): ItemizedFormItemValue[] {
  const rows = new Map<number, ItemizedFormItemValue>();

  for (const [key, value] of formData.entries()) {
    const itemFieldMatch = key.match(/^item_(\d+)_(name|unitPrice|quantity|notes|shared)$/);
    if (itemFieldMatch) {
      const index = Number(itemFieldMatch[1]);
      const field = itemFieldMatch[2];
      const row = rows.get(index) ?? emptyItemizedFormItem();

      if (field === 'name') row.name = String(value ?? '');
      if (field === 'unitPrice') row.unitPrice = String(value ?? '');
      if (field === 'quantity') row.quantity = String(value ?? '');
      if (field === 'notes') row.notes = String(value ?? '');
      if (field === 'shared') row.isShared = true;

      rows.set(index, row);
      continue;
    }

    const assigneeMatch = key.match(/^item_(\d+)_assignee_(.+)$/);
    if (assigneeMatch) {
      const index = Number(assigneeMatch[1]);
      const userId = assigneeMatch[2];
      const row = rows.get(index) ?? emptyItemizedFormItem();
      if (!row.assigneeUserIds.includes(userId)) {
        row.assigneeUserIds.push(userId);
      }
      rows.set(index, row);
    }
  }

  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => ({
      ...row,
      assigneeUserIds: [...new Set(row.assigneeUserIds)],
    }));
}

function isItemizedRowBlank(row: ItemizedFormItemValue) {
  return (
    !row.name.trim() &&
    !row.unitPrice.trim() &&
    !row.quantity.trim() &&
    !row.notes.trim() &&
    row.assigneeUserIds.length === 0 &&
    !row.isShared
  );
}

export function normalizeItemizedFormItems(
  rows: ItemizedFormItemValue[],
  memberIds: Set<string>,
): { items: NormalizedItemizedItem[]; error: string | null } {
  const normalized: NormalizedItemizedItem[] = [];

  for (const [index, row] of rows.entries()) {
    if (isItemizedRowBlank(row)) {
      continue;
    }

    const rowLabel = `Item ${index + 1}`;
    const name = row.name.trim();
    if (!name) {
      return { items: [], error: `${rowLabel}: name is required.` };
    }

    const unitAmountCents = toCents(row.unitPrice);
    if (!unitAmountCents) {
      return { items: [], error: `${rowLabel}: unit price must be greater than 0.` };
    }

    const quantity = Number(row.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { items: [], error: `${rowLabel}: quantity must be a whole number greater than 0.` };
    }

    const assigneeUserIds = [...new Set(row.assigneeUserIds)];
    for (const userId of assigneeUserIds) {
      if (!memberIds.has(userId)) {
        return { items: [], error: `${rowLabel}: one assignee is not in this group.` };
      }
    }

    if (!row.isShared && assigneeUserIds.length > 1) {
      return { items: [], error: `${rowLabel}: non-shared items can only have one assignee.` };
    }

    normalized.push({
      sortOrder: normalized.length,
      itemKey: `item-${normalized.length}`,
      name,
      unitAmountCents,
      quantity,
      lineTotalCents: unitAmountCents * quantity,
      isShared: row.isShared,
      notes: row.notes.trim() || null,
      assigneeUserIds,
    });
  }

  if (normalized.length === 0) {
    return { items: [], error: 'Add at least one line item for an itemized expense.' };
  }

  return { items: normalized, error: null };
}

export function computeItemizedExpenseFromNormalizedItems(
  items: NormalizedItemizedItem[],
  tipPercentage: number,
  deliveryFeeCents: number,
): {
  summary: {
    subtotalAmountCents: number;
    tipAmountCents: number;
    deliveryFeeAmountCents: number;
    totalAmountCents: number;
    assignedAmountCents: number;
    unassignedAmountCents: number;
    itemizationStatus: 'open' | 'partially_assigned' | 'fully_assigned';
    participants: ItemizedParticipantRow[];
  } | null;
  error: string | null;
} {
  const domainItems: ItemizedExpenseItemInput[] = items.map((item) => ({
    itemId: item.itemKey,
    name: item.name,
    unitAmountCents: item.unitAmountCents,
    quantity: item.quantity,
    isShared: item.isShared,
    notes: item.notes,
    sortOrder: item.sortOrder,
  }));

  const claims: ItemizedExpenseClaimInput[] = items.flatMap((item) =>
    item.assigneeUserIds.map((userId) => ({ itemId: item.itemKey, userId })),
  );

  const { result, error } = computeItemizedExpenseBalances(
    domainItems,
    claims,
    tipPercentage,
    deliveryFeeCents,
  );
  if (error || !result) {
    return { summary: null, error: error ?? 'Could not compute itemized shares.' };
  }

  const baseByUser = new Map<string, number>();
  for (const claim of result.claimBreakdown) {
    baseByUser.set(claim.userId, (baseByUser.get(claim.userId) ?? 0) + claim.amountCents);
  }

  const participants: ItemizedParticipantRow[] = result.participantShares.map((share) => ({
    user_id: share.userId,
    base_share_amount_cents: baseByUser.get(share.userId) ?? 0,
    share_amount_cents: share.shareAmountCents,
    share_percentage: null,
    input_amount_cents: null,
  }));

  return {
    error: null,
    summary: {
      subtotalAmountCents: result.subtotalAmountCents,
      tipAmountCents: result.tipAmountCents,
      deliveryFeeAmountCents: result.deliveryFeeAmountCents,
      totalAmountCents: result.totalAmountCents,
      assignedAmountCents: result.assignedAmountCents,
      unassignedAmountCents: result.unassignedAmountCents,
      itemizationStatus: result.status,
      participants,
    },
  };
}

export async function replaceExpenseItemsAndClaims(
  supabase: SupabaseClient,
  params: {
    groupId: string;
    expenseId: string;
    createdBy: string;
    items: NormalizedItemizedItem[];
  },
) {
  const { groupId, expenseId, createdBy, items } = params;

  const { error: deleteError } = await supabase
    .from('expense_items')
    .delete()
    .eq('group_id', groupId)
    .eq('expense_id', expenseId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  const itemRows = items.map((item) => ({
    expense_id: expenseId,
    group_id: groupId,
    name: item.name,
    unit_amount_cents: item.unitAmountCents,
    quantity: item.quantity,
    line_total_cents: item.lineTotalCents,
    is_shared: item.isShared,
    notes: item.notes,
    sort_order: item.sortOrder,
    created_by: createdBy,
  }));

  const { data: insertedItems, error: insertItemsError } = await supabase
    .from('expense_items')
    .insert(itemRows)
    .select('id, sort_order');

  if (insertItemsError) {
    return { error: insertItemsError.message };
  }

  const itemIdBySortOrder = new Map<number, string>();
  for (const row of insertedItems ?? []) {
    itemIdBySortOrder.set(row.sort_order as number, row.id as string);
  }

  const claimRows = items.flatMap((item) => {
    const expenseItemId = itemIdBySortOrder.get(item.sortOrder);
    if (!expenseItemId) return [];

    return item.assigneeUserIds.map((userId) => ({
      expense_item_id: expenseItemId,
      user_id: userId,
      created_by: createdBy,
    }));
  });

  if (claimRows.length === 0) {
    return { error: null };
  }

  const { error: insertClaimsError } = await supabase
    .from('expense_item_claims')
    .insert(claimRows);

  return { error: insertClaimsError?.message ?? null };
}

export async function loadItemizedInputsForExpense(
  supabase: SupabaseClient,
  groupId: string,
  expenseId: string,
) {
  const { data, error } = await supabase
    .from('expense_items')
    .select(
      `
      id,
      name,
      unit_amount_cents,
      quantity,
      line_total_cents,
      is_shared,
      notes,
      sort_order,
      claims:expense_item_claims (
        user_id
      )
    `,
    )
    .eq('group_id', groupId)
    .eq('expense_id', expenseId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return { error: error.message, items: [] as NormalizedItemizedItem[] };
  }

  const items = ((data ?? []) as Array<{
    id: string;
    name: string;
    unit_amount_cents: number;
    quantity: number;
    line_total_cents: number;
    is_shared: boolean;
    notes: string | null;
    sort_order: number;
    claims: Array<{ user_id: string }>;
  }>).map((item, index) => ({
    databaseId: item.id,
    sortOrder: index,
    itemKey: `item-${index}`,
    name: item.name,
    unitAmountCents: item.unit_amount_cents,
    quantity: item.quantity,
    lineTotalCents: item.line_total_cents,
    isShared: item.is_shared,
    notes: item.notes,
    assigneeUserIds: [...new Set((item.claims ?? []).map((claim) => claim.user_id))],
  }));

  return { error: null, items };
}

export async function recomputeAndPersistItemizedExpense(
  supabase: SupabaseClient,
  groupId: string,
  expenseId: string,
) {
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .select('id, is_itemized, tip_percentage, delivery_fee_cents')
    .eq('group_id', groupId)
    .eq('id', expenseId)
    .single();

  if (expenseError || !expense) {
    return { error: expenseError?.message ?? 'Expense not found.', summary: null };
  }

  if (!expense.is_itemized) {
    return { error: 'This expense is not itemized.', summary: null };
  }

  const loaded = await loadItemizedInputsForExpense(supabase, groupId, expenseId);
  if (loaded.error) {
    return { error: loaded.error, summary: null };
  }

  const computed = computeItemizedExpenseFromNormalizedItems(
    loaded.items,
    Number(expense.tip_percentage ?? 0),
    Number(expense.delivery_fee_cents ?? 0),
  );
  if (computed.error || !computed.summary) {
    return { error: computed.error ?? 'Could not compute itemized totals.', summary: null };
  }

  const { error: deleteParticipantsError } = await supabase
    .from('expense_participants')
    .delete()
    .eq('group_id', groupId)
    .eq('expense_id', expenseId);

  if (deleteParticipantsError) {
    return { error: deleteParticipantsError.message, summary: null };
  }

  if (computed.summary.participants.length > 0) {
    const uniqueParticipants = [...new Map(
      computed.summary.participants.map((participant) => [participant.user_id, participant]),
    ).values()];

    const { error: insertParticipantsError } = await supabase.from('expense_participants').upsert(
      uniqueParticipants.map((participant) => ({
        expense_id: expenseId,
        group_id: groupId,
        ...participant,
      })),
      { onConflict: 'expense_id,user_id' },
    );

    if (insertParticipantsError) {
      return { error: insertParticipantsError.message, summary: null };
    }
  }

  const { error: updateExpenseError } = await supabase
    .from('expenses')
    .update({
      is_itemized: true,
      split_type: 'custom',
      itemization_status: computed.summary.itemizationStatus,
      assigned_amount_cents: computed.summary.assignedAmountCents,
      unassigned_amount_cents: computed.summary.unassignedAmountCents,
      subtotal_amount_cents: computed.summary.subtotalAmountCents,
      tip_amount_cents: computed.summary.tipAmountCents,
      delivery_fee_cents: computed.summary.deliveryFeeAmountCents,
      total_amount_cents: computed.summary.totalAmountCents,
    })
    .eq('group_id', groupId)
    .eq('id', expenseId);

  // Non-creators can still claim/unclaim items. In that case we still keep participant
  // balances correct and derive status in UI from participant shares.
  if (updateExpenseError && updateExpenseError.code !== '42501') {
    return { error: updateExpenseError.message, summary: null };
  }

  return { error: null, summary: computed.summary };
}
