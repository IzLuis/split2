import { ensureProfileAndClient } from '@/lib/auth';
import { getFriendProfiles, getPendingFriendRequests } from '@/lib/friends';
import type { AddFriendFormState } from './actions';
import { FriendsClient } from './friends-client';

export default async function FriendsPage() {
  const { user, supabase } = await ensureProfileAndClient();

  const [friends, pending] = await Promise.all([
    getFriendProfiles(supabase, user.id),
    getPendingFriendRequests(supabase, user.id),
  ]);

  const initialState: AddFriendFormState = {
    error: null,
    success: null,
    values: {
      identifier: '',
    },
  };

  return (
    <FriendsClient
      initialState={initialState}
      incomingRequests={pending.incoming}
      outgoingRequests={pending.outgoing}
      friends={friends}
    />
  );
}
