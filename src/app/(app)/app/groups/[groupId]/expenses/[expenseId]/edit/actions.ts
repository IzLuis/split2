'use server';

import { revalidatePath } from 'next/cache';
import { buildActionResult, type ActionResult } from '@/lib/action-result';
import { ensureProfileAndClient } from '@/lib/auth';
import { computeShares } from '@/lib/domain/splits';
import { applyEvenFeeToShares, applyTipToShares, parseTipPercentage } from '@/lib/domain/tips';
import { canUserEditExpense } from '@/lib/expense-permissions';
import { resolveExpenseEventForSave } from '@/lib/expense-events';
import { getGroupMembers } from '@/lib/group-data';
import { resolveLocale, tx, type Locale } from '@/lib/i18n/shared';
import {
  assignAllItemsToAllMembers,
  emptyItemizedFormItem,
  parseItemizedItemsFromFormData,
  normalizeItemizedFormItems,
  computeItemizedExpenseFromNormalizedItems,
  replaceExpenseItemsAndClaims,
} from '@/lib/itemized-expenses';
import type { SplitType } from '@/lib/types';
import { toCents, toNonNegativeCents } from '@/lib/utils';
import { createExpenseSchema } from '@/lib/validation';

export type EditExpenseFormValues = {
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
  itemizedEqualSplit: boolean;
  itemizedEqualParticipantIds: string[];
  items: Array<{
    name: string;
    unitPrice: string;
    quantity: string;
    isShared: boolean;
    notes: string;
    assigneeUserIds: string[];
  }>;
  participants: Record<string, { included: boolean; amount: string; percentage: string }>;
};

export type EditExpenseFormState = ActionResult<EditExpenseFormValues>;
export type DeleteExpenseActionState = ActionResult<Record<string, never>>;

function translateExpenseMessage(locale: Locale, message: string) {
  const normalized = message.trim();
  const issuePatterns: Array<{ pattern: RegExp; translate: (match: RegExpExecArray) => string }> = [
    {
      pattern: /^Item (\d+): name is required\.$/,
      translate: (match) => tx(locale, normalized, `Artículo ${match[1]}: el nombre es obligatorio.`),
    },
    {
      pattern: /^Item (\d+): unit price must be greater than 0\.$/,
      translate: (match) => tx(locale, normalized, `Artículo ${match[1]}: el precio unitario debe ser mayor a 0.`),
    },
    {
      pattern: /^Item (\d+): quantity must be a whole number greater than 0\.$/,
      translate: (match) => tx(locale, normalized, `Artículo ${match[1]}: la cantidad debe ser un entero mayor a 0.`),
    },
    {
      pattern: /^Item (\d+): one assignee is not in this group\.$/,
      translate: (match) => tx(locale, normalized, `Artículo ${match[1]}: uno de los asignados no pertenece al grupo.`),
    },
    {
      pattern: /^Item (\d+): non-shared items can only have one assignee\.$/,
      translate: (match) => tx(locale, normalized, `Artículo ${match[1]}: los artículos no compartidos solo permiten un asignado.`),
    },
  ];

  for (const issuePattern of issuePatterns) {
    const match = issuePattern.pattern.exec(normalized);
    if (match) {
      return issuePattern.translate(match);
    }
  }

  const dictionary: Record<string, string> = {
    "You're not authorized to do this.": 'No estás autorizado para hacer esto.',
    'Invalid expense form.': 'Formulario de gasto inválido.',
    'Title must be at least 2 characters.': 'El título debe tener al menos 2 caracteres.',
    'Amount is required.': 'El monto es obligatorio.',
    'Use a 3-letter currency code.': 'Usa un código de moneda de 3 letras.',
    'Date is required.': 'La fecha es obligatoria.',
    'Paid by is required.': 'Quien pagó es obligatorio.',
    'Tip percentage must be 0 or greater.': 'La propina % debe ser 0 o mayor.',
    'Tip percentage is too large.': 'La propina % es demasiado grande.',
    'Delivery fee must be 0 or greater.': 'El cargo de envío debe ser 0 o mayor.',
    'Payer must be a group member.': 'Quien pagó debe pertenecer al grupo.',
    'Select at least one participant for equal itemized split.': 'Selecciona al menos un participante para la división igual itemizada.',
    'Could not compute itemized shares.': 'No se pudo calcular la división del gasto itemizado.',
    'Expense updated successfully.': 'Gasto actualizado correctamente.',
    'Subtotal amount must be greater than 0.': 'El monto subtotal debe ser mayor a 0.',
    'Select at least one participant.': 'Selecciona al menos un participante.',
    'At least one participant is required.': 'Se requiere al menos un participante.',
    'Every participant must have a valid custom amount.': 'Cada participante debe tener un monto personalizado válido.',
    'Custom amounts must add up to the total amount.': 'Los montos personalizados deben sumar el total.',
    'Every participant must have a valid percentage.': 'Cada participante debe tener un porcentaje válido.',
    'Percentages must add up to 100.': 'Los porcentajes deben sumar 100.',
    'Add at least one line item for an itemized expense.': 'Agrega al menos un artículo para un gasto itemizado.',
    'Expense deleted successfully.': 'Gasto eliminado correctamente.',
    'Expense not found.': 'No se encontró el gasto.',
  };

  return locale === 'es' ? (dictionary[normalized] ?? normalized) : normalized;
}

function formatParticipantsMutationError(
  error: { message: string; code?: string | null },
  locale: Locale,
) {
  if (
    error.code === '42501'
    || error.message.includes('row-level security policy')
    || error.message.toLowerCase().includes('permission denied')
  ) {
    return translateExpenseMessage(locale, "You're not authorized to do this.");
  }

  return translateExpenseMessage(locale, error.message);
}

function getRawValues(formData: FormData): EditExpenseFormValues {
  const participants: EditExpenseFormValues['participants'] = {};

  for (const [key, value] of formData.entries()) {
    const match = key.match(/^participant_(.+)_(included|amount|percentage)$/);
    if (!match) continue;

    const userId = match[1];
    const field = match[2];
    const prev = participants[userId] ?? { included: false, amount: '', percentage: '' };
    const next = { ...prev };

    if (field === 'included') next.included = true;
    if (field === 'amount') next.amount = String(value ?? '');
    if (field === 'percentage') next.percentage = String(value ?? '');

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
    itemizedEqualSplit: formData.get('itemizedEqualSplit') === 'on',
    itemizedEqualParticipantIds: [...new Set(
      [...formData.keys()]
        .filter((key) => key.startsWith('itemizedEqualParticipant_'))
        .map((key) => key.replace('itemizedEqualParticipant_', '')),
    )],
    items: itemizedItems.length > 0 ? itemizedItems : [emptyItemizedFormItem()],
    participants,
  };
}

export async function updateExpenseAction(
  groupId: string,
  expenseId: string,
  _prevState: EditExpenseFormState,
  formData: FormData,
): Promise<EditExpenseFormState> {
  const locale = resolveLocale(String(formData.get('locale') ?? 'en'));
  const rawValues = getRawValues(formData);

  const validated = createExpenseSchema.safeParse({
    groupId,
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
      message: translateExpenseMessage(
        locale,
        validated.error.issues[0]?.message ?? 'Invalid expense form.',
      ),
      values: rawValues,
    });
  }

  const { user, supabase } = await ensureProfileAndClient();
  const editPermission = await canUserEditExpense(supabase, groupId, expenseId, user.id);
  if (!editPermission.allowed) {
    return buildActionResult({
      success: false,
      message: translateExpenseMessage(
        locale,
        editPermission.reason ?? "You're not authorized to do this.",
      ),
      values: rawValues,
    });
  }

  const tipParsed = parseTipPercentage(rawValues.tipPercentage);
  if (tipParsed.error) {
    return buildActionResult({
      success: false,
      message: translateExpenseMessage(locale, tipParsed.error),
      values: rawValues,
    });
  }

  const deliveryFeeCents = toNonNegativeCents(rawValues.deliveryFee);
  if (deliveryFeeCents === null) {
    return buildActionResult({
      success: false,
      message: translateExpenseMessage(locale, 'Delivery fee must be 0 or greater.'),
      values: rawValues,
    });
  }

  const members = await getGroupMembers(supabase, groupId);
  const memberIds = new Set(members.map((member) => member.user_id));
  if (!memberIds.has(validated.data.paidBy)) {
    return buildActionResult({
      success: false,
      message: translateExpenseMessage(locale, 'Payer must be a group member.'),
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
      return buildActionResult({
        success: false,
        message: translateExpenseMessage(locale, normalized.error),
        values: rawValues,
      });
    }

    const normalizedItems = rawValues.itemizedEqualSplit
      ? assignAllItemsToAllMembers(
        normalized.items,
        rawValues.itemizedEqualParticipantIds.filter((userId) => memberIds.has(userId)),
      )
      : normalized.items;

    if (rawValues.itemizedEqualSplit && normalizedItems.some((item) => item.assigneeUserIds.length === 0)) {
      return buildActionResult({
        success: false,
        message: translateExpenseMessage(
          locale,
          'Select at least one participant for equal itemized split.',
        ),
        values: rawValues,
      });
    }

    const computed = computeItemizedExpenseFromNormalizedItems(
      normalizedItems,
      tipParsed.value,
      deliveryFeeCents,
    );
    if (computed.error || !computed.summary) {
      return buildActionResult({
        success: false,
        message: translateExpenseMessage(
          locale,
          computed.error ?? 'Could not compute itemized shares.',
        ),
        values: rawValues,
      });
    }

    const { error: deleteParticipantsError } = await supabase
      .from('expense_participants')
      .delete()
      .eq('group_id', groupId)
      .eq('expense_id', expenseId);

    if (deleteParticipantsError) {
      return buildActionResult({
        success: false,
        message: formatParticipantsMutationError(deleteParticipantsError, locale),
        values: rawValues,
      });
    }

    const replaceItems = await replaceExpenseItemsAndClaims(supabase, {
      groupId,
      expenseId,
      createdBy: user.id,
      items: normalizedItems,
    });
    if (replaceItems.error) {
      return buildActionResult({
        success: false,
        message: formatParticipantsMutationError({ message: replaceItems.error }, locale),
        values: rawValues,
      });
    }

    if (computed.summary.participants.length > 0) {
      const { error: insertParticipantsError } = await supabase.from('expense_participants').insert(
        computed.summary.participants.map((participant) => ({
          expense_id: expenseId,
          group_id: groupId,
          ...participant,
        })),
      );

      if (insertParticipantsError) {
        return buildActionResult({
          success: false,
          message: formatParticipantsMutationError(insertParticipantsError, locale),
          values: rawValues,
        });
      }
    }

    const { error: updateError } = await supabase
      .from('expenses')
      .update({
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
      })
      .eq('group_id', groupId)
      .eq('id', expenseId);

    if (updateError) {
      return buildActionResult({
        success: false,
        message: formatParticipantsMutationError(updateError, locale),
        values: rawValues,
      });
    }

    revalidatePath(`/app/groups/${groupId}`);
    revalidatePath(`/app/groups/${groupId}/expenses/${expenseId}`);
    return buildActionResult({
      success: true,
      message: translateExpenseMessage(locale, 'Expense updated successfully.'),
      values: rawValues,
      redirectTo: `/app/groups/${groupId}/expenses/${expenseId}`,
    });
  }

  const subtotalAmountCents = toCents(validated.data.amount);
  if (!subtotalAmountCents) {
    return buildActionResult({
      success: false,
      message: translateExpenseMessage(locale, 'Subtotal amount must be greater than 0.'),
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
        percentage: typeof percentageRaw === 'string' && percentageRaw.trim() ? Number(percentageRaw) : undefined,
      };
    });

  if (participants.length === 0) {
    return buildActionResult({
      success: false,
      message: translateExpenseMessage(locale, 'Select at least one participant.'),
      values: rawValues,
    });
  }

  const { shares, error: shareError } = computeShares(
    validated.data.splitType,
    subtotalAmountCents,
    participants,
  );
  if (shareError) {
    return buildActionResult({
      success: false,
      message: translateExpenseMessage(locale, shareError),
      values: rawValues,
    });
  }

  const sharesWithTip = applyTipToShares(shares, tipParsed.value);
  const sharesWithFee = applyEvenFeeToShares(sharesWithTip.shares, deliveryFeeCents);
  const baseShareByUser = new Map(shares.map((share) => [share.userId, share.shareAmountCents]));
  const totalAmountCents = subtotalAmountCents + sharesWithTip.tipAmountCents + deliveryFeeCents;

  const { error: deleteItemsError } = await supabase
    .from('expense_items')
    .delete()
    .eq('group_id', groupId)
    .eq('expense_id', expenseId);

  if (deleteItemsError) {
    return buildActionResult({
      success: false,
      message: formatParticipantsMutationError(deleteItemsError, locale),
      values: rawValues,
    });
  }

  const { error: deleteParticipantsError } = await supabase
    .from('expense_participants')
    .delete()
    .eq('group_id', groupId)
    .eq('expense_id', expenseId);

  if (deleteParticipantsError) {
    return buildActionResult({
      success: false,
      message: formatParticipantsMutationError(deleteParticipantsError, locale),
      values: rawValues,
    });
  }

  const { error: insertParticipantsError } = await supabase.from('expense_participants').upsert(
    sharesWithFee.shares.map((share) => ({
      expense_id: expenseId,
      group_id: groupId,
      user_id: share.userId,
      base_share_amount_cents: baseShareByUser.get(share.userId) ?? share.shareAmountCents,
      share_amount_cents: share.shareAmountCents,
      share_percentage: share.sharePercentage,
      input_amount_cents: share.inputAmountCents,
    })),
    { onConflict: 'expense_id,user_id' },
  );

  if (insertParticipantsError) {
    return buildActionResult({
      success: false,
      message: formatParticipantsMutationError(insertParticipantsError, locale),
      values: rawValues,
    });
  }

  const { error: updateError } = await supabase
    .from('expenses')
    .update({
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
    })
    .eq('group_id', groupId)
    .eq('id', expenseId);

  if (updateError) {
    return buildActionResult({
      success: false,
      message: formatParticipantsMutationError(updateError, locale),
      values: rawValues,
    });
  }

  revalidatePath(`/app/groups/${groupId}`);
  revalidatePath(`/app/groups/${groupId}/expenses/${expenseId}`);
  return buildActionResult({
    success: true,
    message: translateExpenseMessage(locale, 'Expense updated successfully.'),
    values: rawValues,
    redirectTo: `/app/groups/${groupId}/expenses/${expenseId}`,
  });
}

export async function deleteExpenseAction(
  groupId: string,
  expenseId: string,
  prevState: DeleteExpenseActionState,
  formData: FormData,
): Promise<DeleteExpenseActionState> {
  void prevState;
  const locale = resolveLocale(String(formData.get('locale') ?? 'en'));
  const { user, supabase } = await ensureProfileAndClient();
  const editPermission = await canUserEditExpense(supabase, groupId, expenseId, user.id);
  if (!editPermission.allowed) {
    return buildActionResult({
      success: false,
      message: translateExpenseMessage(
        locale,
        editPermission.reason ?? "You're not authorized to do this.",
      ),
      values: {},
    });
  }

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('group_id', groupId)
    .eq('id', expenseId);

  if (error) {
    return buildActionResult({
      success: false,
      message: formatParticipantsMutationError(error, locale),
      values: {},
    });
  }

  revalidatePath(`/app/groups/${groupId}`);
  return buildActionResult({
    success: true,
    message: translateExpenseMessage(locale, 'Expense deleted successfully.'),
    values: {},
    redirectTo: `/app/groups/${groupId}`,
  });
}
