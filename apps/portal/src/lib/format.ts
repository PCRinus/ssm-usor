const dateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(isoDate: string) {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export const formatPerson = (person: { name: string; jobTitle: string }) =>
  person.jobTitle ? `${person.name}, ${person.jobTitle}` : person.name;

// Supabase keeps a phone without its plus sign.
export function formatSignInAddress(user: { email?: string; phone?: string }) {
  if (user.email) return user.email;
  if (user.phone) return user.phone.startsWith('+') ? user.phone : `+${user.phone}`;
  return '';
}
