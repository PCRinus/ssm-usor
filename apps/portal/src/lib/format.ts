import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

const intlLocales: Record<string, string> = { ro: 'ro-RO', en: 'en-GB' };

export const intlLocaleOf = (locale: string) => intlLocales[locale] ?? locale;

export type DateStyle = 'long' | 'short';

export function formatDate(isoDate: string, locale: string, style: DateStyle = 'long') {
  return new Intl.DateTimeFormat(intlLocaleOf(locale), {
    day: 'numeric',
    month: style,
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function useFormatDate() {
  const { i18n } = useLingui();
  return (isoDate: string, style: DateStyle = 'long') => formatDate(isoDate, i18n.locale, style);
}

export function useFormatList() {
  const { i18n } = useLingui();
  return (items: string[]) =>
    new Intl.ListFormat(intlLocaleOf(i18n.locale), { style: 'short', type: 'unit' }).format(items);
}

export function useFormatDuration() {
  const { t } = useLingui();
  return (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const hoursText = t({
      message: plural(hours, { one: '# oră', few: '# ore', other: '# de ore' }),
    });
    const minutesText = t({
      message: plural(rest, { one: '# minut', few: '# minute', other: '# de minute' }),
    });
    if (hours === 0) return minutesText;
    if (rest === 0) return hoursText;
    return t`${hoursText} și ${minutesText}`;
  };
}

export const formatPerson = (person: { name: string; jobTitle: string }) =>
  person.jobTitle ? `${person.name}, ${person.jobTitle}` : person.name;

// Supabase keeps a phone without its plus sign.
export function formatSignInAddress(user: { email?: string; phone?: string }) {
  if (user.email) return user.email;
  if (user.phone) return user.phone.startsWith('+') ? user.phone : `+${user.phone}`;
  return '';
}

export function initialsOf(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toLocaleUpperCase())
    .join('');
}
