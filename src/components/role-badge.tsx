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
        'role-badge',
        role === 'owner' ? 'role-badge--owner' : 'role-badge--member',
      )}
    >
      {role === 'owner' ? tx(locale, 'Owner', 'Propietario') : tx(locale, 'Member', 'Miembro')}
    </span>
  );
}
