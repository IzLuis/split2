import Link from 'next/link';
import { ensureProfileAndClient } from '@/lib/auth';
import { getGroupMembers } from '@/lib/group-data';
import { getRequestLocale } from '@/lib/i18n/server';
import { tx } from '@/lib/i18n/shared';
import { formatCurrency, formatDate, formatMemberLabel } from '@/lib/utils';
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
    members.map((member) => [member.user_id, formatMemberLabel(member.profiles, locale)]),
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
      created_by,
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
        sort_order
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
  const roundingDeltaFromParticipants = expense.is_itemized
    ? Math.max(expense.total_amount_cents - assignedFromParticipants, 0)
    : 0;
  const unassignedForStatus = expense.is_itemized
    ? Math.max(
      expense.unassigned_amount_cents
      ?? Math.max(expense.total_amount_cents - assignedFromParticipants, 0),
      0,
    )
    : 0;
  const assignedForStatus = expense.is_itemized
    ? Math.max(expense.total_amount_cents - unassignedForStatus, 0)
    : assignedFromParticipants;
  const derivedItemizationStatus = !expense.is_itemized
    ? 'not_itemized'
    : assignedForStatus <= 0
      ? 'open'
      : unassignedForStatus <= 0
        ? 'fully_assigned'
        : 'partially_assigned';
  const splitTypeLabel = (() => {
    switch (expense.split_type) {
      case 'equal':
        return tx(locale, 'Equal', 'Igual');
      case 'custom':
        return tx(locale, 'Custom', 'Personalizado');
      case 'percentage':
        return tx(locale, 'Percentage', 'Porcentaje');
      default:
        return expense.split_type;
    }
  })();
  const itemizedStatusLabels = {
    not_itemized: tx(locale, 'Not itemized', 'No itemizado'),
    open: tx(locale, 'Open', 'Abierto'),
    partially_assigned: tx(locale, 'Partially assigned', 'Parcialmente asignado'),
    fully_assigned: tx(locale, 'Fully assigned', 'Completamente asignado'),
  } as const;
  const itemizedStatusLabel = itemizedStatusLabels[derivedItemizationStatus];
  const items = ((expense.items as Array<{
    id: string;
    name: string;
    unit_amount_cents: number;
    quantity: number;
    line_total_cents: number;
    is_shared: boolean;
    notes: string | null;
    sort_order: number;
  }>) ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const itemIds = items.map((item) => item.id);
  const claimersByItemId = new Map<string, string[]>();

  if (itemIds.length > 0) {
    const { data: claimRows, error: claimRowsError } = await supabase
      .from('expense_item_claims')
      .select('expense_item_id, user_id')
      .in('expense_item_id', itemIds);

    if (claimRowsError) {
      throw new Error(`Could not load item claims: ${claimRowsError.message}`);
    }

    for (const row of (claimRows ?? []) as Array<{ expense_item_id: string; user_id: string }>) {
      const claimers = claimersByItemId.get(row.expense_item_id) ?? [];
      claimers.push(row.user_id);
      claimersByItemId.set(row.expense_item_id, claimers);
    }
  }

  const currentMembership = members.find((member) => member.user_id === user.id);
  const canEditExpense = expense.created_by === user.id || currentMembership?.role === 'owner';
  const isGlobalEqualItemizedSplit = (() => {
    if (!expense.is_itemized || items.length === 0) {
      return false;
    }
    if (!items.every((item) => item.is_shared)) {
      return false;
    }
    const firstClaimers = [...new Set(claimersByItemId.get(items[0].id) ?? [])].sort();
    if (firstClaimers.length === 0) {
      return false;
    }

    const serialized = firstClaimers.join(',');
    return items.every((item) => {
      const claimers = [...new Set(claimersByItemId.get(item.id) ?? [])].sort();
      return claimers.join(',') === serialized;
    });
  })();
  const showGlobalEqualRoundingNote = isGlobalEqualItemizedSplit
    && unassignedForStatus === 0
    && roundingDeltaFromParticipants > 0;
  const getParticipantItemizedLines = (participantUserId: string) => {
    return items.flatMap((item) => {
      const claimantIds = [...new Set(claimersByItemId.get(item.id) ?? [])].sort();
      if (!claimantIds.includes(participantUserId)) {
        return [];
      }

      if (!item.is_shared) {
        return [{
          itemId: item.id,
          name: item.name,
          notes: item.notes,
          quantity: item.quantity,
          isShared: false,
          claimantCount: 1,
          amountCents: item.line_total_cents,
        }];
      }

      const count = claimantIds.length;
      if (count <= 0) {
        return [];
      }

      const baseShare = Math.floor(item.line_total_cents / count);
      const remainder = item.line_total_cents - (baseShare * count);
      const index = claimantIds.indexOf(participantUserId);
      const amountCents = baseShare + (index >= 0 && index < remainder ? 1 : 0);

      return [{
        itemId: item.id,
        name: item.name,
        notes: item.notes,
        quantity: item.quantity,
        isShared: true,
        claimantCount: count,
        amountCents,
      }];
    });
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/app/groups/${groupId}`}
            className="inline-flex min-h-10 items-center rounded-md px-3 text-base font-medium text-slate-700 underline-offset-4 transition hover:bg-slate-100 hover:underline"
          >
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
        {canEditExpense ? (
          <Link
            href={`/app/groups/${groupId}/expenses/${expenseId}/edit`}
            className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-100"
          >
            {tx(locale, 'Edit expense', 'Editar gasto')}
          </Link>
        ) : null}
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
            <span className="font-medium text-slate-900">{formatDate(expense.expense_date, locale)}</span>
          </p>
          <p className="text-sm">
            <span className="text-slate-500">{tx(locale, 'Paid by', 'Pagado por')}:</span>{' '}
            <span className="font-medium text-slate-900">{memberMap.get(expense.paid_by) || tx(locale, 'Unknown', 'Desconocido')}</span>
          </p>
          <p className="text-sm">
            <span className="text-slate-500">{tx(locale, 'Split type', 'Tipo de división')}:</span>{' '}
            <span className="font-medium text-slate-900">{splitTypeLabel}</span>
          </p>
          {expense.is_itemized ? (
            <>
              <p className="text-sm">
                <span className="text-slate-500">{tx(locale, 'Itemized status', 'Estado de itemización')}:</span>{' '}
                <span className="font-medium text-slate-900">{itemizedStatusLabel}</span>
              </p>
              <p className="text-sm">
                <span className="text-slate-500">{tx(locale, 'Assigned total', 'Total asignado')}:</span>{' '}
                <span className="font-medium text-slate-900">
                  {formatCurrency(assignedForStatus, expense.currency)}
                </span>
              </p>
              <p className="text-sm">
                <span className="text-slate-500">{tx(locale, 'Unassigned total', 'Total sin asignar')}:</span>{' '}
                <span className="font-medium text-amber-700">
                  {formatCurrency(unassignedForStatus, expense.currency)}
                </span>
              </p>
              {showGlobalEqualRoundingNote ? (
                <p className="text-xs text-amber-700 sm:col-span-2">
                  {tx(
                    locale,
                    'Equal split rounding applied; remaining cents are ignored to keep shares equal.',
                    'Se aplicó redondeo en la división igual; los centavos restantes se ignoran para mantener partes iguales.',
                  )}
                </p>
              ) : null}
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
                const claimantIds = [...new Set(claimersByItemId.get(item.id) ?? [])];
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
              }) => {
                const participantLines = expense.is_itemized
                  ? getParticipantItemizedLines(participant.user_id)
                  : [];
                const participantItemsSubtotal = participantLines.reduce(
                  (sum, line) => sum + line.amountCents,
                  0,
                );
                const baseAdjustment = expense.is_itemized
                  ? (participant.base_share_amount_cents - participantItemsSubtotal)
                  : 0;
                const tipAndFeeAllocation = participant.share_amount_cents - participant.base_share_amount_cents;
                const hasDetailBreakdown = expense.is_itemized && participantLines.length > 0;

                return (
                  <li key={participant.user_id} className="rounded-md border border-slate-200 p-3 text-sm">
                    {hasDetailBreakdown ? (
                      <details>
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900">
                              {memberMap.get(participant.user_id) || tx(locale, 'Unknown', 'Desconocido')}
                            </p>
                            <p className="text-slate-600">
                              {participantShareDetail(participant)}
                              {participant.share_percentage !== null ? ` (${participant.share_percentage}%)` : ''}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {tx(
                                locale,
                                'Tap to view assigned items',
                                'Toca para ver artículos asignados',
                              )}
                            </p>
                          </div>
                          <p className="text-right text-sm font-semibold text-slate-900">
                            {formatCurrency(participant.share_amount_cents, expense.currency)}
                          </p>
                        </summary>

                        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            {tx(locale, 'Personal receipt', 'Recibo personal')}
                          </p>
                          <ul className="space-y-2">
                            {participantLines.map((line) => (
                              <li key={`${participant.user_id}-${line.itemId}`} className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-slate-900">{line.name}</p>
                                  <p className="text-xs text-slate-500">
                                    {line.isShared
                                      ? tx(
                                        locale,
                                        `Shared by ${line.claimantCount}`,
                                        `Compartido entre ${line.claimantCount}`,
                                      )
                                      : tx(locale, 'Individual item', 'Artículo individual')}
                                    {' • '}
                                    {tx(locale, `Qty ${line.quantity}`, `Cant ${line.quantity}`)}
                                  </p>
                                  {line.notes ? (
                                    <p className="text-xs text-slate-500">{line.notes}</p>
                                  ) : null}
                                </div>
                                <p className="text-sm font-medium text-slate-900">
                                  {formatCurrency(line.amountCents, expense.currency)}
                                </p>
                              </li>
                            ))}
                          </ul>

                          {baseAdjustment !== 0 ? (
                            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-xs text-slate-600">
                              <span>
                                {tx(locale, 'Itemized adjustment', 'Ajuste de itemización')}
                              </span>
                              <span>{formatCurrency(baseAdjustment, expense.currency)}</span>
                            </div>
                          ) : null}

                          {tipAndFeeAllocation > 0 ? (
                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span>
                                {hasTip && hasDeliveryFee
                                  ? tx(locale, 'Tip + delivery allocation', 'Asignación de propina + envío')
                                  : hasTip
                                    ? tx(locale, 'Tip allocation', 'Asignación de propina')
                                    : tx(locale, 'Delivery allocation', 'Asignación de envío')}
                              </span>
                              <span>{formatCurrency(tipAndFeeAllocation, expense.currency)}</span>
                            </div>
                          ) : null}

                          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900">
                            <span>{tx(locale, 'Participant total', 'Total del participante')}</span>
                            <span>{formatCurrency(participant.share_amount_cents, expense.currency)}</span>
                          </div>
                        </div>
                      </details>
                    ) : (
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
                    )}
                  </li>
                );
              },
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
