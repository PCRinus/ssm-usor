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
