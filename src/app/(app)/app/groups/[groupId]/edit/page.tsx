import { ensureProfileAndClient } from '@/lib/auth';
import { getFriendProfiles, type FriendProfile } from '@/lib/friends';
import { getGroup, getGroupMembers } from '@/lib/group-data';
import { redirect } from 'next/navigation';
import { EditGroupForm } from './edit-form';
import { updateGroupAction, type EditGroupFormState } from './actions';

export default async function EditGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { user, supabase } = await ensureProfileAndClient();

  const [group, members, friendProfiles] = await Promise.all([
    getGroup(supabase, groupId),
    getGroupMembers(supabase, groupId),
    getFriendProfiles(supabase, user.id),
  ]);

  if (!group) {
    redirect('/app');
  }

  const profileMap = new Map<string, FriendProfile>();
  for (const friend of friendProfiles) {
    profileMap.set(friend.email.toLowerCase(), friend);
  }
  for (const member of members) {
    const email = member.profiles?.email?.toLowerCase();
    if (!email || email === user.email?.toLowerCase()) {
      continue;
    }

    if (!profileMap.has(email)) {
      profileMap.set(email, {
        id: member.user_id,
        email,
        full_name: member.profiles?.full_name ?? null,
        username: null,
      });
    }
  }

  const availableProfiles = [...profileMap.values()].sort((a, b) => {
    const aLabel = (a.full_name?.trim() || a.username?.trim() || a.email).toLowerCase();
    const bLabel = (b.full_name?.trim() || b.username?.trim() || b.email).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });

  const initialState: EditGroupFormState = {
    success: false,
    message: '',
    timestamp: 0,
    values: {
      name: group.name,
      description: group.description ?? '',
      defaultCurrency: (group.default_currency ?? 'USD') as 'USD' | 'MXN',
      calculationMode: (group.calculation_mode ?? 'normal') as 'normal' | 'reduced',
      memberEmails: members
        .map((member) => member.profiles?.email?.toLowerCase())
        .filter((email): email is string => Boolean(email) && email !== user.email?.toLowerCase()),
      inviteEmails: '',
    },
  };

  const boundUpdate = updateGroupAction.bind(null, groupId);

  return (
    <EditGroupForm
      groupId={groupId}
      updateAction={boundUpdate}
      initialState={initialState}
      availableProfiles={availableProfiles}
    />
  );
}
