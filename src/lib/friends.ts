import type { SupabaseClient } from '@supabase/supabase-js';

export type FriendProfile = {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
};

export type FriendRequestWithProfiles = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled';
  created_at: string;
  responded_at: string | null;
  requester: FriendProfile;
  addressee: FriendProfile;
};

export function getFriendPair(userA: string, userB: string) {
  return userA < userB ? { user_a: userA, user_b: userB } : { user_a: userB, user_b: userA };
}

function profileSortLabel(profile: FriendProfile) {
  return (profile.full_name?.trim() || profile.username?.trim() || profile.email).toLowerCase();
}

function normalizeProfile(input: unknown): FriendProfile | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const row = input as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.email !== 'string') {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    full_name: typeof row.full_name === 'string' ? row.full_name : null,
    username: typeof row.username === 'string' ? row.username : null,
  };
}

export async function getFriendProfiles(
  supabase: SupabaseClient,
  userId: string,
): Promise<FriendProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(
      `
      user_a,
      user_b,
      userAProfile:profiles!friendships_user_a_fkey (
        id,
        email,
        full_name,
        username
      ),
      userBProfile:profiles!friendships_user_b_fkey (
        id,
        email,
        full_name,
        username
      )
    `,
    )
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Could not load friends: ${error.message}`);
  }

  const friendById = new Map<string, FriendProfile>();

  for (const row of data ?? []) {
    const userA = normalizeProfile((row as Record<string, unknown>).userAProfile);
    const userB = normalizeProfile((row as Record<string, unknown>).userBProfile);

    if (userA && userA.id !== userId) {
      friendById.set(userA.id, userA);
    }
    if (userB && userB.id !== userId) {
      friendById.set(userB.id, userB);
    }
  }

  return [...friendById.values()].sort((a, b) => profileSortLabel(a).localeCompare(profileSortLabel(b)));
}

export async function getPendingFriendRequests(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ incoming: FriendRequestWithProfiles[]; outgoing: FriendRequestWithProfiles[] }> {
  const { data, error } = await supabase
    .from('friend_requests')
    .select(
      `
      id,
      requester_id,
      addressee_id,
      status,
      created_at,
      responded_at,
      requester:profiles!friend_requests_requester_id_fkey (
        id,
        email,
        full_name,
        username
      ),
      addressee:profiles!friend_requests_addressee_id_fkey (
        id,
        email,
        full_name,
        username
      )
    `,
    )
    .eq('status', 'pending')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Could not load friend requests: ${error.message}`);
  }

  const requests: FriendRequestWithProfiles[] = [];

  for (const row of data ?? []) {
    const requester = normalizeProfile((row as Record<string, unknown>).requester);
    const addressee = normalizeProfile((row as Record<string, unknown>).addressee);

    if (!requester || !addressee) {
      continue;
    }

    requests.push({
      id: String((row as Record<string, unknown>).id),
      requester_id: String((row as Record<string, unknown>).requester_id),
      addressee_id: String((row as Record<string, unknown>).addressee_id),
      status: 'pending',
      created_at: String((row as Record<string, unknown>).created_at),
      responded_at:
        typeof (row as Record<string, unknown>).responded_at === 'string'
          ? String((row as Record<string, unknown>).responded_at)
          : null,
      requester,
      addressee,
    });
  }

  return {
    incoming: requests.filter((request) => request.addressee_id === userId),
    outgoing: requests.filter((request) => request.requester_id === userId),
  };
}
