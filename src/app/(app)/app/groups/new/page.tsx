import { ensureProfileAndClient } from '@/lib/auth';
import { getFriendProfiles } from '@/lib/friends';
import { getRequestLocale } from '@/lib/i18n/server';
import { NewGroupForm } from './group-form';

export default async function NewGroupPage() {
  const locale = await getRequestLocale();
  const { user, supabase } = await ensureProfileAndClient();
  const profiles = await getFriendProfiles(supabase, user.id);
  return <NewGroupForm availableProfiles={profiles} locale={locale} />;
}
