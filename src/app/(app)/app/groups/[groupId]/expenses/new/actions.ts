'use server';

import { revalidatePath } from 'next/cache';
import { buildActionResult, type ActionResult } from '@/lib/action-result';
import { ensureProfileAndClient } from '@/lib/auth';
import { computeShares } from '@/lib/domain/splits';
import { applyEvenFeeToShares, applyTipToShares, parseTipPercentage } from '@/lib/domain/tips';
import { resolveExpenseEventForSave } from '@/lib/expense-events';
import { getGroupMembers } from '@/lib/group-data';
import {
  emptyItemizedFormItem,
  parseItemizedItemsFromFormData,
  normalizeItemizedFormItems,
  computeItemizedExpenseFromNormalizedItems,
  replaceExpenseItemsAndClaims,
} from '@/lib/itemized-expenses';
import type { SplitType } from '@/lib/types';
import { toCents, toNonNegativeCents } from '@/lib/utils';
import { createExpenseSchema } from '@/lib/validation';

export type CreateExpenseFormState = {
  title: string;
  description: string;
  amount: string;
  tipPercentage: string;
  deliveryFee: string;
  currency: string;
  eventId: string;
  newEventName: string;
  newEventColor: string;
  expenseDate: string;
  paidBy: string;
  splitType: SplitType;
  isItemized: boolean;
  items: Array<{
    name: string;
    unitPrice: string;
    quantity: string;
    isShared: boolean;
    notes: string;
    assigneeUserIds: string[];
  }>;
  participants: Record<
    string,
    {
      included: boolean;
      amount: string;
      percentage: string;
    }
  >;
};

export type CreateExpenseActionState = ActionResult<CreateExpenseFormState>;

function toFriendlyWriteError(error: { message: string; code?: string | null } | null | undefined) {
  if (!error) {
    return 'Request failed.';
  }

  if (
    error.code === '42501'
    || error.message.includes('row-level security policy')
    || error.message.toLowerCase().includes('permission denied')
  ) {
    return "You're not authorized to do this.";
  }

  return error.message;
}

function toFriendlyWriteErrorMessage(message: string) {
  if (
    message.includes('row-level security policy')
    || message.toLowerCase().includes('permission denied')
  ) {
    return "You're not authorized to do this.";
  }
  return message;
}

function getRawValues(formData: FormData): CreateExpenseFormState {
  const participants: CreateExpenseFormState['participants'] = {};

  for (const [key, value] of formData.entries()) {
    const match = key.match(/^participant_(.+)_(included|amount|percentage)$/);
    if (!match) {
      continue;
    }

    const userId = match[1];
    const field = match[2];
    const previous = participants[userId] ?? { included: false, amount: '', percentage: '' };
    const next = { ...previous };

    if (field === 'included') {
      next.included = true;
    }
    if (field === 'amount') {
      next.amount = String(value ?? '');
    }
    if (field === 'percentage') {
      next.percentage = String(value ?? '');
    }

    participants[userId] = next;
  }

  const itemizedItems = parseItemizedItemsFromFormData(formData);

  return {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    amount: String(formData.get('amount') ?? ''),
    tipPercentage: String(formData.get('tipPercentage') ?? ''),
    deliveryFee: String(formData.get('deliveryFee') ?? ''),
    currency: String(formData.get('currency') ?? 'MXN'),
    eventId: String(formData.get('eventId') ?? ''),
    newEventName: String(formData.get('newEventName') ?? ''),
    newEventColor: String(formData.get('newEventColor') ?? ''),
    expenseDate: String(formData.get('expenseDate') ?? ''),
    paidBy: String(formData.get('paidBy') ?? ''),
    splitType: (String(formData.get('splitType') ?? 'equal') as SplitType),
    isItemized: formData.get('isItemized') === 'on',
    items: itemizedItems.length > 0 ? itemizedItems : [emptyItemizedFormItem()],
    participants,
  };
}

export async function createExpenseAction(
  _prevState: CreateExpenseActionState,
  formData: FormData,
): Promise<CreateExpenseActionState> {
  const rawValues = getRawValues(formData);

  const validated = createExpenseSchema.safeParse({
    groupId: formData.get('groupId'),
    title: rawValues.title,
    description: rawValues.description || undefined,
    amount: rawValues.isItemized ? '1' : rawValues.amount,
    tipPercentage: rawValues.tipPercentage,
    deliveryFee: rawValues.deliveryFee,
    currency: rawValues.currency,
    expenseDate: rawValues.expenseDate,
    paidBy: rawValues.paidBy,
    splitType: rawValues.isItemized ? 'custom' : rawValues.splitType,
  });

  if (!validated.success) {
    return buildActionResult({
      success: false,
      message: validated.error.issues[0]?.message ?? 'Invalid expense form.',
      values: rawValues,
    });
  }

  const { user, supabase } = await ensureProfileAndClient();
  const groupId = validated.data.groupId;

  const tipParsed = parseTipPercentage(rawValues.tipPercentage);
  if (tipParsed.error) {
    return buildActionResult({ success: false, message: tipParsed.error, values: rawValues });
  }

  const deliveryFeeCents = toNonNegativeCents(rawValues.deliveryFee);
  if (deliveryFeeCents === null) {
    return buildActionResult({
      success: false,
      message: 'Delivery fee must be 0 or greater.',
      values: rawValues,
    });
  }

  const members = await getGroupMembers(supabase, groupId);
  const memberIds = new Set(members.map((member) => member.user_id));

  if (!memberIds.has(validated.data.paidBy)) {
    return buildActionResult({
      success: false,
      message: 'Payer must be a group member.',
      values: rawValues,
    });
  }

  const resolvedEvent = await resolveExpenseEventForSave(supabase, {
    groupId,
    userId: user.id,
    selectedEventId: rawValues.eventId,
    newEventName: rawValues.newEventName,
    newEventColor: rawValues.newEventColor,
  });
  if (resolvedEvent.error) {
    return buildActionResult({
      success: false,
      message: resolvedEvent.error,
      values: rawValues,
    });
  }

  if (rawValues.isItemized) {
    const normalized = normalizeItemizedFormItems(rawValues.items, memberIds);
    if (normalized.error) {
      return buildActionResult({ success: false, message: normalized.error, values: rawValues });
    }

    const computed = computeItemizedExpenseFromNormalizedItems(
      normalized.items,
      tipParsed.value,
      deliveryFeeCents,
    );
    if (computed.error || !computed.summary) {
      return buildActionResult({
        success: false,
        message: computed.error ?? 'Could not compute itemized shares.',
        values: rawValues,
      });
    }

    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        group_id: groupId,
        title: validated.data.title,
        description: validated.data.description || null,
        is_itemized: true,
        itemization_status: computed.summary.itemizationStatus,
        assigned_amount_cents: computed.summary.assignedAmountCents,
        unassigned_amount_cents: computed.summary.unassignedAmountCents,
        subtotal_amount_cents: computed.summary.subtotalAmountCents,
        total_amount_cents: computed.summary.totalAmountCents,
        tip_percentage: tipParsed.value,
        tip_amount_cents: computed.summary.tipAmountCents,
        delivery_fee_cents: computed.summary.deliveryFeeAmountCents,
        event_id: resolvedEvent.eventId,
        currency: validated.data.currency.toUpperCase(),
        expense_date: validated.data.expenseDate,
        paid_by: validated.data.paidBy,
        split_type: 'custom',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (expenseError || !expense) {
      return buildActionResult({
        success: false,
        message: toFriendlyWriteError(expenseError),
        values: rawValues,
      });
    }

    const replaceItems = await replaceExpenseItemsAndClaims(supabase, {
      groupId,
      expenseId: expense.id,
      createdBy: user.id,
      items: normalized.items,
    });
    if (replaceItems.error) {
      return buildActionResult({
        success: false,
        message: toFriendlyWriteErrorMessage(replaceItems.error),
        values: rawValues,
      });
    }

    if (computed.summary.participants.length > 0) {
      const { error: participantsError } = await supabase.from('expense_participants').insert(
        computed.summary.participants.map((participant) => ({
          expense_id: expense.id,
          group_id: groupId,
          ...participant,
        })),
      );

      if (participantsError) {
        return buildActionResult({
          success: false,
          message: toFriendlyWriteError(participantsError),
          values: rawValues,
        });
      }
    }

    revalidatePath(`/app/groups/${groupId}`);
    return buildActionResult({
      success: true,
      message: 'Expense created successfully.',
      values: rawValues,
      redirectTo: `/app/groups/${groupId}`,
    });
  }

  const subtotalAmountCents = toCents(validated.data.amount);
  if (!subtotalAmountCents) {
    return buildActionResult({
      success: false,
      message: 'Subtotal amount must be greater than 0.',
      values: rawValues,
    });
  }

  const participants = members
    .filter((member) => formData.get(`participant_${member.user_id}_included`) === 'on')
    .map((member) => {
      const amountRaw = formData.get(`participant_${member.user_id}_amount`);
      const percentageRaw = formData.get(`participant_${member.user_id}_percentage`);

      return {
        userId: member.user_id,
        amount: typeof amountRaw === 'string' ? toCents(amountRaw) ?? undefined : undefined,
        percentage:
          typeof percentageRaw === 'string' && percentageRaw.trim().length > 0
            ? Number(percentageRaw)
            : undefined,
      };
    });

  if (participants.length === 0) {
    return buildActionResult({
      success: false,
      message: 'Select at least one participant.',
      values: rawValues,
    });
  }

  const { shares, error: shareError } = computeShares(
    validated.data.splitType as SplitType,
    subtotalAmountCents,
    participants,
  );

  if (shareError) {
    return buildActionResult({ success: false, message: shareError, values: rawValues });
  }

  const sharesWithTip = applyTipToShares(shares, tipParsed.value);
  const sharesWithFee = applyEvenFeeToShares(sharesWithTip.shares, deliveryFeeCents);
  const totalAmountCents = subtotalAmountCents + sharesWithTip.tipAmountCents + deliveryFeeCents;

  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert({
      group_id: groupId,
      title: validated.data.title,
      description: validated.data.description || null,
      is_itemized: false,
      itemization_status: 'not_itemized',
      assigned_amount_cents: totalAmountCents,
      unassigned_amount_cents: 0,
      subtotal_amount_cents: subtotalAmountCents,
      total_amount_cents: totalAmountCents,
      tip_percentage: tipParsed.value,
      tip_amount_cents: sharesWithTip.tipAmountCents,
      delivery_fee_cents: deliveryFeeCents,
      event_id: resolvedEvent.eventId,
      currency: validated.data.currency.toUpperCase(),
      expense_date: validated.data.expenseDate,
      paid_by: validated.data.paidBy,
      split_type: validated.data.splitType,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (expenseError || !expense) {
    return buildActionResult({
      success: false,
      message: toFriendlyWriteError(expenseError),
      values: rawValues,
    });
  }

  const baseShareByUser = new Map(shares.map((share) => [share.userId, share.shareAmountCents]));

  const participantRows = sharesWithFee.shares.map((share) => ({
    expense_id: expense.id,
    group_id: groupId,
    user_id: share.userId,
    base_share_amount_cents: baseShareByUser.get(share.userId) ?? share.shareAmountCents,
    share_amount_cents: share.shareAmountCents,
    share_percentage: share.sharePercentage,
    input_amount_cents: share.inputAmountCents,
  }));

  const { error: participantsError } = await supabase
    .from('expense_participants')
    .insert(participantRows);

  if (participantsError) {
    return buildActionResult({
      success: false,
      message: toFriendlyWriteError(participantsError),
      values: rawValues,
    });
  }

  revalidatePath(`/app/groups/${groupId}`);
  return buildActionResult({
    success: true,
    message: 'Expense created successfully.',
    values: rawValues,
    redirectTo: `/app/groups/${groupId}`,
  });
}
