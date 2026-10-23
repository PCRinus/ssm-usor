export function fail(lines: string[]): never {
  const prefix = process.env.GITHUB_ACTIONS === 'true' ? '::error::' : '';
  for (const line of lines) console.error(`${prefix}${line}`);
  process.exit(1);
}

export function required(value: string | undefined, name: string): string {
  if (value === undefined || value === '') fail([`Missing --${name}.`]);
  return value;
}
