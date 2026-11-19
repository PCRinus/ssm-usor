import { foldText } from './fold-text';
import { registeredNameAsWritten, registeredNameOffered } from './name-match';

// The confirm and the review in the app both run these, so the review shows what confirming takes.

// Unticked, an item is written only when the member ticks it: what only another company's
// passages give, the legal representative as an employee, who is one only when the documents
// show them on the staff (ADR 030), which a reading too often assumes, and a post that is only
// the running of the firm, which nobody may hold as a worker.
export function proposedUntickedReason(item: {
  otherCompanyName: string | null;
  role?: unknown;
  managementOnly?: unknown;
}) {
  if (item.otherCompanyName !== null) return 'other_company';
  if (item.role === 'legal_representative') return 'legal_representative';
  if (item.managementOnly === true) return 'management_only';
  return null;
}

export const proposedIncluded = (item: Parameters<typeof proposedUntickedReason>[0]) =>
  proposedUntickedReason(item) === null;

type FieldValue = string | number;

type ClientImportOption = { value: FieldValue; otherCompanyName: string | null };

type ClientImportFieldChange = {
  option?: number;
  value?: FieldValue | null;
  included?: boolean;
};

export type ResolvedClientImportField = {
  status: 'value' | 'choice' | 'missing' | 'unticked';
  value: FieldValue | null;
  // The option taken, whose flags then apply; null for the member's own value or nothing.
  option: number | null;
  // Indexes of the options the client's own documents give.
  own: number[];
  // How the member moved the field off what the proposal takes by default: a value of their own,
  // an option chosen or another company's value taken, or the only own value left out.
  decision: 'written' | 'taken' | 'unticked' | null;
};

/** A client's field as confirming takes it: a choice between own options waits until made. */
export function resolveClientImportField(
  field: { options: readonly ClientImportOption[] },
  change: ClientImportFieldChange | undefined
): ResolvedClientImportField {
  const { options } = field;
  const own = options.flatMap((option, index) => (option.otherCompanyName === null ? [index] : []));
  const base = { value: null, option: null, own, decision: null };
  if (change?.value !== undefined) {
    const status = change.value === null ? 'missing' : 'value';
    return { ...base, status, value: change.value, decision: 'written' };
  }
  if (change?.option !== undefined) {
    const option = options[change.option];
    // An option the proposal no longer has takes nothing, not the default.
    if (!option) return { ...base, status: 'missing' };
    return {
      ...base,
      status: 'value',
      value: option.value,
      option: change.option,
      decision: 'taken',
    };
  }
  if (own.length > 1) return { ...base, status: 'choice' };
  if (own.length === 1) {
    if (change?.included === false) return { ...base, status: 'unticked', decision: 'unticked' };
    return { ...base, status: 'value', value: options[own[0]!]!.value, option: own[0]! };
  }
  if (options.length === 0) return { ...base, status: 'missing' };
  if (change?.included === true) {
    return { ...base, status: 'value', value: options[0]!.value, option: 0, decision: 'taken' };
  }
  return { ...base, status: 'unticked' };
}

// A VAT payer's CUI is written with RO before it; ANAF keeps the digits.
export const cuiWithoutVatPrefix = (value: unknown) =>
  String(value ?? '')
    .replace(/^RO/i, '')
    .trim();

// `picked` is null while ANAF's name stands by default; `documentsOption` is the documents' name
// it stands against.
export type RegisteredNameOffer = {
  name: string;
  documentsOption: number;
  picked: 'anaf' | 'documents' | null;
};

/**
 * ANAF's name offered for a new client whose documents name the CUI's firm otherwise: it stands
 * until the member takes the documents' name by choosing its option.
 */
export function registeredNameOffer(
  legalName: { options: readonly ClientImportOption[] },
  change: ClientImportFieldChange | undefined,
  cui: FieldValue | null,
  registered: { cui: string; legalName: string } | null | undefined
): RegisteredNameOffer | null {
  if (!registered) return null;
  const { options } = legalName;
  const own = options.flatMap((option, index) => (option.otherCompanyName === null ? [index] : []));
  const written = own.map((index) => String(options[index]!.value));
  if (!registeredNameOffered(written, registered.legalName)) return null;
  if (cui === null || cuiWithoutVatPrefix(cui) !== registered.cui) return null;
  const offer = (documentsOption: number, picked: RegisteredNameOffer['picked']) => ({
    name: registeredNameAsWritten(registered.legalName, String(options[documentsOption]!.value)),
    documentsOption,
    picked,
  });
  if (change?.option !== undefined) {
    const documents = change.value === undefined && own.includes(change.option);
    return documents ? offer(change.option, 'documents') : null;
  }
  if (change?.included === false) return null;
  const standing = offer(own[0]!, null);
  if (change?.value === undefined) return standing;
  const anaf = change.value === standing.name || change.value === registered.legalName;
  return anaf ? { ...standing, picked: 'anaf' } : null;
}

export const registeredNameTaken = (offer: RegisteredNameOffer | null) =>
  offer === null || offer.picked === 'documents' ? null : offer.name;

export const clientImportValuesDiffer = (a: unknown, b: unknown) =>
  typeof a === 'number' || typeof b === 'number'
    ? Number(a) !== Number(b)
    : Array.isArray(a) || Array.isArray(b)
      ? foldText([a].flat().join(' ')) !== foldText([b].flat().join(' '))
      : foldText(String(a ?? '')) !== foldText(String(b ?? ''));
