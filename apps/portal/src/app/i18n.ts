import { i18n, type Messages } from '@lingui/core';

import { messages as ro } from '@/locales/ro/messages';

const catalogs = { ro } satisfies Record<string, Messages>;

export type Locale = keyof typeof catalogs;

export const sourceLocale: Locale = 'ro';

export function activateLocale(locale: Locale) {
  i18n.loadAndActivate({ locale, messages: catalogs[locale] });
  document.documentElement.lang = locale;
}

export { i18n };
