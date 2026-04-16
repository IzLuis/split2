import Link from 'next/link';
import { ensureProfileAndClient } from '@/lib/auth';
import { getRequestLocale } from '@/lib/i18n/server';
import { tx } from '@/lib/i18n/shared';
import { isIzLuisAdmin } from '@/lib/stats';
import { signOutAction } from './app/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, supabase } = await ensureProfileAndClient();
  const locale = await getRequestLocale();
  let incomingFriendRequests = 0;
  let showAdminStats = false;

  const pendingIncoming = await supabase
    .from('friend_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('addressee_id', user.id);

  if (!pendingIncoming.error) {
    incomingFriendRequests = pendingIncoming.count ?? 0;
  }

  const profileResult = await supabase
    .from('profiles')
    .select('username, full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  if (!profileResult.error) {
    showAdminStats = isIzLuisAdmin({
      username: profileResult.data?.username,
      full_name: profileResult.data?.full_name,
      email: profileResult.data?.email ?? user.email ?? null,
    });
  }

  return (
    <div className="app-shell-bg min-h-screen">
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/app" className="text-lg font-semibold text-slate-900">
            Split2
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{user.email}</span>
            <Link
              href="/app/friends"
              className="relative rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              {tx(locale, 'Friends', 'Amigos')}
              {incomingFriendRequests > 0 ? (
                <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {incomingFriendRequests > 9 ? '9+' : incomingFriendRequests}
                </span>
              ) : null}
            </Link>
            <Link
              href="/app/profile"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              {tx(locale, 'Profile', 'Perfil')}
            </Link>
            {showAdminStats ? (
              <Link
                href="/app/admin/stats"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
              >
                {tx(locale, 'Admin stats', 'Estadísticas admin')}
              </Link>
            ) : null}
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
              >
                {tx(locale, 'Sign out', 'Cerrar sesión')}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 animate-enter">{children}</main>
    </div>
  );
}
