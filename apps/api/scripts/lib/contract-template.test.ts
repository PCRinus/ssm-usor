import { readFileSync } from 'node:fs';

import { otherDocumentTypes, type ServiceContract, unfilledMark } from '@ssm-usor/contracts';
import { documentText, renderTemplate } from '@ssm-usor/document-engine';
import { describe, expect, it } from 'vitest';

import {
  buildServiceContractContext,
  monthsText,
} from '../../src/modules/service-contracts/context';
import type { ServiceContractFacts } from '../../src/modules/service-contracts/facts';

// Lives with the scripts because it reads the repository's files, which the Worker's own
// code cannot: the starter contract, merged with the context the API builds.

const otherUrl = new URL('../../../../packages/document-engine/templates/other/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', otherUrl), 'utf8')) as {
  templates: { typeKey: string; title: string; file: string }[];
};
const template = new Uint8Array(readFileSync(new URL('service_contract.docx', otherUrl)));

const facts: ServiceContractFacts = {
  client: {
    legal_name: 'S.C. GELATERIA FLOREȘTI S.R.L.',
    cui: '14399840',
    vat_payer: true,
    caen_code: '5630',
    trade_register_number: 'J12/1234/2021',
    county_code: 'CJ',
    locality: 'Florești',
    address_line: 'Str. Eroilor 12',
    legal_representative_name: 'Andrei POP',
    legal_representative_role: 'Administrator',
    contact_phone: null,
    archived_at: null,
  },
  organization: {
    legal_name: 'S.C. EXEMPLU SSM S.R.L.',
    cui: '1590082',
    trade_register_number: 'J35/535/2022',
    county_code: 'B',
    locality: 'București, Sector 1',
    address_line: 'Calea Victoriei 122A',
    legal_representative_name: 'Maria POPESCU',
    legal_representative_role: 'Administrator',
    phone: '0722 000 111',
    iban: 'RO49AAAA1B31007593840000',
    bank_name: 'Banca Transilvania',
    authorization_certificate_number: '17664',
    authorization_certificate_date: '2022-09-30',
    authorization_certificate_issuer: 'Direcția de muncă și protecție socială Timiș',
    vat_payer: false,
    fire_safety_technician_name: 'Ion IONESCU',
    fire_safety_technician_certificate: 'seria CT nr. 1234',
  },
  contract: null,
};
const contract: ServiceContract = {
  contractNumber: 52,
  contractDate: '2026-09-21',
  startDate: '2026-10-01',
  durationMonths: 24,
  renewsAutomatically: true,
  coversOccupationalSafety: true,
  coversFireSafety: false,
  endDate: '2028-09-30',
};
const merged = (overrides: Partial<ServiceContract> = {}, organization = facts.organization) =>
  documentText(
    renderTemplate(
      template,
      buildServiceContractContext({
        ...facts,
        organization,
        contract: { ...contract, ...overrides },
      })
    ).document
  );

describe('the months of a contract', () => {
  it.each([
    [1, 'o lună'],
    [12, '12 luni'],
    [19, '19 luni'],
    [20, '20 de luni'],
    [24, '24 de luni'],
    [100, '100 de luni'],
    [112, '112 luni'],
  ])('%i is "%s"', (months, text) => expect(monthsText(months)).toBe(text));
});

describe('the starter contract', () => {
  it('is the template of the type the contracts package names', () => {
    expect(manifest.templates.map((entry) => [entry.typeKey, entry.title])).toEqual(
      Object.entries(otherDocumentTypes)
    );
  });

  it('renders from the context with nothing missing, and prints what the app knows', () => {
    const text = merged();
    expect(text).not.toContain('{{');
    expect(text).toContain('Nr. 52 din 21.09.2026');
    expect(text).toContain('cu sediul în București, Sector 1, Calea Victoriei 122A, telefon');
    expect(text).toContain('cu sediul în Florești, județul Cluj, Str. Eroilor 12, înregistrată');
    expect(text).toContain('cod de înregistrare fiscală RO14399840');
    expect(text).toContain('CAEN 5630 – Baruri');
    expect(text).toContain('RO49 AAAA 1B31 0075 9384 0000 deschis la Banca Transilvania');
    expect(text).toContain('Certificatului de abilitare nr. 17664 din 30.09.2022');
    expect(text).toContain('pe o durată de 24 de luni, începând cu 01.10.2026');
    expect(text).toContain('Document generat cu SSM Ușor');
  });

  it('leaves the prices for the owner, under the mark that issuing warns about', () => {
    expect(merged().split(unfilledMark).length - 1).toBe(3);
  });

  it('prints the fire-safety chapters only for a contract that covers fire safety', () => {
    const without = merged();
    expect(without).not.toContain('Legii nr. 307/2006');
    expect(without).not.toContain('Ion IONESCU');
    expect(without).not.toContain(
      'Obiectul contractului în domeniul apărării împotriva incendiilor'
    );
    const withIt = merged({ coversFireSafety: true });
    expect(withIt).toContain('Legii nr. 307/2006');
    expect(withIt).toContain('de Ion IONESCU, certificat seria CT nr. 1234');
    expect(withIt).toContain(
      'În domeniul apărării împotriva incendiilor, beneficiarul asigură și:'
    );
  });

  it('prints fire safety alone too', () => {
    const text = merged({ coversOccupationalSafety: false, coversFireSafety: true });
    expect(text).not.toContain('Certificatului de abilitare');
    expect(text).not.toContain(
      'Obiectul contractului în domeniul securității și sănătății în muncă'
    );
    expect(text).toContain('Legii nr. 307/2006');
  });

  it('says the right thing about VAT and about the renewal', () => {
    expect(merged()).toContain('Prestatorul nu este plătitor de TVA.');
    expect(merged()).not.toContain('Prețurile nu includ TVA.');
    const payer = merged({}, { ...facts.organization, vat_payer: true });
    expect(payer).toContain('Prețurile nu includ TVA.');
    expect(payer).toContain('cod de înregistrare fiscală RO1590082');

    expect(merged()).toContain('se prelungește de drept, pe perioade succesive de 24 de luni');
    const fixed = merged({ renewsAutomatically: false });
    expect(fixed).not.toContain('se prelungește de drept');
    expect(fixed).toContain('numai prin act adițional');
  });

  it('records everything it printed, so that a changed fact marks the draft', () => {
    const { usedNames } = renderTemplate(
      template,
      buildServiceContractContext({ ...facts, contract })
    );
    expect([...usedNames].sort()).toEqual(['branding', 'client', 'contract', 'provider']);
  });
});
