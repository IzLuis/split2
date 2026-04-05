import Link from 'next/link';
import { ensureProfile } from '@/lib/auth';
import { getUserGroups } from '@/lib/group-data';
import { getRequestLocale } from '@/lib/i18n/server';
import { tx } from '@/lib/i18n/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RoleBadge } from '@/components/role-badge';

export default async function DashboardPage() {
  const locale = await getRequestLocale();
  const user = await ensureProfile();
  const client = await createSupabaseServerClient();
  const groups = await getUserGroups(client, user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {tx(locale, 'Your groups', 'Tus grupos')}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {tx(
              locale,
              'Track expenses with friends, family, and trips.',
              'Controla gastos con amigos, familia y viajes.',
            )}
          </p>
        </div>
        <Link
          href="/app/groups/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-700"
        >
          {tx(locale, 'New group', 'Nuevo grupo')}
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/95 p-8 text-center shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">
            {tx(locale, 'No groups yet', 'Aún no tienes grupos')}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {tx(
              locale,
              'Create your first group to start adding shared expenses.',
              'Crea tu primer grupo para comenzar a registrar gastos compartidos.',
            )}
          </p>
          <Link
            href="/app/groups/new"
            className="mt-4 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-700"
          >
            {tx(locale, 'Create your first group', 'Crea tu primer grupo')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/app/groups/${group.id}`}
              className="hover-lift rounded-xl border border-slate-200 bg-white/95 p-4 transition hover:border-slate-300"
            >
              <p className="text-lg font-medium text-slate-900">{group.name}</p>
              <p className="mt-1 text-sm text-slate-600">
                {group.description || tx(locale, 'No description', 'Sin descripción')}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <span className="uppercase tracking-wide">{tx(locale, 'Role', 'Rol')}</span>
                <RoleBadge role={group.role} locale={locale} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
