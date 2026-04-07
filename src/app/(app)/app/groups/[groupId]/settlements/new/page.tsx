import { ensureProfileAndClient } from '@/lib/auth';
import { getGroup, getGroupBalanceSummary, getGroupMembers } from '@/lib/group-data';
import { getRequestLocale } from '@/lib/i18n/server';
import { NewSettlementForm } from './settlement-form';

export default async function NewSettlementPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const locale = await getRequestLocale();
  const { user, supabase } = await ensureProfileAndClient();
  const { groupId } = await params;
  const [members, group] = await Promise.all([
    getGroupMembers(supabase, groupId),
    getGroup(supabase, groupId),
  ]);
  const balanceSummary = await getGroupBalanceSummary(
    supabase,
    groupId,
    group?.calculation_mode ?? 'normal',
  );

  const debtsFromCurrentUser = balanceSummary.statements
    .filter((statement) => statement.fromUserId === user.id && statement.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);
  const suggestedReceiverId = debtsFromCurrentUser[0]?.toUserId
    ?? members.find((member) => member.user_id !== user.id)?.user_id
    ?? '';
  const suggestedAmountCents = debtsFromCurrentUser[0]?.amountCents ?? null;
  const defaultCurrency = (group?.default_currency?.toUpperCase() === 'USD' ? 'USD' : 'MXN') as 'USD' | 'MXN';

  return (
    <NewSettlementForm
      groupId={groupId}
      members={members}
      locale={locale}
      currentUserId={user.id}
      defaultCurrency={defaultCurrency}
      suggestedReceiverId={suggestedReceiverId}
      suggestedAmountCents={suggestedAmountCents}
      debtReminders={debtsFromCurrentUser.map((debt) => ({
        receiverUserId: debt.toUserId,
        amountCents: debt.amountCents,
      }))}
    />
  );
}
