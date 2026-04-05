import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

async function getCurrentUserAndClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabase };
}

export async function getCurrentUserOrRedirect() {
  const { user, supabase } = await getCurrentUserAndClient();

  if (!user) {
    redirect('/login');
  }

  return { user, supabase };
}

export async function getCurrentUser() {
  return getCurrentUserAndClient();
}

export async function ensureProfile() {
  const { user } = await ensureProfileAndClient();
  return user;
}

export async function ensureProfileAndClient() {
  const { user, supabase } = await getCurrentUserOrRedirect();

  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('id', user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Could not read profile: ${existingError.message}`);
  }

  if (!existing) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? null,
    });

    if (insertError) {
      throw new Error(
        `Could not create profile: ${insertError.message}. Apply the profiles INSERT policy migration.`,
      );
    }
  } else if (user.email && existing.email !== user.email) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        email: user.email,
      })
      .eq('id', user.id);

    if (updateError) {
      throw new Error(`Could not update profile: ${updateError.message}`);
    }
  }

  try {
    const admin = createSupabaseAdminClient();
    await admin
      .from('group_members')
      .update({ accepted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('accepted_at', null);
  } catch {
    // Ignore if service-role key is missing; membership acceptance updates are best-effort.
  }

  return { user, supabase };
}
