import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const DUMMY_EMAIL_DOMAIN = 'dummy.split2.local';

function slugifyName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

export function parseDummyMemberNames(rawInput: string) {
  if (!rawInput.trim()) {
    return { names: [], invalid: [] as string[] };
  }

  const tokens = rawInput
    .split(/[,\n;]/g)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const uniqueByLower = new Map<string, string>();
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!uniqueByLower.has(lower)) {
      uniqueByLower.set(lower, token);
    }
  }

  const names = [...uniqueByLower.values()].filter((value) => value.length >= 2 && value.length <= 60);
  const invalid = [...uniqueByLower.values()].filter((value) => value.length < 2 || value.length > 60);
  return { names, invalid };
}

export async function createDummyGroupMembers(params: {
  groupId: string;
  ownerUserId: string;
  dummyNames: string[];
  supabase: SupabaseClient;
}) {
  if (params.dummyNames.length === 0) {
    return { error: null, createdCount: 0 };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not initialize admin client for dummy members.',
      createdCount: 0,
    };
  }

  let createdCount = 0;

  for (const name of params.dummyNames) {
    const slug = slugifyName(name) || 'placeholder';
    const email = `dummy+${slug}-${crypto.randomUUID().slice(0, 8)}@${DUMMY_EMAIL_DOMAIN}`;
    const password = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const authResult = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        is_dummy: true,
      },
    });

    const dummyUserId = authResult.data.user?.id;
    if (authResult.error || !dummyUserId) {
      return {
        error: `Could not create placeholder user "${name}": ${authResult.error?.message ?? 'Missing user id.'}`,
        createdCount,
      };
    }

    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: dummyUserId,
        email,
        full_name: name,
        is_dummy: true,
      },
      { onConflict: 'id' },
    );

    if (profileError) {
      return {
        error: `Could not create placeholder profile "${name}": ${profileError.message}`,
        createdCount,
      };
    }

    const nowIso = new Date().toISOString();
    const { error: memberError } = await params.supabase.from('group_members').upsert(
      {
        group_id: params.groupId,
        user_id: dummyUserId,
        role: 'member',
        added_by: params.ownerUserId,
        accepted_at: nowIso,
        invited_at: null,
        left_at: null,
      },
      { onConflict: 'group_id,user_id' },
    );

    if (memberError) {
      return {
        error: `Could not add placeholder member "${name}": ${memberError.message}`,
        createdCount,
      };
    }

    createdCount += 1;
  }

  return { error: null, createdCount };
}

export async function replaceDummyGroupMember(params: {
  groupId: string;
  dummyUserId: string;
  realUserId: string;
  supabase: SupabaseClient;
}) {
  const { error } = await params.supabase.rpc('replace_dummy_group_member', {
    p_group_id: params.groupId,
    p_dummy_user_id: params.dummyUserId,
    p_real_user_id: params.realUserId,
  });

  if (error) {
    return {
      error:
        error.message.includes('permission denied')
        || error.message.includes('not authorized')
        || error.message.includes('Only group owner')
          ? "You're not authorized to do this."
          : error.message,
    };
  }

  return { error: null };
}
