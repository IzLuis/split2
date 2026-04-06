import { ensureProfileAndClient } from '@/lib/auth';
import { getRequestLocale } from '@/lib/i18n/server';
import type { ProfileFormState } from './actions';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const locale = await getRequestLocale();
  const { user, supabase } = await ensureProfileAndClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single();

  if (error) {
    throw new Error(`Could not load profile: ${error.message}`);
  }

  const initialState: ProfileFormState = {
    error: null,
    success: null,
    values: {
      fullName: profile?.full_name ?? '',
      username: profile?.username ?? '',
    },
  };

  return <ProfileForm initialState={initialState} email={user.email ?? ''} locale={locale} />;
}
