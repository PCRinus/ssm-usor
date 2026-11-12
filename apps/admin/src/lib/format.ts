// Bucharest, where the members and the support work, whatever the admin's machine says.
const timeZone = 'Europe/Bucharest';

const dateTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone,
});
const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone });
const time = new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone });

export const formatDateTime = (value: string | null) =>
  value ? dateTime.format(new Date(value)) : '—';

export const formatDate = (value: string | null) => (value ? date.format(new Date(value)) : '—');

export const formatTime = (value: string) => time.format(new Date(value));
