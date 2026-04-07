import { ensureProfileAndClient } from '@/lib/auth';
import { canUserEditExpense } from '@/lib/expense-permissions';
import { DEFAULT_EXPENSE_EVENT_COLOR, getGroupExpenseEvents } from '@/lib/expense-events';
import { getGroupMembers } from '@/lib/group-data';
import { getRequestLocale } from '@/lib/i18n/server';
import { emptyItemizedFormItem, loadItemizedInputsForExpense } from '@/lib/itemized-expenses';
import { redirect } from 'next/navigation';
import type { EditExpenseFormState } from './actions';
import { updateExpenseAction } from './actions';
import { EditExpenseForm } from './edit-form';

function centsToString(cents: number) {
  return (cents / 100).toFixed(2);
}

function areItemsAssignedEquallyToAllMembers(
  memberIds: string[],
  items: Array<{ isShared: boolean; assigneeUserIds: string[] }>,
) {
  const normalizedMemberIds = [...new Set(memberIds)].sort();
  if (normalizedMemberIds.length === 0 || items.length === 0) {
    return false;
  }

  const serializedMembers = normalizedMemberIds.join(',');
  return items.every((item) => {
    if (!item.isShared) {
      return false;
    }

    const normalizedAssignees = [...new Set(item.assigneeUserIds)].sort();
    return normalizedAssignees.join(',') === serializedMembers;
  });
}

function getGlobalEqualParticipantIds(
  items: Array<{ isShared: boolean; assigneeUserIds: string[] }>,
) {
  if (items.length === 0) {
    return [] as string[];
  }

  const normalizedByItem = items.map((item) => [...new Set(item.assigneeUserIds)].sort());
  const first = normalizedByItem[0] ?? [];
  if (first.length === 0 || !items.every((item) => item.isShared)) {
    return [] as string[];
  }

  const serialized = first.join(',');
  const allSame = normalizedByItem.every((assignees) => assignees.join(',') === serialized);
  return allSame ? first : [];
}

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
}) {
  const locale = await getRequestLocale();
  const { groupId, expenseId } = await params;
  const { user, supabase } = await ensureProfileAndClient();
  const editPermission = await canUserEditExpense(supabase, groupId, expenseId, user.id);
  if (!editPermission.allowed) {
    redirect(`/app/groups/${groupId}/expenses/${expenseId}`);
  }

  const [members, events, expenseResult] = await Promise.all([
    getGroupMembers(supabase, groupId),
    getGroupExpenseEvents(supabase, groupId),
    supabase
      .from('expenses')
      .select(
        `
        id,
        title,
        description,
        is_itemized,
        subtotal_amount_cents,
        total_amount_cents,
        tip_percentage,
        tip_amount_cents,
        delivery_fee_cents,
        event_id,
        currency,
        expense_date,
        paid_by,
        split_type,
        participants:expense_participants (
          user_id,
          share_amount_cents,
          share_percentage,
          input_amount_cents
        )
      `,
      )
      .eq('group_id', groupId)
      .eq('id', expenseId)
      .maybeSingle(),
  ]);

  if (expenseResult.error) {
    throw new Error(`Could not load expense: ${expenseResult.error?.message ?? 'Unknown error'}`);
  }

  if (!expenseResult.data) {
    redirect(`/app/groups/${groupId}`);
  }

  const expense = expenseResult.data;

  const itemizedInputs = expense.is_itemized
    ? await loadItemizedInputsForExpense(supabase, groupId, expenseId)
    : { error: null, items: [] };

  if (itemizedInputs.error) {
    throw new Error(`Could not load expense items: ${itemizedInputs.error}`);
  }

  const participants: EditExpenseFormState['values']['participants'] = {};
  for (const participant of expense.participants ?? []) {
    participants[participant.user_id] = {
      included: true,
      amount:
        expense.split_type === 'custom'
          ? centsToString(participant.input_amount_cents ?? participant.share_amount_cents)
          : '',
      percentage:
      expense.split_type === 'percentage' ? String(participant.share_percentage ?? '') : '',
    };
  }

  const items: EditExpenseFormState['values']['items'] = expense.is_itemized
    ? itemizedInputs.items.map((item) => ({
        name: item.name,
        unitPrice: centsToString(item.unitAmountCents),
        quantity: String(item.quantity),
        isShared: item.isShared,
        notes: item.notes ?? '',
        assigneeUserIds: item.assigneeUserIds,
      }))
    : [emptyItemizedFormItem()];
  const itemizedEqualSplit = expense.is_itemized
    ? areItemsAssignedEquallyToAllMembers(
      members.map((member) => member.user_id),
      items,
    )
    : false;
  const itemizedEqualParticipantIds = expense.is_itemized ? getGlobalEqualParticipantIds(items) : [];

  const initialState: EditExpenseFormState = {
    success: false,
    message: '',
    timestamp: 0,
    values: {
      title: expense.title,
      description: expense.description ?? '',
      amount: centsToString(expense.subtotal_amount_cents ?? expense.total_amount_cents),
      tipPercentage: String(expense.tip_percentage ?? 0),
      deliveryFee: centsToString(expense.delivery_fee_cents ?? 0),
      currency: expense.currency,
      eventId: expense.event_id ?? '',
      newEventName: '',
      newEventColor: DEFAULT_EXPENSE_EVENT_COLOR,
      expenseDate: expense.expense_date,
      paidBy: expense.paid_by,
      splitType: (expense.is_itemized ? 'custom' : expense.split_type),
      isItemized: expense.is_itemized ?? false,
      itemizedEqualSplit,
      itemizedEqualParticipantIds,
      items,
      participants,
    },
  };

  const boundUpdate = updateExpenseAction.bind(null, groupId, expenseId);

  return (
    <EditExpenseForm
      groupId={groupId}
      expenseId={expenseId}
      updateAction={boundUpdate}
      initialState={initialState}
      members={members}
      availableEvents={events}
      locale={locale}
    />
  );
}
