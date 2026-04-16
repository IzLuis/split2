import Link from 'next/link';
import { ensureProfileAndClient } from '@/lib/auth';
import { getRequestLocale } from '@/lib/i18n/server';
import { tx } from '@/lib/i18n/shared';
import { getProfileStats, isIzLuisAdmin, sortCurrencyTotals } from '@/lib/stats';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { ProfileFormState } from './actions';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const locale = await getRequestLocale();
  const { user, supabase } = await ensureProfileAndClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, username, email')
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

  let statsError: string | null = null;
  let stats: Awaited<ReturnType<typeof getProfileStats>> | null = null;
  try {
    stats = await getProfileStats(supabase, user.id);
  } catch (statsLoadError) {
    statsError = statsLoadError instanceof Error ? statsLoadError.message : 'Could not load profile stats.';
  }

  const isAdmin = isIzLuisAdmin({
    username: profile?.username,
    full_name: profile?.full_name,
    email: profile?.email ?? user.email ?? null,
  });

  const itemizedRatio = stats && stats.createdExpensesCount > 0
    ? Math.round((stats.itemizedExpensesCount / stats.createdExpensesCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <ProfileForm initialState={initialState} email={user.email ?? ''} locale={locale} />

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              {tx(locale, 'Your stats dashboard', 'Dashboard de estadísticas')}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {tx(
                locale,
                'A quick snapshot of your activity, spending, and balance impact.',
                'Un resumen visual de tu actividad, tus gastos y tu impacto en balances.',
              )}
            </p>
          </div>
          {isAdmin ? (
            <Link
              href="/app/admin/stats"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {tx(locale, 'View global admin stats', 'Ver estadísticas globales')}
            </Link>
          ) : null}
        </div>

        {statsError ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {statsError}
          </p>
        ) : stats ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {tx(locale, 'Active groups', 'Grupos activos')}
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{stats.groupsCount}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {tx(locale, 'Groups owned', 'Grupos que administras')}
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{stats.ownedGroupsCount}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {tx(locale, 'Expenses created', 'Gastos creados')}
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{stats.createdExpensesCount}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {tx(locale, 'OCR scans', 'Escaneos OCR')}
                </p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{stats.ocrScansCount}</p>
              </article>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  {tx(locale, 'Total paid', 'Total pagado')}
                </h3>
                {sortCurrencyTotals(stats.paidTotalsByCurrency).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">—</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {sortCurrencyTotals(stats.paidTotalsByCurrency).map(([currency, amount]) => (
                      <li key={`paid-${currency}`}>{formatCurrency(amount, currency)}</li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  {tx(locale, 'Your shares', 'Tus consumos')}
                </h3>
                {sortCurrencyTotals(stats.shareTotalsByCurrency).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">—</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {sortCurrencyTotals(stats.shareTotalsByCurrency).map(([currency, amount]) => (
                      <li key={`shares-${currency}`}>{formatCurrency(amount, currency)}</li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  {tx(locale, 'Net balance impact', 'Impacto neto')}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {tx(
                    locale,
                    'Paid - shares + settlements received - settlements paid',
                    'Pagado - consumos + pagos recibidos - pagos enviados',
                  )}
                </p>
                {sortCurrencyTotals(stats.netTotalsByCurrency).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">—</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {sortCurrencyTotals(stats.netTotalsByCurrency).map(([currency, amount]) => (
                      <li
                        key={`net-${currency}`}
                        className={amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                      >
                        {formatCurrency(Math.abs(amount), currency)}{' '}
                        {amount >= 0
                          ? tx(locale, 'in your favor', 'a tu favor')
                          : tx(locale, 'against you', 'en tu contra')}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  {tx(locale, 'Itemized usage', 'Uso de itemizados')}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {stats.itemizedExpensesCount}/{stats.createdExpensesCount}{' '}
                  {tx(locale, 'expenses are itemized', 'gastos son itemizados')}
                </p>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-900 transition-all"
                    style={{ width: `${itemizedRatio}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">{itemizedRatio}%</p>
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  {tx(locale, 'Settlement activity', 'Actividad de pagos')}
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {tx(locale, 'Paid', 'Pagaste')}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {stats.settlementsPaidCount}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {tx(locale, 'Received', 'Recibiste')}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {stats.settlementsReceivedCount}
                    </p>
                  </div>
                </div>
              </article>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  {tx(locale, 'Favorite split style', 'Tu división favorita')}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {stats.favoriteSplitType
                    ? (
                      stats.favoriteSplitType === 'equal'
                        ? tx(locale, 'Equal split', 'División igual')
                        : stats.favoriteSplitType === 'custom'
                          ? tx(locale, 'Custom amounts', 'Montos personalizados')
                          : tx(locale, 'Percentages', 'Porcentajes')
                    )
                    : '—'}
                </p>
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  {tx(locale, 'Your biggest expense', 'Tu gasto más grande')}
                </p>
                {stats.largestExpense ? (
                  <p className="mt-2 text-sm text-slate-700">
                    {stats.largestExpense.title} ·{' '}
                    {formatCurrency(stats.largestExpense.amountCents, stats.largestExpense.currency)} ·{' '}
                    {formatDate(stats.largestExpense.date, locale)}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">—</p>
                )}
              </article>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            {tx(locale, 'No stats yet.', 'Aún no hay estadísticas.')}
          </p>
        )}
      </section>
    </div>
  );
}
