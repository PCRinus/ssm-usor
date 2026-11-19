import { describe, expect, it } from 'vitest';

import {
  clientImportValuesDiffer,
  cuiWithoutVatPrefix,
  proposedIncluded,
  proposedUntickedReason,
  registeredNameOffer,
  registeredNameTaken,
  resolveClientImportField,
} from './client-import-rules';

describe('what a client import proposes unticked', () => {
  const employee = { otherCompanyName: null, role: 'employee' };

  it('names why an item waits for the member to tick it', () => {
    expect(proposedUntickedReason(employee)).toBeNull();
    expect(proposedIncluded(employee)).toBe(true);
    expect(proposedUntickedReason({ ...employee, otherCompanyName: 'ALTA S.R.L.' })).toBe(
      'other_company'
    );
    expect(proposedUntickedReason({ ...employee, role: 'legal_representative' })).toBe(
      'legal_representative'
    );
    expect(proposedUntickedReason({ otherCompanyName: null, managementOnly: true })).toBe(
      'management_only'
    );
    expect(proposedIncluded({ otherCompanyName: null, managementOnly: true })).toBe(false);
  });
});

const field = (...options: [string | number, string | null][]) => ({
  options: options.map(([value, otherCompanyName]) => ({ value, otherCompanyName })),
});

describe('a client field as confirming takes it', () => {
  const one = field(['A', null], ['B', 'ATELIER']);
  const two = field(['J35/1/2015', null], ['J35/2/2015', null]);
  const other = field(['B', 'ATELIER']);

  it("takes the only value of the client's own documents unless the member leaves it out", () => {
    expect(resolveClientImportField(one, undefined)).toEqual({
      status: 'value',
      value: 'A',
      option: 0,
      own: [0],
      decision: null,
    });
    expect(resolveClientImportField(one, { included: true })).toMatchObject({
      status: 'value',
      value: 'A',
      decision: null,
    });
    expect(resolveClientImportField(one, { included: false })).toMatchObject({
      status: 'unticked',
      value: null,
      option: null,
      decision: 'unticked',
    });
  });

  it("takes another company's value only when the member ticks it", () => {
    expect(resolveClientImportField(other, undefined)).toEqual({
      status: 'unticked',
      value: null,
      option: null,
      own: [],
      decision: null,
    });
    expect(resolveClientImportField(other, { included: false })).toMatchObject({
      status: 'unticked',
      decision: null,
    });
    expect(resolveClientImportField(other, { included: true })).toMatchObject({
      status: 'value',
      value: 'B',
      option: 0,
      decision: 'taken',
    });
  });

  it('waits for a choice between two own values until one is chosen or written', () => {
    expect(resolveClientImportField(two, undefined)).toMatchObject({
      status: 'choice',
      value: null,
      own: [0, 1],
      decision: null,
    });
    expect(resolveClientImportField(two, { included: false }).status).toBe('choice');
    expect(resolveClientImportField(two, { option: 1 })).toMatchObject({
      status: 'value',
      value: 'J35/2/2015',
      option: 1,
      decision: 'taken',
    });
    expect(resolveClientImportField(one, { option: 1 })).toMatchObject({
      value: 'B',
      option: 1,
      decision: 'taken',
    });
  });

  it("puts the member's own value, or none, before any option", () => {
    expect(resolveClientImportField(two, { value: 'J35/3/2015', option: 0 })).toMatchObject({
      status: 'value',
      value: 'J35/3/2015',
      option: null,
      decision: 'written',
    });
    expect(resolveClientImportField(one, { value: null })).toMatchObject({
      status: 'missing',
      value: null,
      decision: 'written',
    });
    expect(resolveClientImportField(field(), { value: 7 })).toMatchObject({
      status: 'value',
      value: 7,
    });
  });

  it('takes nothing for an option the proposal no longer has, nor for a field with no options', () => {
    for (const each of [one, two, other]) {
      expect(resolveClientImportField(each, { option: 5 })).toMatchObject({
        status: 'missing',
        value: null,
        option: null,
        decision: null,
      });
    }
    expect(resolveClientImportField(field(), undefined)).toEqual({
      status: 'missing',
      value: null,
      option: null,
      own: [],
      decision: null,
    });
    expect(resolveClientImportField(field(), { included: true }).status).toBe('missing');
  });
});

describe('a CUI without its VAT prefix', () => {
  it('drops a leading RO in any case and the spaces around', () => {
    expect(cuiWithoutVatPrefix('RO14399840')).toBe('14399840');
    expect(cuiWithoutVatPrefix('ro 14399840 ')).toBe('14399840');
    expect(cuiWithoutVatPrefix(14399840)).toBe('14399840');
    expect(cuiWithoutVatPrefix('14399840RO')).toBe('14399840RO');
    expect(cuiWithoutVatPrefix(null)).toBe('');
    expect(cuiWithoutVatPrefix(undefined)).toBe('');
  });
});

describe("ANAF's name offered for a new client", () => {
  const registered = { cui: '14399840', legalName: 'BRUTARIA SPICUL AURIU SRL' };
  const written = 'Brutăria Spicul Auriu';
  const asWritten = 'Brutăria Spicul Auriu SRL';
  const legalName = field([written, null], ['ALTA FIRMA SRL', 'ALTA FIRMA SRL']);
  const offer = (
    change?: Parameters<typeof registeredNameOffer>[1],
    cui: string | null = 'RO14399840'
  ) => registeredNameOffer(legalName, change, cui, registered);

  it("stands by default, in the documents' spelling, against their first own name", () => {
    expect(offer()).toEqual({ name: asWritten, documentsOption: 0, picked: null });
    expect(offer({ included: true })).toMatchObject({ picked: null });
    expect(registeredNameTaken(offer())).toBe(asWritten);
  });

  it("counts as picked when the member writes ANAF's name either way", () => {
    expect(offer({ value: asWritten })).toMatchObject({ name: asWritten, picked: 'anaf' });
    expect(offer({ value: registered.legalName })).toMatchObject({
      name: asWritten,
      picked: 'anaf',
    });
    expect(registeredNameTaken(offer({ value: registered.legalName }))).toBe(asWritten);
  });

  it("gives way to the documents' name chosen, or to any other the member settles on", () => {
    const documents = offer({ option: 0 });
    expect(documents).toEqual({ name: asWritten, documentsOption: 0, picked: 'documents' });
    expect(registeredNameTaken(documents)).toBeNull();
    expect(offer({ option: 1 })).toBeNull();
    expect(offer({ option: 0, value: asWritten })).toBeNull();
    expect(offer({ value: 'Alt Nume SRL' })).toBeNull();
    expect(offer({ value: null })).toBeNull();
    expect(offer({ included: false })).toBeNull();
    expect(offer({ included: false, value: registered.legalName })).toBeNull();
    expect(registeredNameTaken(null)).toBeNull();
  });

  it('is not offered unless ANAF registers the CUI the review holds', () => {
    expect(registeredNameOffer(legalName, undefined, 'RO14399840', null)).toBeNull();
    expect(registeredNameOffer(legalName, undefined, 'RO14399840', undefined)).toBeNull();
    expect(offer(undefined, null)).toBeNull();
    expect(offer(undefined, '14399841')).toBeNull();
    expect(offer(undefined, ' ro14399840')).toBeNull();
    expect(offer(undefined, 'ro14399840')).not.toBeNull();
    expect(registeredNameOffer(legalName, undefined, 14399840, registered)).not.toBeNull();
  });

  it("is not offered while a document writes ANAF's name, nor without an own name", () => {
    expect(
      registeredNameOffer(
        field(['Brutaria Spicul Auriu S.R.L.', null]),
        undefined,
        '14399840',
        registered
      )
    ).toBeNull();
    expect(
      registeredNameOffer(
        field(['ALTA FIRMA SRL', 'ALTA FIRMA SRL']),
        undefined,
        '14399840',
        registered
      )
    ).toBeNull();
    expect(registeredNameOffer(field(), undefined, '14399840', registered)).toBeNull();
  });

  it("names the documents' option the member picks among several of the firm's names", () => {
    const names = field(['Brutăria Spicul Auriu', null], ['BRUTARIA SPICUL AURIU', null]);
    expect(registeredNameOffer(names, undefined, '14399840', registered)).toMatchObject({
      documentsOption: 0,
      picked: null,
    });
    expect(registeredNameOffer(names, { option: 1 }, '14399840', registered)).toEqual({
      name: 'BRUTARIA SPICUL AURIU SRL',
      documentsOption: 1,
      picked: 'documents',
    });
  });
});

describe('whether two client values differ', () => {
  it('compares numbers as numbers', () => {
    expect(clientImportValuesDiffer(12, '12')).toBe(false);
    expect(clientImportValuesDiffer('12', 12)).toBe(false);
    expect(clientImportValuesDiffer(12, 13)).toBe(true);
    expect(clientImportValuesDiffer(0, null)).toBe(false);
  });

  it('ignores case, diacritics, punctuation and spacing', () => {
    expect(clientImportValuesDiffer('Strada Mării, nr. 3', 'STRADA MARII NR 3')).toBe(false);
    expect(clientImportValuesDiffer('Strada Mării 3', 'Strada Mării 4')).toBe(true);
  });

  it('reads a list as its words', () => {
    expect(clientImportValuesDiffer(['hârtie', 'plastic'], 'Hartie; plastic')).toBe(false);
    expect(clientImportValuesDiffer(['hartie'], ['hartie', 'sticla'])).toBe(true);
    expect(clientImportValuesDiffer([], '')).toBe(false);
  });

  it('takes a missing value as empty', () => {
    expect(clientImportValuesDiffer(null, '')).toBe(false);
    expect(clientImportValuesDiffer(undefined, null)).toBe(false);
    expect(clientImportValuesDiffer(null, 'A')).toBe(true);
  });
});
