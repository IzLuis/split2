'use server';

import { revalidatePath } from 'next/cache';
import { ensureProfileAndClient } from '@/lib/auth';
import { getFriendPair } from '@/lib/friends';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AddFriendFormState = {
  error: string | null;
  success: string | null;
  values: {
    identifier: string;
  };
};

type FriendTargetProfile = {
  id: string;
  email: string;
  username: string | null;
};

const FRIENDS_PAGE_PATH = '/app/friends';
const GROUP_CREATE_PATH = '/app/groups/new';

function normalizeIdentifier(formData: FormData) {
  return String(formData.get('identifier') ?? '').trim();
}

function buildFriendFormState(
  params: {
    identifier: string;
    error?: string | null;
    success?: string | null;
    clearIdentifier?: boolean;
  },
): AddFriendFormState {
  const { identifier, error = null, success = null, clearIdentifier = false } = params;

  return {
    error,
    success,
    values: {
      identifier: clearIdentifier ? '' : identifier,
    },
  };
}

async function findTargetProfileByIdentifier(
  supabase: SupabaseClient,
  normalizedIdentifier: string,
): Promise<{ profile: FriendTargetProfile | null; errorMessage: string | null }> {
  if (normalizedIdentifier.includes('@')) {
    const byEmail = await supabase
      .from('profiles')
      .select('id, email, username')
      .ilike('email', normalizedIdentifier)
      .limit(1)
      .maybeSingle();

    if (byEmail.error) {
      return {
        profile: null,
        errorMessage: `Could not find user by email: ${byEmail.error.message}`,
      };
    }

    return { profile: byEmail.data, errorMessage: null };
  }

  const byUsername = await supabase
    .from('profiles')
    .select('id, email, username')
    .eq('username', normalizedIdentifier)
    .limit(1)
    .maybeSingle();

  if (byUsername.error) {
    return {
      profile: null,
      errorMessage: `Could not find user by username: ${byUsername.error.message}`,
    };
  }

  return { profile: byUsername.data, errorMessage: null };
}

function revalidateFriends(withGroupCreate = false) {
  revalidatePath(FRIENDS_PAGE_PATH);
  if (withGroupCreate) {
    revalidatePath(GROUP_CREATE_PATH);
  }
}

async function updatePendingRequestStatus(
  params: {
    requestId: string;
    supabase: SupabaseClient;
    expectedUserColumn: 'requester_id' | 'addressee_id';
    expectedUserId: string;
    status: 'declined' | 'canceled';
  },
) {
  const { requestId, supabase, expectedUserColumn, expectedUserId, status } = params;

  const { error } = await supabase
    .from('friend_requests')
    .update({
      status,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq(expectedUserColumn, expectedUserId)
    .eq('status', 'pending');

  if (error) {
    throw new Error(`Could not ${status} request: ${error.message}`);
  }

  revalidateFriends(false);
}

export async function sendFriendRequestAction(
  _prevState: AddFriendFormState,
  formData: FormData,
): Promise<AddFriendFormState> {
  const identifier = normalizeIdentifier(formData);

  if (!identifier) {
    return buildFriendFormState({
      identifier,
      error: 'Enter an email or username.',
    });
  }

  const { user, supabase } = await ensureProfileAndClient();
  const normalizedIdentifier = identifier.toLowerCase();

  const lookup = await findTargetProfileByIdentifier(supabase, normalizedIdentifier);
  if (lookup.errorMessage) {
    return buildFriendFormState({ identifier, error: lookup.errorMessage });
  }

  const targetProfile = lookup.profile;

  if (!targetProfile) {
    return buildFriendFormState({
      identifier,
      error: 'No user found with that email/username.',
    });
  }

  if (targetProfile.id === user.id) {
    return buildFriendFormState({
      identifier,
      error: 'You cannot add yourself as a friend.',
    });
  }

  const pair = getFriendPair(user.id, targetProfile.id);
  const existingFriendship = await supabase
    .from('friendships')
    .select('user_a')
    .eq('user_a', pair.user_a)
    .eq('user_b', pair.user_b)
    .maybeSingle();

  if (existingFriendship.error) {
    return buildFriendFormState({
      identifier,
      error: `Could not check friendship status: ${existingFriendship.error.message}`,
    });
  }

  if (existingFriendship.data) {
    return buildFriendFormState({
      identifier,
      error: 'You are already friends with this user.',
      clearIdentifier: true,
    });
  }

  const { data: pendingRequest, error: pendingError } = await supabase
    .from('friend_requests')
    .select('id, requester_id, addressee_id')
    .eq('status', 'pending')
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${targetProfile.id}),and(requester_id.eq.${targetProfile.id},addressee_id.eq.${user.id})`,
    )
    .limit(1)
    .maybeSingle();

  if (pendingError) {
    return buildFriendFormState({
      identifier,
      error: `Could not check pending requests: ${pendingError.message}`,
    });
  }

  if (pendingRequest) {
    return buildFriendFormState({
      identifier,
      error:
        pendingRequest.requester_id === user.id
          ? 'You already sent a friend request to this user.'
          : 'This user already sent you a request. Accept it below.',
      clearIdentifier: true,
    });
  }

  const { error: insertError } = await supabase.from('friend_requests').insert({
    requester_id: user.id,
    addressee_id: targetProfile.id,
    status: 'pending',
  });

  if (insertError) {
    return buildFriendFormState({
      identifier,
      error: `Could not send friend request: ${insertError.message}`,
    });
  }

  revalidateFriends(false);

  return buildFriendFormState({
    identifier,
    success: 'Friend request sent.',
    clearIdentifier: true,
  });
}

export async function acceptFriendRequestAction(requestId: string) {
  const { user, supabase } = await ensureProfileAndClient();

  const { data: updatedRequest, error: requestError } = await supabase
    .from('friend_requests')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .select('id, requester_id, addressee_id')
    .single();

  if (requestError || !updatedRequest) {
    throw new Error(`Could not accept request: ${requestError?.message ?? 'Not found.'}`);
  }

  const pair = getFriendPair(updatedRequest.requester_id, updatedRequest.addressee_id);

  const { error: friendshipError } = await supabase.from('friendships').upsert(
    {
      user_a: pair.user_a,
      user_b: pair.user_b,
      created_from_request_id: updatedRequest.id,
    },
    { onConflict: 'user_a,user_b', ignoreDuplicates: true },
  );

  if (friendshipError) {
    throw new Error(`Could not save friendship: ${friendshipError.message}`);
  }

  revalidateFriends(true);
}

export async function declineFriendRequestAction(requestId: string) {
  const { user, supabase } = await ensureProfileAndClient();

  await updatePendingRequestStatus({
    requestId,
    supabase,
    expectedUserColumn: 'addressee_id',
    expectedUserId: user.id,
    status: 'declined',
  });
}

export async function cancelFriendRequestAction(requestId: string) {
  const { user, supabase } = await ensureProfileAndClient();

  await updatePendingRequestStatus({
    requestId,
    supabase,
    expectedUserColumn: 'requester_id',
    expectedUserId: user.id,
    status: 'canceled',
  });
}

export async function removeFriendAction(friendUserId: string) {
  const { user, supabase } = await ensureProfileAndClient();
  const pair = getFriendPair(user.id, friendUserId);

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_a', pair.user_a)
    .eq('user_b', pair.user_b);

  if (error) {
    throw new Error(`Could not remove friend: ${error.message}`);
  }

  revalidateFriends(true);
}
