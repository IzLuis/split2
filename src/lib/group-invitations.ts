import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_EMAIL_SUFFIX = '@dummy.split2.local';

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parseInviteEmails(rawInput: string): { emails: string[]; invalid: string[] } {
  if (!rawInput.trim()) {
    return { emails: [], invalid: [] };
  }

  const tokens = rawInput
    .split(/[,\n;]/g)
    .map((value) => normalizeEmail(value))
    .filter((value) => value.length > 0);

  const unique = Array.from(new Set(tokens));
  const invalid = unique.filter((email) => !EMAIL_PATTERN.test(email));
  const emails = unique.filter((email) => EMAIL_PATTERN.test(email));

  return { emails, invalid };
}

export async function resolveMemberUserIdsByEmail(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  actorEmail?: string | null;
  emails: string[];
  inviteRedirectTo?: string;
}) {
  const normalizedEmails = Array.from(
    new Set(
      params.emails
        .map((email) => normalizeEmail(email))
        .filter((email) => email.length > 0 && email !== normalizeEmail(params.actorEmail ?? '')),
    ),
  );

  if (normalizedEmails.length === 0) {
    return {
      error: null,
      userIdByEmail: new Map<string, string>(),
      invitedEmailSet: new Set<string>(),
    };
  }

  const { data: existingProfiles, error: profilesError } = await params.supabase
    .from('profiles')
    .select('id, email')
    .in('email', normalizedEmails);

  if (profilesError) {
    return {
      error: `Could not load profiles: ${profilesError.message}`,
      userIdByEmail: new Map<string, string>(),
      invitedEmailSet: new Set<string>(),
    };
  }

  const userIdByEmail = new Map<string, string>();
  for (const profile of existingProfiles ?? []) {
    if (
      profile.email
      && !normalizeEmail(profile.email).endsWith(DUMMY_EMAIL_SUFFIX)
    ) {
      userIdByEmail.set(normalizeEmail(profile.email), String(profile.id));
    }
  }

  const missingEmails = normalizedEmails.filter((email) => !userIdByEmail.has(email));
  if (missingEmails.length === 0) {
    return { error: null, userIdByEmail, invitedEmailSet: new Set<string>() };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not initialize invite service.',
      userIdByEmail,
      invitedEmailSet: new Set<string>(),
    };
  }
  const invitedEmailSet = new Set<string>();

  for (const email of missingEmails) {
    const inviteResult = await admin.auth.admin.inviteUserByEmail(
      email,
      params.inviteRedirectTo
        ? {
          redirectTo: params.inviteRedirectTo,
        }
        : undefined,
    );
    const invitedId = inviteResult.data.user?.id;

    if (inviteResult.error || !invitedId) {
      return {
        error: `Could not invite ${email}: ${inviteResult.error?.message ?? 'Missing invited user id.'}`,
        userIdByEmail,
        invitedEmailSet,
      };
    }

    const { error: placeholderError } = await admin.from('profiles').upsert(
      {
        id: invitedId,
        email,
        full_name: null,
      },
      { onConflict: 'id' },
    );

    if (placeholderError) {
      return {
        error: `Could not create placeholder profile for ${email}: ${placeholderError.message}`,
        userIdByEmail,
        invitedEmailSet,
      };
    }

    userIdByEmail.set(email, invitedId);
    invitedEmailSet.add(email);
  }

  return { error: null, userIdByEmail, invitedEmailSet };
}
