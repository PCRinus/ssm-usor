type Sent<Columns> = { [Column in keyof Columns]?: Exclude<Columns[Column], undefined> };

export function sentColumns<Columns extends Record<string, unknown>>(columns: Columns) {
  return Object.fromEntries(
    Object.entries(columns).filter(([, value]) => value !== undefined)
  ) as Sent<Columns>;
}
