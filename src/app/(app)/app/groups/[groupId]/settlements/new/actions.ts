'use server';

import { revalidatePath } from 'next/cache';
import { buildActionResult, type ActionResult } from '@/lib/action-result';
import { ensureProfile } from '@/lib/auth';
import { getGroupMembers } from '@/lib/group-data';
import { resolveLocale } from '@/lib/i18n/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toCents } from '@/lib/utils';
import { createSettlementSchema } from '@/lib/validation';

export type CreateSettlementFormValues = {
  amount: string;
  currency: string;
  settledOn: string;
  payerId: string;
  receiverId: string;
  note: string;
};
export type CreateSettlementFormState = ActionResult<CreateSettlementFormValues>;

function translateSettlementMessage(locale: 'en' | 'es', message: string) {
  const dictionary: Record<string, string> = {
    'Invalid settlement form.': 'Formulario de pago inválido.',
    'Amount is required.': 'El monto es obligatorio.',
    'Use a 3-letter currency code.': 'Usa un código de moneda de 3 letras.',
    'Date is required.': 'La fecha es obligatoria.',
    'Payer is required.': 'Quien pagó es obligatorio.',
    'Receiver is required.': 'Quien recibió es obligatorio.',
    'Payer and receiver must be different users.': 'Quien pagó y quien recibió deben ser personas diferentes.',
    'Amount must be greater than 0.': 'El monto debe ser mayor que 0.',
    'Payer and receiver must belong to this group.': 'Quien pagó y quien recibió deben pertenecer a este grupo.',
    "You're not authorized to do this.": 'No estás autorizado para hacer esto.',
    'Settlement recorded successfully.': 'Pago registrado correctamente.',
  };
  return locale === 'es' ? (dictionary[message] ?? message) : message;
}

export async function createSettlementAction(
  _prevState: CreateSettlementFormState,
  formData: FormData,
): Promise<CreateSettlementFormState> {
  const locale = resolveLocale(String(formData.get('locale') ?? 'en'));
  const rawValues = {
    amount: String(formData.get('amount') ?? ''),
    currency: String(formData.get('currency') ?? 'MXN'),
    settledOn: String(formData.get('settledOn') ?? ''),
    payerId: String(formData.get('payerId') ?? ''),
    receiverId: String(formData.get('receiverId') ?? ''),
    note: String(formData.get('note') ?? ''),
  };

  const validated = createSettlementSchema.safeParse({
    groupId: formData.get('groupId'),
    amount: rawValues.amount,
    currency: rawValues.currency,
    settledOn: rawValues.settledOn,
    payerId: rawValues.payerId,
    receiverId: rawValues.receiverId,
    note: rawValues.note || undefined,
  });

  if (!validated.success) {
    return buildActionResult({
      success: false,
      message: translateSettlementMessage(
        locale,
        validated.error.issues[0]?.message ?? 'Invalid settlement form.',
      ),
      values: rawValues,
    });
  }

  if (validated.data.payerId === validated.data.receiverId) {
    return buildActionResult({
      success: false,
      message: translateSettlementMessage(locale, 'Payer and receiver must be different users.'),
      values: rawValues,
    });
  }

  const user = await ensureProfile();
  const supabase = await createSupabaseServerClient();
  const groupId = validated.data.groupId;
  const amountCents = toCents(validated.data.amount);

  if (!amountCents) {
    return buildActionResult({
      success: false,
      message: translateSettlementMessage(locale, 'Amount must be greater than 0.'),
      values: rawValues,
    });
  }

  const members = await getGroupMembers(supabase, groupId);
  const memberIds = new Set(members.map((member) => member.user_id));

  if (!memberIds.has(validated.data.payerId) || !memberIds.has(validated.data.receiverId)) {
    return buildActionResult({
      success: false,
      message: translateSettlementMessage(locale, 'Payer and receiver must belong to this group.'),
      values: rawValues,
    });
  }

  const { error } = await supabase.from('settlements').insert({
    group_id: groupId,
    payer_id: validated.data.payerId,
    receiver_id: validated.data.receiverId,
    amount_cents: amountCents,
    currency: validated.data.currency.toUpperCase(),
    settled_on: validated.data.settledOn,
    note: validated.data.note || null,
    created_by: user.id,
  });

  if (error) {
    return buildActionResult({
      success: false,
      message: error.message.includes('row-level security policy')
        ? translateSettlementMessage(locale, "You're not authorized to do this.")
        : error.message,
      values: rawValues,
    });
  }

  revalidatePath(`/app/groups/${groupId}`);
  return buildActionResult({
    success: true,
    message: translateSettlementMessage(locale, 'Settlement recorded successfully.'),
    values: rawValues,
    redirectTo: `/app/groups/${groupId}`,
  });
}
