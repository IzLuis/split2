import clsx from 'clsx';
import { tx, type Locale } from '@/lib/i18n/shared';

export function RoleBadge({
  role,
  locale = 'en',
}: {
  role: 'owner' | 'member';
  locale?: Locale;
}) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
        role === 'owner'
          ? 'border-violet-200 bg-violet-100 text-violet-700'
          : 'border-emerald-200 bg-emerald-100 text-emerald-700',
      )}
    >
      {role === 'owner' ? tx(locale, 'Owner', 'Propietario') : tx(locale, 'Member', 'Miembro')}
    </span>
  );
}
