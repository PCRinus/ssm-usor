import {
  type FireSubstanceDetail,
  fireSubstanceDetailLabels,
  fireSubstanceDetails,
  type FireSubstanceEssential,
  type FireSubstancesState,
  missingSubstanceEssentials,
  type SafetySheetDraft,
  type SafetySheetDraftField,
  safetySheetDraftFields,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { FireSubstanceRequest, FireSubstancesResponse } from '@/api/generated/api';

export type FireSubstance = FireSubstancesResponse['items'][number];

export const substancesCardId = 'fire-substances';
export const substancesChoiceId = 'fire-substances-choice';
export const substanceAddId = 'fire-substance-add';

export const substancesChoices: {
  state: Exclude<FireSubstancesState, 'undecided'>;
  label: string;
}[] = [
  { state: 'none', label: 'Nu se utilizează substanțe periculoase' },
  { state: 'listed', label: 'Se utilizează, lista de mai jos' },
];

/** "Nicio substanță", "1 substanță", "3 substanțe", "20 de substanțe". */
export function substanceCountLabel(count: number) {
  if (count === 0) return 'Nicio substanță';
  if (count === 1) return '1 substanță';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de substanțe` : `${count} substanțe`;
}

export const substanceDetailMaxLengths: Record<FireSubstanceDetail, number> = {
  physicalChemicalProperties: 1000,
  identificationCodes: 600,
  healthEnvironmentRisks: 1000,
  protectionMeans: 1000,
  interventionMeasures: 1000,
  extinguishingAgents: 600,
  storagePlace: 600,
  handling: 1000,
};

export const substanceDetailPlaceholders: Record<FireSubstanceDetail, string> = {
  physicalChemicalProperties: 'de exemplu, gaz lichefiat, mai greu decât aerul, inodor',
  identificationCodes: 'de exemplu, CAS 74-98-6, UN 1978',
  healthEnvironmentRisks: 'de exemplu, asfixiant în concentrații mari; degeraturi la contact',
  protectionMeans: 'de exemplu, mănuși de protecție, ochelari',
  interventionMeasures: 'de exemplu, se închide robinetul buteliei și se aerisește încăperea',
  extinguishingAgents: 'de exemplu, pulbere, CO₂, apă pulverizată pentru răcire',
  storagePlace: 'de exemplu, cușca metalică ventilată din curte',
  handling: 'de exemplu, numai de personal instruit, departe de surse de aprindere',
};

export const substanceDetailHint = (detail: FireSubstanceDetail) =>
  `Din ${fireSubstanceDetailLabels[detail].dataSheet}. Necompletat, apare în listă ca loc de completat.`;

const requiredText = (min: number, max: number, empty: string, what: string) =>
  z
    .string()
    .trim()
    .min(1, empty)
    .max(max, `${what} are cel mult ${max} de caractere.`)
    .refine((value) => value.length >= min, `${what} are cel puțin ${min} caractere.`);

const optionalText = (max: number, what: string, min = 2) =>
  z
    .string()
    .trim()
    .max(max, `${what} are cel mult ${max} de caractere.`)
    .refine(
      (value) => value.length === 0 || value.length >= min,
      `${what} are cel puțin ${min} caractere.`
    );

const detailFields = Object.fromEntries(
  fireSubstanceDetails.map((detail) => [
    detail,
    optionalText(substanceDetailMaxLengths[detail], 'Textul'),
  ])
) as Record<FireSubstanceDetail, ReturnType<typeof optionalText>>;

// Form values are strings so inputs stay controlled; the API request is derived on submit.
export const substanceFormSchema = z.object({
  name: requiredText(2, 160, 'Scrie denumirea substanței.', 'Denumirea'),
  classification: optionalText(600, 'Clasificarea'),
  quantity: optionalText(160, 'Cantitatea', 1),
  ...detailFields,
});

export type SubstanceFormValues = z.infer<typeof substanceFormSchema>;

export function newSubstanceForm(): SubstanceFormValues {
  return {
    name: '',
    classification: '',
    quantity: '',
    ...(Object.fromEntries(fireSubstanceDetails.map((detail) => [detail, ''])) as Record<
      FireSubstanceDetail,
      string
    >),
  };
}

export function toSubstanceForm(substance: FireSubstance): SubstanceFormValues {
  return {
    name: substance.name,
    classification: substance.classification ?? '',
    quantity: substance.quantity ?? '',
    ...(Object.fromEntries(
      fireSubstanceDetails.map((detail) => [detail, substance[detail] ?? ''])
    ) as Record<FireSubstanceDetail, string>),
  };
}

export function toSubstanceRequest(values: SubstanceFormValues): FireSubstanceRequest {
  return {
    name: values.name,
    classification: values.classification || null,
    quantity: values.quantity || null,
    ...(Object.fromEntries(
      fireSubstanceDetails.map((detail) => [detail, values[detail] || null])
    ) as Record<FireSubstanceDetail, string | null>),
  };
}

export const unfilledDetailCount = (substance: FireSubstance) =>
  fireSubstanceDetails.filter((detail) => !substance[detail]).length;

const essentialLabels: Record<FireSubstanceEssential, string> = {
  classification: 'clasificarea',
  quantity: 'cantitatea',
};

/** "Lipsește cantitatea", "Lipsesc clasificarea și cantitatea"; null for a complete entry. */
export function missingEssentialsLabel(substance: Record<FireSubstanceEssential, string | null>) {
  const missing = missingSubstanceEssentials(substance).map((field) => essentialLabels[field]);
  if (missing.length === 0) return null;
  return missing.length === 1 ? `Lipsește ${missing[0]}` : `Lipsesc ${missing.join(' și ')}`;
}

const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ro') ===
  b.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ro');

/**
 * Where a safety data sheet's draft goes in the form (ADR 042): an empty field takes the sheet's
 * value, and so does one still holding an earlier sheet's; a field the member filled keeps their
 * text, and the sheet's differing value is offered beside it.
 */
export function mergeSafetySheetDraft(
  values: SubstanceFormValues,
  draft: SafetySheetDraft,
  fromSheet: ReadonlySet<SafetySheetDraftField>
) {
  const filled: SafetySheetDraftField[] = [];
  const offers: Partial<Record<SafetySheetDraftField, string>> = {};
  for (const field of safetySheetDraftFields) {
    const value = draft[field];
    if (!value) continue;
    const current = values[field].trim();
    if (current === '' || fromSheet.has(field)) filled.push(field);
    else if (!sameText(current, value)) offers[field] = value;
  }
  return { filled, offers };
}

const takesDe = (count: number) => count % 100 === 0 || count % 100 >= 20;

/** "1 câmp", "3 câmpuri", "20 de câmpuri". */
export const fieldCountLabel = (count: number) =>
  count === 1 ? '1 câmp' : `${count} ${takesDe(count) ? 'de ' : ''}câmpuri`;

/** "un cod", "3 coduri", "20 de coduri". */
export const codeCountLabel = (count: number) =>
  count === 1 ? 'un cod' : `${count} ${takesDe(count) ? 'de ' : ''}coduri`;
