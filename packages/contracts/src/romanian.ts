// Grouped by hand, as the price list writes it (1.490 €), whatever locale data the runtime has.
export function formatCount(value: number) {
  const [whole = '', fraction] = String(Math.abs(value)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped}${fraction === undefined ? '' : `,${fraction}`}`;
}

// Romanian puts "de" between a number and its noun from 20 on, unless the last two digits are
// 01 to 19: "19 luni", "20 de luni", "101 luni", "120 de luni".
const takesDe = (count: number) => {
  const whole = Math.abs(count);
  const tail = whole % 100;
  return whole >= 20 && (tail === 0 || tail >= 20);
};

export function countNoun(count: number, one: string, many: string) {
  if (count === 1) return one;
  return takesDe(count) ? `de ${many}` : many;
}

export function countOf(count: number, one: string, many: string) {
  return `${formatCount(count)} ${countNoun(count, one, many)}`;
}

export function printedDate(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

export const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('ro') + text.slice(1);

export const uncapitalized = (text: string) =>
  text.charAt(0).toLocaleLowerCase('ro') + text.slice(1);
