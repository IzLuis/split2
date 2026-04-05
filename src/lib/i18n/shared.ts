export type Locale = 'en' | 'es';

export const DEFAULT_LOCALE: Locale = 'en';

export function resolveLocale(input: string | null | undefined): Locale {
  const normalized = String(input ?? '')
    .trim()
    .toLowerCase();

  if (normalized.startsWith('es')) {
    return 'es';
  }

  return 'en';
}

export function resolveLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) {
    return DEFAULT_LOCALE;
  }

  const candidates = header
    .split(',')
    .map((entry) => entry.split(';')[0]?.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const locale = resolveLocale(candidate);
    if (locale === 'es') {
      return 'es';
    }
  }

  return 'en';
}

export function tx(locale: Locale, english: string, spanish: string) {
  return locale === 'es' ? spanish : english;
}
