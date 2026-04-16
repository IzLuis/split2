import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensureProfileAndClient } from '@/lib/auth';
import { getRequestLocale } from '@/lib/i18n/server';
import { tx } from '@/lib/i18n/shared';
import {
  getGlobalAdminStats,
  isIzLuisAdmin,
  sortCurrencyTotals,
} from '@/lib/stats';
import { formatCurrency } from '@/lib/utils';

export default async function AdminStatsPage() {
  const locale = await getRequestLocale();
  const { user, supabase } = await ensureProfileAndClient();

  const profileResult = await supabase
    .from('profiles')
    .select('username, full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const allowed = !profileResult.error
    && isIzLuisAdmin({
      username: profileResult.data?.username,
      full_name: profileResult.data?.full_name,
      email: profileResult.data?.email ?? user.email ?? null,
    });

  if (!allowed) {
    redirect('/app');
  }

  const { stats, error } = await getGlobalAdminStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/app"
            className="inline-flex min-h-10 items-center rounded-md px-3 text-base font-medium text-slate-700 underline-offset-4 transition hover:bg-slate-100 hover:underline"
          >
            {tx(locale, 'Back to dashboard', 'Volver al panel')}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {tx(locale, 'Global admin stats', 'Estadísticas globales')}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {tx(
              locale,
              'Private overview for IzLuis across all app data.',
              'Resumen privado para IzLuis de todos los datos de la app.',
            )}
          </p>
        </div>
      </div>

      {error ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </section>
      ) : stats ? (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{tx(locale, 'Users', 'Usuarios')}</p>
              <p className="text-xl font-semibold text-slate-900">{stats.usersCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{tx(locale, 'Placeholder users', 'Usuarios temporales')}</p>
              <p className="text-xl font-semibold text-slate-900">{stats.dummyUsersCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{tx(locale, 'Groups', 'Grupos')}</p>
              <p className="text-xl font-semibold text-slate-900">{stats.groupsCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{tx(locale, 'Active memberships', 'Membresías activas')}</p>
              <p className="text-xl font-semibold text-slate-900">{stats.activeMembershipsCount}</p>
            </article>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{tx(locale, 'Expenses', 'Gastos')}</p>
              <p className="text-xl font-semibold text-slate-900">{stats.expensesCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{tx(locale, 'Itemized expenses', 'Gastos itemizados')}</p>
              <p className="text-xl font-semibold text-slate-900">{stats.itemizedExpensesCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{tx(locale, 'Settlements', 'Pagos')}</p>
              <p className="text-xl font-semibold text-slate-900">{stats.settlementsCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{tx(locale, 'OCR scans', 'Escaneos OCR')}</p>
              <p className="text-xl font-semibold text-slate-900">{stats.ocrScansCount}</p>
            </article>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <h2 className="text-sm font-medium text-slate-900">
                {tx(locale, 'Expense totals by currency', 'Totales de gastos por moneda')}
              </h2>
              {sortCurrencyTotals(stats.expenseTotalsByCurrency).length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">—</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {sortCurrencyTotals(stats.expenseTotalsByCurrency).map(([currency, amount]) => (
                    <li key={`expense-total-${currency}`}>{formatCurrency(amount, currency)}</li>
                  ))}
                </ul>
              )}
            </article>

            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <h2 className="text-sm font-medium text-slate-900">
                {tx(locale, 'Settlement totals by currency', 'Totales de pagos por moneda')}
              </h2>
              {sortCurrencyTotals(stats.settlementTotalsByCurrency).length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">—</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {sortCurrencyTotals(stats.settlementTotalsByCurrency).map(([currency, amount]) => (
                    <li key={`settlement-total-${currency}`}>{formatCurrency(amount, currency)}</li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-900">
                {tx(locale, 'Pending invites', 'Invitaciones pendientes')}
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{stats.pendingInvitesCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-900">
                {tx(locale, 'Pending friend requests', 'Solicitudes de amistad pendientes')}
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{stats.pendingFriendRequestsCount}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-900">
                {tx(locale, 'Largest expense', 'Gasto más grande')}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {stats.largestExpense
                  ? `${formatCurrency(stats.largestExpense.amountCents, stats.largestExpense.currency)} · ${stats.largestExpense.groupName}`
                  : '—'}
              </p>
            </article>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <h2 className="text-sm font-medium text-slate-900">
                {tx(locale, 'Top spenders', 'Mayores gastadores')}
              </h2>
              {stats.topSpenders.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">—</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {stats.topSpenders.map((spender) => (
                    <li key={spender.userId} className="rounded-md border border-slate-200 p-2 text-sm">
                      <p className="font-medium text-slate-900">{spender.label}</p>
                      <p className="text-xs text-slate-500">
                        {spender.expensesCount} {tx(locale, 'expenses', 'gastos')}
                      </p>
                      <p className="mt-1 text-xs text-slate-700">
                        {sortCurrencyTotals(spender.totalsByCurrency)
                          .map(([currency, amount]) => formatCurrency(amount, currency))
                          .join(' + ')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <h2 className="text-sm font-medium text-slate-900">
                {tx(locale, 'Busiest groups', 'Grupos más activos')}
              </h2>
              {stats.busiestGroups.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">—</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {stats.busiestGroups.map((group) => (
                    <li key={group.groupId} className="rounded-md border border-slate-200 p-2 text-sm">
                      <p className="font-medium text-slate-900">{group.label}</p>
                      <p className="text-xs text-slate-500">
                        {group.expensesCount} {tx(locale, 'expenses', 'gastos')}
                      </p>
                      <p className="mt-1 text-xs text-slate-700">
                        {sortCurrencyTotals(group.totalsByCurrency)
                          .map(([currency, amount]) => formatCurrency(amount, currency))
                          .join(' + ')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </div>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-600 shadow-sm">
          {tx(locale, 'No stats available yet.', 'Aún no hay estadísticas disponibles.')}
        </section>
      )}
    </div>
  );
}
