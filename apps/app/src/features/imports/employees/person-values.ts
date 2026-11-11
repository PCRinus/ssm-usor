import { isValidCnp } from '@ssm-usor/contracts';

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
    else if (written !== undefined ? written !== field.app : differ(name, field.app, sheet))
      differs.push({ name, field });
    else same.push({ name, field });
  }
  return { added, differs, same };
}

export function fieldProblem(name: FieldName, value: string, initial = '') {
  const text = value.trim();
  if (
    name === 'commuteMinutes' &&
    text !== '' &&
    !(/^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= 600)
  ) {
    return 'Scrie un număr de minute între 1 și 600.';
  }
  if (name === 'cnp' && value !== initial && text !== '' && !isValidCnp(text)) {
    return 'CNP-ul nu e valid. Verifică cele 13 cifre.';
  }
  return null;
}

export const typedValue = (name: FieldName, value: string): FieldValue | null => {
  const text = value.trim();
  if (text === '') return null;
  return name === 'commuteMinutes' ? Number(text) : text;
};
