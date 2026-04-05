'use server';

import { revalidatePath } from 'next/cache';
import { buildActionResult, type ActionResult } from '@/lib/action-result';
import { ensureProfileAndClient } from '@/lib/auth';

export type LeaveGroupActionState = ActionResult<Record<string, never>>;

function isMissingLeftAtColumnError(message: string | undefined) {
  return (message ?? '').includes('column group_members.left_at does not exist');
}

async function getActiveMembershipRole(
  supabase: Awaited<ReturnType<typeof ensureProfileAndClient>>['supabase'],
  groupId: string,
  userId: string,
) {
  let result = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();

  if (result.error && isMissingLeftAtColumnError(result.error.message)) {
    result = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
  }

  return result;
}

export async function deleteEventAction(groupId: string, eventId: string) {
  const { user, supabase } = await ensureProfileAndClient();

  const { data: membership, error: membershipError } = await getActiveMembershipRole(
    supabase,
    groupId,
    user.id,
  );

  if (membershipError || !membership) {
    throw new Error(`Could not verify permissions: ${membershipError?.message ?? 'Not a group member.'}`);
  }

  if (membership.role !== 'owner') {
    throw new Error('Only group owners can delete events.');
  }

  const { error } = await supabase
    .from('expense_events')
    .delete()
    .eq('group_id', groupId)
    .eq('id', eventId);

  if (error) {
    throw new Error(`Could not delete event: ${error.message}`);
  }

  revalidatePath(`/app/groups/${groupId}`);
  revalidatePath(`/app/groups/${groupId}/expenses/new`);
}

export async function leaveGroupAction(
  groupId: string,
  prevState: LeaveGroupActionState,
  formData: FormData,
): Promise<LeaveGroupActionState> {
  void prevState;
  void formData;
  const { user, supabase } = await ensureProfileAndClient();
  const emptyValues = {};

  const { data: membership, error: membershipError } = await getActiveMembershipRole(
    supabase,
    groupId,
    user.id,
  );

  if (membershipError || !membership) {
    return buildActionResult({
      success: false,
      message: membershipError?.message ?? 'You are not a member of this group.',
      values: emptyValues,
    });
  }

  if (membership.role === 'owner') {
    return buildActionResult({
      success: false,
      message: 'Group owners cannot leave the group.',
      values: emptyValues,
    });
  }

  const { data: leaveSuccess, error: leaveError } = await supabase.rpc('leave_group', {
    target_group_id: groupId,
  });

  if (leaveError) {
    if (
      leaveError.message.includes('function public.leave_group') &&
      leaveError.message.includes('does not exist')
    ) {
      return buildActionResult({
        success: false,
        message: 'Database migration missing. Apply migrations 025_group_members_soft_leave.sql and 026_leave_group_rpc.sql, then retry.',
        values: emptyValues,
      });
    }

    return buildActionResult({
      success: false,
      message: leaveError.message,
      values: emptyValues,
    });
  }

  if (!leaveSuccess) {
    return buildActionResult({
      success: false,
      message: 'You already left this group.',
      values: emptyValues,
    });
  }

  revalidatePath('/app');
  revalidatePath(`/app/groups/${groupId}`);
  return buildActionResult({
    success: true,
    message: 'You left the group.',
    values: emptyValues,
    redirectTo: '/app',
  });
}
