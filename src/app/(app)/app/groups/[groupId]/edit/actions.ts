'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { buildActionResult, type ActionResult } from '@/lib/action-result';
import { ensureProfileAndClient } from '@/lib/auth';
import { getAuthEmailRedirectUrl } from '@/lib/app-url';
import { parseInviteEmails, resolveMemberUserIdsByEmail } from '@/lib/group-invitations';
import { createGroupSchema } from '@/lib/validation';

export type EditGroupFormValues = {
  name: string;
  description: string;
  defaultCurrency: 'USD' | 'MXN';
  calculationMode: 'normal' | 'reduced';
  memberEmails: string[];
  inviteEmails: string;
};

export type EditGroupFormState = ActionResult<EditGroupFormValues>;

function isMissingLeftAtColumnError(message: string | undefined) {
  return (message ?? '').includes('column group_members.left_at does not exist');
}

export async function updateGroupAction(
  groupId: string,
  _prevState: EditGroupFormState,
  formData: FormData,
): Promise<EditGroupFormState> {
  const rawValues: EditGroupFormValues = {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    defaultCurrency: String(formData.get('defaultCurrency') ?? 'USD') as 'USD' | 'MXN',
    calculationMode: String(formData.get('calculationMode') ?? 'normal') as 'normal' | 'reduced',
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
  const inviteRedirectTo = await getAuthEmailRedirectUrl('/login');

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
    inviteRedirectTo,
  });

  if (memberResolution.error) {
    return buildActionResult({
      success: false,
      message: memberResolution.error,
      values: rawValues,
    });
  }

  const { error: groupUpdateError } = await supabase
    .from('groups')
    .update({
      name: validated.data.name,
      description: validated.data.description || null,
      default_currency: validated.data.defaultCurrency,
      calculation_mode: validated.data.calculationMode,
    })
    .eq('id', groupId);

  if (groupUpdateError) {
    return buildActionResult({
      success: false,
      message: groupUpdateError.message,
      values: rawValues,
    });
  }

  const selectedIds = new Set<string>([
    user.id,
    ...allTargetEmails
      .map((email) => memberResolution.userIdByEmail.get(email))
      .filter((value): value is string => Boolean(value)),
  ]);

  const { data: currentMembers, error: membersError } = await supabase
    .from('group_members')
    .select(`
      user_id,
      role,
      profiles!group_members_user_id_fkey (
        email
      )
    `)
    .eq('group_id', groupId);

  if (membersError) {
    return buildActionResult({
      success: false,
      message: membersError.message,
      values: rawValues,
    });
  }

  for (const member of currentMembers ?? []) {
    if (member.user_id === user.id) {
      continue;
    }
    if (!selectedIds.has(member.user_id)) {
      const { error: deleteError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', member.user_id);

      if (deleteError) {
        return buildActionResult({
          success: false,
          message: deleteError.message,
          values: rawValues,
        });
      }
    }
  }

  const currentMemberIds = new Set((currentMembers ?? []).map((member) => String(member.user_id)));
  const rows = allTargetEmails
    .map((email) => ({
      email,
      userId: memberResolution.userIdByEmail.get(email) ?? null,
      invited: memberResolution.invitedEmailSet.has(email),
    }))
    .filter((entry): entry is { email: string; userId: string; invited: boolean } => Boolean(entry.userId))
    .filter((entry) => !currentMemberIds.has(entry.userId))
    .map((entry) => ({
      group_id: groupId,
      user_id: entry.userId,
      role: 'member' as const,
      added_by: user.id,
      invited_at: entry.invited ? new Date().toISOString() : null,
      accepted_at: entry.invited ? null : new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('group_members')
      .insert(rows);

    if (insertError) {
      return buildActionResult({
        success: false,
        message: insertError.message,
        values: rawValues,
      });
    }
  }

  revalidatePath('/app');
  revalidatePath(`/app/groups/${groupId}`);

  const invitedCount = rows.filter((row) => row.accepted_at === null).length;
  const addedCount = rows.length - invitedCount;
  const statusMessage =
    rows.length > 0
      ? `Members updated: ${addedCount} added, ${invitedCount} invited.`
      : 'Group updated successfully.';

  return buildActionResult({
    success: true,
    message: statusMessage,
    values: { ...rawValues, inviteEmails: '' },
    redirectTo: `/app/groups/${groupId}`,
  });
}

export async function deleteGroupAction(groupId: string) {
  const { user, supabase } = await ensureProfileAndClient();
  let { data: ownerMembership, error: ownerCheckError } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .is('left_at', null)
    .maybeSingle();

  if (ownerCheckError && isMissingLeftAtColumnError(ownerCheckError.message)) {
    const fallback = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();
    ownerMembership = fallback.data;
    ownerCheckError = fallback.error;
  }

  if (ownerCheckError) {
    throw new Error(`Could not verify group ownership: ${ownerCheckError.message}`);
  }

  if (!ownerMembership || ownerMembership.role !== 'owner') {
    throw new Error('Only the group owner can delete this group.');
  }

  const { error: expensesDeleteError } = await supabase
    .from('expenses')
    .delete()
    .eq('group_id', groupId);

  if (expensesDeleteError) {
    throw new Error(`Could not delete group expenses: ${expensesDeleteError.message}`);
  }

  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId);

  if (error) {
    throw new Error(`Could not delete group: ${error.message}`);
  }

  revalidatePath('/app');
  redirect('/app');
}
