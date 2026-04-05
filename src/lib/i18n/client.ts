'use client';

import { useState } from 'react';
import { resolveLocale, type Locale } from './shared';

export function useUiLocale() {
  const [locale] = useState<Locale>(() => {
    if (typeof document === 'undefined') {
      return 'en';
    }

    const htmlLang = document.documentElement.lang;
    const browserLocale = navigator.language;
    return resolveLocale(htmlLang || browserLocale);
  });

  return locale;
}
