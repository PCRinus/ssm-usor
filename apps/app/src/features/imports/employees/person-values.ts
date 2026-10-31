import {
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
    const sheet =
      context.changes.people[person.id]?.fields?.[name]?.value ??
      (field.options.length === 1 ? field.options[0]!.value : null);
    if (sheet === null || sheet === undefined) continue;
    if (field.app === null || field.app === undefined) added.push({ name, field });
    else if (String(field.app).trim().toLowerCase() !== String(sheet).trim().toLowerCase())
      differs.push({ name, field });
    else same.push({ name, field });
  }
  return { added, differs, same };
}
