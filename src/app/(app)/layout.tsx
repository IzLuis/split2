import Link from 'next/link';
import { ensureProfile } from '@/lib/auth';
import { getRequestLocale } from '@/lib/i18n/server';
import { tx } from '@/lib/i18n/shared';
import { signOutAction } from './app/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await ensureProfile();
  const locale = await getRequestLocale();

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
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              {tx(locale, 'Friends', 'Amigos')}
            </Link>
            <Link
              href="/app/profile"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100"
            >
              {tx(locale, 'Profile', 'Perfil')}
            </Link>
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
