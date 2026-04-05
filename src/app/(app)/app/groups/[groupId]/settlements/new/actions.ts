'use server';

import { revalidatePath } from 'next/cache';
import { buildActionResult, type ActionResult } from '@/lib/action-result';
import { ensureProfile } from '@/lib/auth';
import { getGroupMembers } from '@/lib/group-data';
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

export async function createSettlementAction(
  _prevState: CreateSettlementFormState,
  formData: FormData,
): Promise<CreateSettlementFormState> {
  const rawValues = {
    amount: String(formData.get('amount') ?? ''),
    currency: String(formData.get('currency') ?? 'USD'),
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
      message: validated.error.issues[0]?.message ?? 'Invalid settlement form.',
      values: rawValues,
    });
  }

  if (validated.data.payerId === validated.data.receiverId) {
    return buildActionResult({
      success: false,
      message: 'Payer and receiver must be different users.',
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
      message: 'Amount must be greater than 0.',
      values: rawValues,
    });
  }

  const members = await getGroupMembers(supabase, groupId);
  const memberIds = new Set(members.map((member) => member.user_id));

  if (!memberIds.has(validated.data.payerId) || !memberIds.has(validated.data.receiverId)) {
    return buildActionResult({
      success: false,
      message: 'Payer and receiver must belong to this group.',
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
      message: error.message,
      values: rawValues,
    });
  }

  revalidatePath(`/app/groups/${groupId}`);
  return buildActionResult({
    success: true,
    message: 'Settlement recorded successfully.',
    values: rawValues,
    redirectTo: `/app/groups/${groupId}`,
  });
}
