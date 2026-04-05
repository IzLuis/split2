import { ensureProfile } from '@/lib/auth';
import { getGroupMembers } from '@/lib/group-data';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NewSettlementForm } from './settlement-form';

export default async function NewSettlementPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  await ensureProfile();
  const { groupId } = await params;
  const supabase = await createSupabaseServerClient();
  const members = await getGroupMembers(supabase, groupId);

  return <NewSettlementForm groupId={groupId} members={members} />;
}
