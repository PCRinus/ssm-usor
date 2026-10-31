import {
  differs as differ,
  type FieldName,
  type FieldValue,
  type Person,
  type ResolvedField,
  resolveField,
  type ReviewContext,
} from './employee-review-model';
import { dateLabel } from './review-format';

export const dateFields = new Set<FieldName>(['birthDate', 'hiredAt', 'leftOn']);

export const rhLabels: Record<string, string> = { '+': 'pozitiv', '-': 'negativ' };

export function showValue(name: FieldName, value: FieldValue | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  if (dateFields.has(name)) return dateLabel(String(value));
  if (name === 'rhFactor') return `Rh ${rhLabels[String(value)] ?? value}`;
  if (name === 'commuteMinutes') return `${value} min`;
  return String(value);
}

type Compared = { name: FieldName; field: ResolvedField };

export function compareWithApp(context: ReviewContext, person: Person) {
  const added: Compared[] = [];
  const differs: Compared[] = [];
  const same: Compared[] = [];
  for (const name of Object.keys(person.fields) as FieldName[]) {
    if (name === 'workplace' || name === 'leftOn') continue;
    const field = resolveField(context, person, name);
    const written = context.changes.people[person.id]?.fields?.[name]?.value;
    if (written === null) {
      if (field.app === null || field.app === undefined) added.push({ name, field });
      continue;
    }
    const sheet = written ?? (field.options.length === 1 ? field.options[0]!.value : null);
    if (sheet === null) continue;
    if (field.app === null || field.app === undefined) added.push({ name, field });
    // Confirming replaces the app's value with one the member wrote unless equal, and with the
    // sheet's only when they differ past case, spacing and diacritics.
    else if (written !== undefined ? written !== field.app : differ(field.app, sheet))
      differs.push({ name, field });
    else same.push({ name, field });
  }
  return { added, differs, same };
}
