import { ensureProfileAndClient } from '@/lib/auth';
import { getRequestLocale } from '@/lib/i18n/server';
import { tx } from '@/lib/i18n/shared';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getProfileStats, isIzLuisAdmin, sortCurrencyTotals } from '@/lib/stats';
import type { ProfileFormState } from './actions';
import { ProfileForm } from './profile-form';
import Link from 'next/link';

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

  return (
    <div className="space-y-5">
      <ProfileForm initialState={initialState} email={user.email ?? ''} locale={locale} />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-slate-900">
            {tx(locale, 'Your stats', 'Tus estadísticas')}
          </h2>
          {isAdmin ? (
            <Link
              href="/app/admin/stats"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {tx(locale, 'Global admin stats', 'Estadísticas globales')}
            </Link>
          ) : null}
        </div>

        {statsError ? (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {statsError}
          </p>
        ) : stats ? (
          <div className="mt-3 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{tx(locale, 'Active groups', 'Grupos activos')}</p>
                <p className="text-xl font-semibold text-slate-900">{stats.groupsCount}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{tx(locale, 'Groups owned', 'Grupos que administras')}</p>
                <p className="text-xl font-semibold text-slate-900">{stats.ownedGroupsCount}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{tx(locale, 'Expenses created', 'Gastos creados')}</p>
                <p className="text-xl font-semibold text-slate-900">{stats.createdExpensesCount}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{tx(locale, 'Itemized ratio', 'Ratio itemizado')}</p>
                <p className="text-xl font-semibold text-slate-900">
                  {stats.createdExpensesCount > 0
                    ? `${Math.round((stats.itemizedExpensesCount / stats.createdExpensesCount) * 100)}%`
                    : '0%'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">{tx(locale, 'Total paid', 'Total pagado')}</p>
                {sortCurrencyTotals(stats.paidTotalsByCurrency).length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">—</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {sortCurrencyTotals(stats.paidTotalsByCurrency).map(([currency, amount]) => (
                      <li key={`paid-${currency}`}>{formatCurrency(amount, currency)}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">{tx(locale, 'Your shares', 'Tus consumos')}</p>
                {sortCurrencyTotals(stats.shareTotalsByCurrency).length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">—</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {sortCurrencyTotals(stats.shareTotalsByCurrency).map(([currency, amount]) => (
                      <li key={`shares-${currency}`}>{formatCurrency(amount, currency)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-900">{tx(locale, 'Net balance impact', 'Impacto neto en balance')}</p>
              <p className="mt-1 text-xs text-slate-500">
                {tx(
                  locale,
                  'Paid - shares + settlements received - settlements paid',
                  'Pagado - consumos + pagos recibidos - pagos enviados',
                )}
              </p>
              {sortCurrencyTotals(stats.netTotalsByCurrency).length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">—</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {sortCurrencyTotals(stats.netTotalsByCurrency).map(([currency, amount]) => (
                    <li
                      key={`net-${currency}`}
                      className={amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                    >
                      {formatCurrency(Math.abs(amount), currency)} {amount >= 0
                        ? tx(locale, 'in your favor', 'a tu favor')
                        : tx(locale, 'against you', 'en tu contra')}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">{tx(locale, 'Favorite split style', 'Tu estilo favorito de división')}</p>
                <p className="mt-1 text-sm text-slate-700">
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
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">{tx(locale, 'OCR scans used', 'Escaneos OCR usados')}</p>
                <p className="mt-1 text-sm text-slate-700">{stats.ocrScansCount}</p>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-900">{tx(locale, 'Your biggest expense', 'Tu gasto más grande')}</p>
              {stats.largestExpense ? (
                <p className="mt-1 text-sm text-slate-700">
                  {stats.largestExpense.title} · {formatCurrency(stats.largestExpense.amountCents, stats.largestExpense.currency)} · {formatDate(stats.largestExpense.date, locale)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">—</p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            {tx(locale, 'No stats yet.', 'Aún no hay estadísticas.')}
          </p>
        )}
      </section>
    </div>
  );
}
