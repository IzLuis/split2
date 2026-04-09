export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

export function formatDate(date: string, locale: 'en' | 'es' = 'en') {
  const formatLocale = locale === 'es' ? 'es-MX' : 'en-GB';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00.000Z`)
    : new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat(formatLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(parsed);
}

export function toCents(amount: string) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function toNonNegativeCents(amount: string) {
  const normalized = amount.trim();
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function displayName(
  profile: { full_name: string | null; email: string; is_dummy?: boolean | null } | null,
) {
  if (!profile) {
    return 'Unknown';
  }

  const fallback = profile.is_dummy ? 'Placeholder member' : profile.email;
  return profile.full_name?.trim() || fallback;
}

export function formatMemberLabel(
  profile: { full_name: string | null; email: string; is_dummy?: boolean | null } | null,
  locale: 'en' | 'es' = 'en',
) {
  const label = displayName(profile);
  if (!profile?.is_dummy) {
    return label;
  }

  return locale === 'es' ? `${label} (Temporal)` : `${label} (Placeholder)`;
}
