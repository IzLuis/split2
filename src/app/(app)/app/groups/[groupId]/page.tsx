import Link from 'next/link';
import { ensureProfileAndClient } from '@/lib/auth';
import {
  getGroup,
  getGroupBalanceSummary,
  getGroupMembers,
} from '@/lib/group-data';
import { getRequestLocale } from '@/lib/i18n/server';
import { tx } from '@/lib/i18n/shared';
import { deleteEventAction } from './actions';
import { RoleBadge } from '@/components/role-badge';
import { displayName, formatCurrency, formatDate } from '@/lib/utils';
import { LeaveGroupForm } from './leave-group-form';
import { redirect } from 'next/navigation';

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const locale = await getRequestLocale();
  const { user, supabase } = await ensureProfileAndClient();
  const { groupId } = await params;

  const group = await getGroup(supabase, groupId);
  if (!group) {
    redirect('/app');
  }
  const [members, summary] = await Promise.all([
    getGroupMembers(supabase, groupId),
    getGroupBalanceSummary(supabase, groupId, group.calculation_mode ?? 'normal'),
  ]);

  const memberMap = new Map(
    members.map((member) => [member.user_id, displayName(member.profiles)]),
  );
  const currentMember = members.find((member) => member.user_id === user.id);
  const canEditGroup = currentMember?.role === 'owner';
  const canLeaveGroup = currentMember?.role === 'member';
  const getDerivedItemized = (expense: typeof summary.expenses[number]) => {
    const assignedFromParticipants = (expense.participants ?? []).reduce(
      (acc, participant) => acc + participant.share_amount_cents,
      0,
    );
    const unassignedFromParticipants = expense.is_itemized
      ? Math.max(expense.total_amount_cents - assignedFromParticipants, 0)
      : 0;

    return {
      assignedFromParticipants,
      unassignedFromParticipants,
    };
  };

  const unresolvedItemized = summary.expenses.filter((expense) => {
    const derived = getDerivedItemized(expense);
    return expense.is_itemized && derived.unassignedFromParticipants > 0;
  });
  const events = (() => {
    const byEvent = new Map<
      string,
      {
        event: NonNullable<(typeof summary.expenses)[number]['event']>;
        expenses: (typeof summary.expenses)[number][];
        totalsByCurrency: Record<string, number>;
      }
    >();

    for (const expense of summary.expenses) {
      if (!expense.event) {
        continue;
      }

      const existing = byEvent.get(expense.event.id);
      const currency = expense.currency.toUpperCase();
      if (existing) {
        existing.expenses.push(expense);
        existing.totalsByCurrency[currency] =
          (existing.totalsByCurrency[currency] ?? 0) + expense.total_amount_cents;
      } else {
        byEvent.set(expense.event.id, {
          event: expense.event,
          expenses: [expense],
          totalsByCurrency: {
            [currency]: expense.total_amount_cents,
          },
        });
      }
    }

    return [...byEvent.values()].sort((a, b) => a.event.name.localeCompare(b.event.name));
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/app" className="text-sm text-slate-600 underline">
            {tx(locale, 'Back to dashboard', 'Volver al panel')}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{group.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {group.description || tx(locale, 'No description', 'Sin descripción')}
          </p>
        </div>
        <div className="flex gap-2">
          {canEditGroup ? (
            <Link
              href={`/app/groups/${groupId}/edit`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-100"
            >
              {tx(locale, 'Edit group', 'Editar grupo')}
            </Link>
          ) : null}
          {canLeaveGroup ? <LeaveGroupForm groupId={groupId} locale={locale} /> : null}
          <Link
            href={`/app/groups/${groupId}/expenses/new`}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-700"
          >
            {tx(locale, 'Add expense', 'Agregar gasto')}
          </Link>
          <Link
            href={`/app/groups/${groupId}/settlements/new`}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-100"
          >
            {tx(locale, 'Record settlement', 'Registrar pago')}
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">{tx(locale, 'Members', 'Miembros')}</h2>
        <ul className="mt-3 space-y-2">
          {members.map((member) => (
            <li key={member.user_id} className="flex items-center justify-between text-sm">
              <span>{displayName(member.profiles)}</span>
              <div className="flex items-center gap-2">
                <RoleBadge role={member.role} locale={locale} />
                {member.accepted_at === null ? (
                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-700">
                    {tx(locale, 'Pending', 'Pendiente')}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">
          {tx(locale, 'Balance summary', 'Resumen de balances')}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {tx(locale, 'Mode', 'Modo')}: {group.calculation_mode === 'reduced'
            ? tx(locale, 'Reduced transfers', 'Transferencias reducidas')
            : tx(locale, 'Normal', 'Normal')}
        </p>
        {unresolvedItemized.length > 0 ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {unresolvedItemized.length}{' '}
            {tx(locale, 'itemized expense', 'gasto itemizado')}
            {unresolvedItemized.length > 1 ? tx(locale, 's are', 's están') : tx(locale, ' is', ' está')}{' '}
            {tx(
              locale,
              'still partially assigned. Unassigned amounts are not included in balances yet.',
              'aún parcialmente asignado. Los montos sin asignar todavía no se incluyen en los balances.',
            )}
          </p>
        ) : null}
        {summary.statements.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            {tx(locale, 'All settled up in this group.', 'Todo está saldado en este grupo.')}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {summary.statements.map((statement) => (
              <li key={`${statement.fromUserId}-${statement.toUserId}`} className="text-sm text-slate-700">
                <span className="font-medium">{memberMap.get(statement.fromUserId) || tx(locale, 'Unknown', 'Desconocido')}</span>{' '}
                {tx(locale, 'owes', 'debe')}{' '}
                <span className="font-medium">{memberMap.get(statement.toUserId) || tx(locale, 'Unknown', 'Desconocido')}</span>{' '}
                <span className="font-semibold">
                  {formatCurrency(statement.amountCents, summary.expenses[0]?.currency || 'USD')}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {Object.entries(summary.netBalances)
            .sort((a, b) => b[1] - a[1])
            .map(([userId, balance]) => (
              <div key={userId} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{memberMap.get(userId) || tx(locale, 'Unknown', 'Desconocido')}</p>
                <p className={balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {balance >= 0 ? tx(locale, 'Gets back ', 'Recibe ') : tx(locale, 'Owes ', 'Debe ')}
                  {formatCurrency(Math.abs(balance), summary.expenses[0]?.currency || 'USD')}
                </p>
              </div>
            ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">{tx(locale, 'Events', 'Eventos')}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {tx(locale, 'Expenses with the same event are grouped here.', 'Los gastos con el mismo evento se agrupan aquí.')}
        </p>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            {tx(locale, 'No events yet. Add an event when creating an expense.', 'Aún no hay eventos. Agrega uno al crear un gasto.')}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {events.map((event) => (
              <details
                key={event.event.id}
                className="event-accordion group hover-lift rounded-md border border-slate-200 bg-white/80 transition hover:border-slate-300"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-slate-50">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: event.event.color }} />
                    {event.event.name}
                    <span className="text-xs font-normal text-slate-500">
                      ({event.expenses.length}{' '}
                      {event.expenses.length > 1
                        ? tx(locale, 'expenses', 'gastos')
                        : tx(locale, 'expense', 'gasto')})
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {Object.entries(event.totalsByCurrency)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([currency, amountCents]) => formatCurrency(amountCents, currency))
                        .join(' + ')}
                    </span>
                    <span aria-hidden className="event-accordion__chevron text-sm text-slate-500">
                      ⌄
                    </span>
                  </span>
                </summary>

                <div className="event-accordion__content">
                  <div className="event-accordion__inner border-t border-slate-200 px-3 py-3">
                    <ul className="space-y-2">
                      {event.expenses.map((expense) => (
                        <li key={expense.id} className="flex items-center justify-between text-sm">
                          <Link href={`/app/groups/${groupId}/expenses/${expense.id}`} className="underline">
                            {expense.title}
                          </Link>
                          <span className="text-slate-600">
                            {formatCurrency(expense.total_amount_cents, expense.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {canEditGroup ? (
                      <form action={deleteEventAction.bind(null, groupId, event.event.id)} className="mt-3">
                        <button
                          type="submit"
                          className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-50"
                        >
                          {tx(locale, 'Delete event', 'Eliminar evento')}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">
          {tx(locale, 'Expense history', 'Historial de gastos')}
        </h2>
        {summary.expenses.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">{tx(locale, 'No expenses yet.', 'Aún no hay gastos.')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {summary.expenses.map((expense) => {
              const hasTip = (expense.tip_amount_cents ?? 0) > 0 && Number(expense.tip_percentage ?? 0) > 0;
              const hasDeliveryFee = (expense.delivery_fee_cents ?? 0) > 0;
              const derived = getDerivedItemized(expense);
              const subtitleParts = [`${formatCurrency(expense.subtotal_amount_cents, expense.currency)} paid`];
              if (hasTip) {
                subtitleParts.push(
                  `${Number(expense.tip_percentage ?? 0).toFixed(3).replace(/\.?0+$/, '')}% tip`,
                );
              }
              if (hasDeliveryFee) {
                subtitleParts.push(
                  `${formatCurrency(expense.delivery_fee_cents ?? 0, expense.currency)} delivery fee`,
                );
              }
              return (
              <li key={expense.id} className="hover-lift rounded-md border border-slate-200 p-3 transition hover:border-slate-300">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/app/groups/${groupId}/expenses/${expense.id}`}
                      className="font-medium text-slate-900 underline"
                    >
                      {expense.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {formatDate(expense.expense_date)} {tx(locale, 'by', 'por')} {memberMap.get(expense.paid_by) || tx(locale, 'Unknown', 'Desconocido')}
                    </p>
                    {expense.event ? (
                      <span
                        className="mt-1 inline-flex items-center gap-2 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                        style={{ border: `1px solid ${expense.event.color}` }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: expense.event.color }} />
                        {expense.event.name}
                      </span>
                    ) : null}
                    {expense.is_itemized ? (
                      <p className="text-xs text-slate-500">
                        {tx(locale, 'Itemized expense', 'Gasto itemizado')}
                        {derived.unassignedFromParticipants > 0
                          ? ` • ${tx(locale, 'Unassigned', 'Sin asignar')} ${formatCurrency(derived.unassignedFromParticipants, expense.currency)}`
                          : ` • ${tx(locale, 'Fully assigned', 'Completamente asignado')}`}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-medium ${
                        expense.currency !== group.default_currency ? 'text-amber-700' : 'text-slate-900'
                      }`}
                    >
                      {formatCurrency(expense.total_amount_cents, expense.currency)}
                    </p>
                    <p
                      className={`text-xs font-medium ${
                        expense.currency !== group.default_currency ? 'text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      {expense.currency}
                    </p>
                    <p className="text-xs text-slate-500">
                      {subtitleParts.join(' + ')}
                    </p>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">
          {tx(locale, 'Settlement history', 'Historial de pagos')}
        </h2>
        {summary.settlements.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            {tx(locale, 'No settlements recorded yet.', 'Aún no hay pagos registrados.')}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {summary.settlements.map((settlement) => (
              <li key={settlement.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <p>
                  <span className="font-medium">{memberMap.get(settlement.payer_id) || tx(locale, 'Unknown', 'Desconocido')}</span>{' '}
                  {tx(locale, 'paid', 'pagó')}{' '}
                  <span className="font-medium">{memberMap.get(settlement.receiver_id) || tx(locale, 'Unknown', 'Desconocido')}</span>{' '}
                  <span className="font-semibold">
                    {formatCurrency(settlement.amount_cents, settlement.currency)}
                  </span>
                </p>
                <p className="text-xs text-slate-500">{formatDate(settlement.settled_on)}</p>
                {settlement.note ? <p className="mt-1 text-xs text-slate-600">{settlement.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
