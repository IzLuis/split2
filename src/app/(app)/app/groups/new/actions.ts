'use server';

import { revalidatePath } from 'next/cache';
import { ensureProfileAndClient } from '@/lib/auth';
import { buildActionResult, type ActionResult } from '@/lib/action-result';
import { parseInviteEmails, resolveMemberUserIdsByEmail } from '@/lib/group-invitations';
import { createGroupSchema } from '@/lib/validation';

export type CreateGroupFormValues = {
  name: string;
  description: string;
  defaultCurrency: 'USD' | 'MXN';
  calculationMode: 'normal' | 'reduced';
  memberEmails: string[];
  inviteEmails: string;
};

export type CreateGroupFormState = ActionResult<CreateGroupFormValues>;

export async function createGroupAction(
  _prevState: CreateGroupFormState,
  formData: FormData,
): Promise<CreateGroupFormState> {
  const rawValues = {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    defaultCurrency: (String(formData.get('defaultCurrency') ?? 'USD') as 'USD' | 'MXN'),
    calculationMode: (String(formData.get('calculationMode') ?? 'normal') as
      | 'normal'
      | 'reduced'),
    inviteEmails: String(formData.get('inviteEmails') ?? ''),
    memberEmails: formData
      .getAll('memberEmails')
      .map((value) => String(value).trim().toLowerCase())
      .filter((value) => value.length > 0),
  };

  const validated = createGroupSchema.safeParse({
    name: rawValues.name,
    description: rawValues.description || undefined,
    defaultCurrency: rawValues.defaultCurrency,
    calculationMode: rawValues.calculationMode,
  });

  if (!validated.success) {
    return buildActionResult({
      success: false,
      message: validated.error.issues[0]?.message ?? 'Invalid group data.',
      values: rawValues,
    });
  }

  const { user, supabase } = await ensureProfileAndClient();
  const parsedInviteEmails = parseInviteEmails(rawValues.inviteEmails);
  if (parsedInviteEmails.invalid.length > 0) {
    return buildActionResult({
      success: false,
      message: `Invalid email(s): ${parsedInviteEmails.invalid.join(', ')}`,
      values: rawValues,
    });
  }

  const allTargetEmails = Array.from(
    new Set([...rawValues.memberEmails, ...parsedInviteEmails.emails]),
  );

  const memberResolution = await resolveMemberUserIdsByEmail({
    supabase,
    actorUserId: user.id,
    actorEmail: user.email,
    emails: allTargetEmails,
  });

  if (memberResolution.error) {
    return buildActionResult({
      success: false,
      message: memberResolution.error,
      values: rawValues,
    });
  }

  const { data: createdGroup, error: groupError } = await supabase
    .from('groups')
    .insert({
      name: validated.data.name,
      description: validated.data.description || null,
      default_currency: validated.data.defaultCurrency,
      calculation_mode: validated.data.calculationMode,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (groupError || !createdGroup) {
    return buildActionResult({
      success: false,
      message: groupError?.message ?? 'Could not create group.',
      values: rawValues,
    });
  }

  const groupId = String(createdGroup.id);

  const { error: ownerMembershipError } = await supabase.from('group_members').insert({
    group_id: groupId,
    user_id: user.id,
    role: 'owner',
    added_by: user.id,
    accepted_at: new Date().toISOString(),
  });

  if (ownerMembershipError) {
    return buildActionResult({
      success: false,
      message: ownerMembershipError.message,
      values: rawValues,
    });
  }

  const memberRows = allTargetEmails
    .map((email) => ({
      email,
      userId: memberResolution.userIdByEmail.get(email) ?? null,
      invited: memberResolution.invitedEmailSet.has(email),
    }))
    .filter((entry): entry is { email: string; userId: string; invited: boolean } => Boolean(entry.userId))
    .map((entry) => ({
      group_id: groupId,
      user_id: entry.userId,
      role: 'member' as const,
      added_by: user.id,
      invited_at: entry.invited ? new Date().toISOString() : null,
      accepted_at: entry.invited ? null : new Date().toISOString(),
    }));

  if (memberRows.length > 0) {
    const { error: memberInsertError } = await supabase
      .from('group_members')
      .insert(memberRows);

    if (memberInsertError) {
      return buildActionResult({
        success: false,
        message: memberInsertError.message,
        values: rawValues,
      });
    }
  }

  revalidatePath('/app');
  return buildActionResult({
    success: true,
    message: 'Group created successfully.',
    values: rawValues,
    redirectTo: `/app/groups/${groupId}`,
  });
}
