import { ensureProfile } from '@/lib/auth';
import { getGroupExpenseEvents } from '@/lib/expense-events';
import { getGroup, getGroupMembers } from '@/lib/group-data';
import { getRequestLocale } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewExpenseForm } from './expense-form';

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const locale = await getRequestLocale();
  await ensureProfile();
  const { groupId } = await params;
  const supabase = await createSupabaseServerClient();
  const [members, group, events] = await Promise.all([
    getGroupMembers(supabase, groupId),
    getGroup(supabase, groupId),
    getGroupExpenseEvents(supabase, groupId),
  ]);

  if (!group) {
    redirect('/app');
  }

  return (
    <NewExpenseForm
      groupId={groupId}
      members={members}
      availableEvents={events}
      defaultCurrency="MXN"
      locale={locale}
    />
  );
}
