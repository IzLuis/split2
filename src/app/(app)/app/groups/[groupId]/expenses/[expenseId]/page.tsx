import Link from 'next/link';
import { ensureProfileAndClient } from '@/lib/auth';
import { getGroupMembers } from '@/lib/group-data';
import { getRequestLocale } from '@/lib/i18n/server';
import { tx } from '@/lib/i18n/shared';
import { displayName, formatCurrency, formatDate } from '@/lib/utils';
import { claimExpenseItemAction, unclaimExpenseItemAction } from './itemized-actions';

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
}) {
  const locale = await getRequestLocale();
  const { user, supabase } = await ensureProfileAndClient();
  const { groupId, expenseId } = await params;
  const members = await getGroupMembers(supabase, groupId);
  const memberMap = new Map(
    members.map((member) => [member.user_id, displayName(member.profiles)]),
  );

  const { data: expense, error } = await supabase
    .from('expenses')
    .select(
      `
      id,
      title,
      description,
      is_itemized,
      itemization_status,
      assigned_amount_cents,
      unassigned_amount_cents,
      total_amount_cents,
      subtotal_amount_cents,
      tip_percentage,
      tip_amount_cents,
      delivery_fee_cents,
      event:expense_events!expenses_event_id_fkey (
        id,
        name,
        color
      ),
      currency,
      expense_date,
      paid_by,
      split_type,
      created_at,
      participants:expense_participants (
        user_id,
        base_share_amount_cents,
        share_amount_cents,
        share_percentage,
        input_amount_cents
      ),
      items:expense_items (
        id,
        name,
        unit_amount_cents,
        quantity,
        line_total_cents,
        is_shared,
        notes,
        sort_order,
        claims:expense_item_claims (
          user_id
        )
      )
    `,
    )
    .eq('group_id', groupId)
    .eq('id', expenseId)
    .single();

  if (error || !expense) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {tx(locale, 'Expense not found or you do not have access.', 'No se encontró el gasto o no tienes acceso.')}
      </div>
    );
  }

  const hasTip = (expense.tip_amount_cents ?? 0) > 0 && Number(expense.tip_percentage ?? 0) > 0;
  const hasDeliveryFee = (expense.delivery_fee_cents ?? 0) > 0;
  const expenseEvent = Array.isArray(expense.event) ? expense.event[0] ?? null : expense.event;
  const participantShareDetail = (participant: {
    base_share_amount_cents: number;
    share_amount_cents: number;
  }) => {
    const base = participant.base_share_amount_cents ?? participant.share_amount_cents;
    const extra = participant.share_amount_cents - base;
    const detailParts: string[] = [
      `${tx(locale, 'Share', 'Parte')}: ${formatCurrency(base, expense.currency)}`,
    ];

    if (extra > 0) {
      if (hasTip && hasDeliveryFee) {
        detailParts.push(`${formatCurrency(extra, expense.currency)} ${tx(locale, 'tip/fee', 'propina/cargo')}`);
      } else if (hasTip) {
        detailParts.push(`${formatCurrency(extra, expense.currency)} ${tx(locale, 'tip', 'propina')}`);
      } else if (hasDeliveryFee) {
        detailParts.push(`${formatCurrency(extra, expense.currency)} ${tx(locale, 'delivery fee', 'cargo de envío')}`);
      }
    }

    return detailParts.join(' + ');
  };
  const assignedFromParticipants = (expense.participants ?? []).reduce(
    (acc: number, participant: { share_amount_cents: number }) => acc + participant.share_amount_cents,
    0,
  );
  const unassignedFromParticipants = expense.is_itemized
    ? Math.max(expense.total_amount_cents - assignedFromParticipants, 0)
    : 0;
  const derivedItemizationStatus = !expense.is_itemized
    ? 'not_itemized'
    : assignedFromParticipants <= 0
      ? 'open'
      : unassignedFromParticipants <= 0
        ? 'fully_assigned'
        : 'partially_assigned';
  const items = ((expense.items as Array<{
    id: string;
    name: string;
    unit_amount_cents: number;
    quantity: number;
    line_total_cents: number;
    is_shared: boolean;
    notes: string | null;
    sort_order: number;
    claims: Array<{ user_id: string }>;
  }>) ?? []).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={`/app/groups/${groupId}`} className="text-sm text-slate-600 underline">
            {tx(locale, 'Back to group', 'Volver al grupo')}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{expense.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{expense.description || tx(locale, 'No description', 'Sin descripción')}</p>
          {expenseEvent ? (
            <span
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-50 px-2 py-1 text-xs text-slate-700"
              style={{ border: `1px solid ${expenseEvent.color}` }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: expenseEvent.color }} />
              {expenseEvent.name}
            </span>
          ) : null}
        </div>
        <Link
          href={`/app/groups/${groupId}/expenses/${expenseId}/edit`}
          className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-100"
        >
          {tx(locale, 'Edit expense', 'Editar gasto')}
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="text-sm">
            <span className="text-slate-500">{tx(locale, 'Total', 'Total')}:</span>{' '}
            <span className="font-medium text-slate-900">
              {formatCurrency(expense.total_amount_cents, expense.currency)}
            </span>
          </p>
          {hasTip ? (
            <p className="text-sm">
              <span className="text-slate-500">{tx(locale, 'Total without tip', 'Total sin propina')}:</span>{' '}
              <span className="font-medium text-slate-900">
                {formatCurrency(expense.subtotal_amount_cents ?? expense.total_amount_cents, expense.currency)}
              </span>
            </p>
          ) : null}
          {hasTip ? (
            <p className="text-sm">
              <span className="text-slate-500">{tx(locale, 'Tip', 'Propina')}:</span>{' '}
              <span className="font-medium text-slate-900">
                {formatCurrency(expense.tip_amount_cents ?? 0, expense.currency)} ({expense.tip_percentage ?? 0}%)
              </span>
            </p>
          ) : null}
          {hasDeliveryFee ? (
            <p className="text-sm">
              <span className="text-slate-500">{tx(locale, 'Delivery fee', 'Cargo de envío')}:</span>{' '}
              <span className="font-medium text-slate-900">
                {formatCurrency(expense.delivery_fee_cents ?? 0, expense.currency)}
              </span>
            </p>
          ) : null}
          <p className="text-sm">
            <span className="text-slate-500">{tx(locale, 'Date', 'Fecha')}:</span>{' '}
            <span className="font-medium text-slate-900">{formatDate(expense.expense_date)}</span>
          </p>
          <p className="text-sm">
            <span className="text-slate-500">{tx(locale, 'Paid by', 'Pagado por')}:</span>{' '}
            <span className="font-medium text-slate-900">{memberMap.get(expense.paid_by) || tx(locale, 'Unknown', 'Desconocido')}</span>
          </p>
          <p className="text-sm">
            <span className="text-slate-500">{tx(locale, 'Split type', 'Tipo de división')}:</span>{' '}
            <span className="font-medium capitalize text-slate-900">{expense.split_type}</span>
          </p>
          {expense.is_itemized ? (
            <>
              <p className="text-sm">
                <span className="text-slate-500">{tx(locale, 'Itemized status', 'Estado de itemización')}:</span>{' '}
                <span className="font-medium text-slate-900 capitalize">
                  {derivedItemizationStatus.replace(/_/g, ' ')}
                </span>
              </p>
              <p className="text-sm">
                <span className="text-slate-500">{tx(locale, 'Assigned total', 'Total asignado')}:</span>{' '}
                <span className="font-medium text-slate-900">
                  {formatCurrency(assignedFromParticipants, expense.currency)}
                </span>
              </p>
              <p className="text-sm">
                <span className="text-slate-500">{tx(locale, 'Unassigned total', 'Total sin asignar')}:</span>{' '}
                <span className="font-medium text-amber-700">
                  {formatCurrency(unassignedFromParticipants, expense.currency)}
                </span>
              </p>
            </>
          ) : null}
        </div>
      </section>

      {expense.is_itemized ? (
        <section className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">{tx(locale, 'Itemized receipt', 'Ticket itemizado')}</h2>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">{tx(locale, 'No line items yet.', 'Aún no hay artículos.')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((item) => {
                const claimantIds = [...new Set((item.claims ?? []).map((claim) => claim.user_id))];
                const claimedByCurrentUser = claimantIds.includes(user.id);
                const canClaim =
                  item.is_shared || claimantIds.length === 0 || claimedByCurrentUser;
                const claimAction = claimExpenseItemAction.bind(
                  null,
                  groupId,
                  expenseId,
                  item.id,
                );
                const unclaimAction = unclaimExpenseItemAction.bind(
                  null,
                  groupId,
                  expenseId,
                  item.id,
                );

                return (
                  <li key={item.id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatCurrency(item.unit_amount_cents, expense.currency)} x {item.quantity}{' '}
                          {item.is_shared
                            ? `• ${tx(locale, 'Shared', 'Compartido')}`
                            : `• ${tx(locale, 'Single', 'Individual')}`}
                        </p>
                        {item.notes ? <p className="mt-1 text-xs text-slate-600">{item.notes}</p> : null}
                        <p className="mt-1 text-xs text-slate-500">
                          {claimantIds.length === 0
                            ? tx(locale, 'Unclaimed', 'Sin reclamar')
                            : `${tx(locale, 'Claimed by', 'Reclamado por')} ${claimantIds
                                .map((userId) => memberMap.get(userId) || tx(locale, 'Unknown', 'Desconocido'))
                                .join(', ')}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">
                          {formatCurrency(item.line_total_cents, expense.currency)}
                        </p>
                        {claimedByCurrentUser ? (
                          <form action={unclaimAction} className="mt-2">
                            <button
                              type="submit"
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                            >
                              {tx(locale, 'Remove my claim', 'Quitar mi reclamo')}
                            </button>
                          </form>
                        ) : canClaim ? (
                          <form action={claimAction} className="mt-2">
                            <button
                              type="submit"
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                            >
                              {tx(locale, 'Claim item', 'Reclamar artículo')}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            {tx(
              locale,
              'Only claimed amounts are included in balances. Unassigned amounts stay visible until claimed.',
              'Solo los montos reclamados se incluyen en balances. Los montos sin asignar permanecen visibles hasta ser reclamados.',
            )}
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">{tx(locale, 'Participants', 'Participantes')}</h2>
        {expense.participants.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            {expense.is_itemized
              ? tx(locale, 'No assigned participants yet. Claims will appear here.', 'Aún no hay participantes asignados. Los reclamos aparecerán aquí.')
              : tx(locale, 'No participant shares found.', 'No se encontraron participaciones.')}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {expense.participants.map(
              (participant: {
                user_id: string;
                base_share_amount_cents: number;
                share_amount_cents: number;
                share_percentage: number | null;
              }) => (
                <li key={participant.user_id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{memberMap.get(participant.user_id) || tx(locale, 'Unknown', 'Desconocido')}</p>
                      <p className="text-slate-600">
                        {participantShareDetail(participant)}
                        {participant.share_percentage !== null ? ` (${participant.share_percentage}%)` : ''}
                      </p>
                    </div>
                    <p className="text-right text-sm font-semibold text-slate-900">
                      {formatCurrency(participant.share_amount_cents, expense.currency)}
                    </p>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
