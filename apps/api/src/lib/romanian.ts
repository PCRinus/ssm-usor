/** Romanian puts "de" between a number and its noun from 20 on, except 101 to 119 and the like. */
export function countOf(count: number, one: string, many: string) {
  if (count === 1) return `1 ${one}`;
  const lastTwo = count % 100;
  return count >= 20 && (lastTwo === 0 || lastTwo >= 20)
    ? `${count} de ${many}`
    : `${count} ${many}`;
}

export function listed(items: readonly string[]) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} și ${items.at(-1)}`;
}

const isLowerCaseLetter = (character: string) =>
  character !== character.toLocaleUpperCase('ro') &&
  character === character.toLocaleLowerCase('ro');

/**
 * A value typed to stand alone, as it reads inside a sentence: "Mecanic auto" becomes "mecanic
 * auto". A first word in capitals is an acronym and stays: "PSI", "ISU Brașov".
 */
export function runOn(text: string) {
  const [first, second] = [...text];
  if (!first || !second || !isLowerCaseLetter(second)) return text;
  return first.toLocaleLowerCase('ro') + text.slice(first.length);
}

export function withoutFinalStop(text: string) {
  return text.replace(/(?<!\.)[.;]$/, '');
}
