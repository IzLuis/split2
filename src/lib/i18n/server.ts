import { headers } from 'next/headers';
import { resolveLocaleFromAcceptLanguage, type Locale } from './shared';

export async function getRequestLocale(): Promise<Locale> {
  const headerStore = await headers();
  return resolveLocaleFromAcceptLanguage(headerStore.get('accept-language'));
}
