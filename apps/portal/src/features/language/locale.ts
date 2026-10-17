import { useLayoutEffect } from 'react';

import { activateLocale, i18n, isLocale, type Locale } from '@/app/i18n';

const storageKey = 'ssm-usor.portal.language';

const browserLanguages = () =>
  navigator.languages.length > 0 ? navigator.languages : [navigator.language];

export function browserLocale(languages: readonly string[] = browserLanguages()): Locale {
  return languages.some((language) => language.toLowerCase().startsWith('ro')) ? 'ro' : 'en';
}

// Storage can be unavailable (a private window, blocked site data); the browser's languages
// decide then.
export function readDeviceLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(storageKey);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function rememberDeviceLocale(locale: Locale) {
  try {
    localStorage.setItem(storageKey, locale);
  } catch {
    return;
  }
}

export const deviceLocale = () => readDeviceLocale() ?? browserLocale();

// A layout effect, so a participation's language replaces the device's before the first paint.
export function useActiveLocale(locale: Locale) {
  useLayoutEffect(() => {
    if (i18n.locale !== locale) activateLocale(locale);
  }, [locale]);
}

export function chooseDeviceLocale(locale: Locale) {
  rememberDeviceLocale(locale);
  activateLocale(locale);
}
