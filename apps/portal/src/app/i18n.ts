import { i18n, type Messages } from '@lingui/core';

import { messages as en } from '@/locales/en/messages';
import { messages as ro } from '@/locales/ro/messages';

const catalogs = { ro, en } satisfies Record<string, Messages>;

export type Locale = keyof typeof catalogs;

export const sourceLocale: Locale = 'ro';

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && Object.hasOwn(catalogs, value);

export function activateLocale(locale: Locale) {
  i18n.loadAndActivate({ locale, messages: catalogs[locale] });
  document.documentElement.lang = locale;
}

export { i18n };
