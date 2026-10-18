// "Popescu Maria", "Maria POPESCU" and "Maria-Popescu" are one person: a member's profile writes
// the given name first, an employee row the family name first, and diacritics come and go.
export const personNameKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .sort()
    .join(' ');

export const samePerson = (a: string, b: string) => {
  const key = personNameKey(a);
  return key !== '' && key === personNameKey(b);
};
