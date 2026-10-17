import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { signingAgreementFacts, signingAgreementSamples } from '../tools/signing-samples';
import { renderDocument, TemplateError, templatePlaceholders } from './render';
import { buildSigningAgreementData, signingRegulationAnnexData } from './signing';
import { documentText } from './text';

const templatesUrl = new URL('../templates/', import.meta.url);
const annexTemplate = new Uint8Array(
  readFileSync(new URL('13_signing_regulation_annex.docx', templatesUrl))
);
const agreementTemplate = new Uint8Array(
  readFileSync(new URL('act_aditional_semnare_electronica.docx', templatesUrl))
);

const dotted = (data: object, prefix = ''): string[] =>
  Object.entries(data).flatMap(([key, value]) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? dotted(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );

const packContext = {
  branding: true,
  issueDate: '19.10.2026',
  decisionNumber: 4,
  client: {
    legalName: 'S.C. PIPETECH S.R.L.',
    representativeName: 'Florin Cristian TALOȘ',
    representativeRole: 'Administrator',
  },
  provider: {
    legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.',
    representativeName: 'Dan POP',
    representativeRole: 'Director',
  },
  specialist: { name: 'Ana IONESCU', professionalTitle: 'Evaluator de risc SSM' },
  firstAiders: [],
};

describe('the annex on the electronic signature', () => {
  const data = signingRegulationAnnexData(packContext);

  it('takes only its names from the context of the set', () => {
    expect(data).not.toHaveProperty('decisionNumber');
    expect(data.provider).toEqual({ legalName: 'S.C. SERVICIU EXTERN DEMO S.R.L.' });
  });

  it('asks only for what its data has', () => {
    const known = new Set(dotted(data));
    expect(templatePlaceholders(annexTemplate).filter((name) => !known.has(name))).toEqual([]);
  });

  it('merges with nothing left over and says what is signed, how and by whom', () => {
    const text = documentText(renderDocument(annexTemplate, data));
    expect(text).not.toContain('{{');
    for (const sentence of [
      'ANEXĂ LA REGULAMENTUL INTERN',
      'Prezenta anexă la regulamentul intern al S.C. PIPETECH S.R.L. stabilește modul de semnare electronică a fișelor de instruire',
      'art. 81 alin. (3¹)–(3³) din H.G. 1425/2006',
      'art. 16 alin. (1¹)–(1⁸) din Legea 53/2003 – Codul muncii',
      'art. 4 din Legea 214/2024',
      'art. 26 din Regulamentul (UE) nr. 910/2014',
      'fișele individuale de instructaj în domeniul situațiilor de urgență (OMAI 712/2005), rând cu rând',
      'rubrica „Admis la lucru”',
      'Fișele se semnează cu semnătură electronică avansată',
      'fără certificat calificat, creată în platforma pusă la dispoziție de S.C. SERVICIU EXTERN DEMO S.R.L.',
      'un cod de unică folosință',
      'mențiunea „anulat”',
      'fără a fi tipărită (art. 16 alin. (1⁸) din Legea 53/2003)',
      'Legii 16/1996 și Legii 135/2007',
      'Salariatul nu poate fi obligat să semneze electronic (art. 16 alin. (1⁶) din Legea 53/2003)',
      'printr-un act adițional',
      'Administrator al S.C. PIPETECH S.R.L.',
      'Evaluator de risc SSM, S.C. SERVICIU EXTERN DEMO S.R.L.',
    ]) {
      expect(text).toContain(sentence);
    }
    expect(text).toContain('Document generat cu SSM Ușor');
  });

  it('numbers its articles with a list, not by hand', () => {
    expect(documentText(annexTemplate)).not.toMatch(/Art\. \d/);
  });

  it('refuses to render without the specialist who drew it up', () => {
    const withoutSpecialist: Record<string, unknown> = { ...data };
    delete withoutSpecialist.specialist;
    expect(() => renderDocument(annexTemplate, withoutSpecialist)).toThrow(TemplateError);
  });
});

describe('the signing agreement', () => {
  it('names the employee as the sheets do, with what the app holds of them and never a CNP', () => {
    const data = buildSigningAgreementData(signingAgreementFacts.recorded);
    expect(data.employee).toEqual({
      name: 'MĂRGINEANU-ZAHARIA Radu-Constantin',
      position: 'Operator montaj linii automate',
      identification:
        'marca 0042, data nașterii 14.03.1988, locul nașterii Lugoj, cu domiciliul în Str. Lungă nr. 12, bl. A3, sc. 2, ap. 14, Timișoara, jud. Timiș',
      hiredOn: '05.01.2026',
    });
    expect(JSON.stringify(data)).not.toMatch(/CNP|\b[1-8]\d{12}\b/);
  });

  it('leaves the identification empty when the app holds none of it', () => {
    expect(buildSigningAgreementData(signingAgreementFacts.sparse).employee.identification).toBe(
      ''
    );
  });

  it('names the channel the codes go to, not the address', () => {
    expect(buildSigningAgreementData(signingAgreementFacts.recorded).codeChannel).toBe(
      'adresa de e-mail comunicată angajatorului'
    );
    expect(buildSigningAgreementData(signingAgreementFacts.sparse).codeChannel).toBe(
      'numărul de telefon mobil comunicat angajatorului'
    );
  });

  it('asks only for what its data has', () => {
    const { data } = signingAgreementSamples()[0]!;
    const known = new Set(dotted(data));
    expect(templatePlaceholders(agreementTemplate).filter((name) => !known.has(name))).toEqual([]);
  });

  it.each(signingAgreementSamples())(
    'merges the $label sample with nothing left over',
    ({ data }) => {
      const text = documentText(renderDocument(agreementTemplate, data));
      expect(text).not.toContain('{{');
      expect(text).not.toContain(', ,');
      for (const sentence of [
        'ACT ADIȚIONAL',
        `${data.client.legalName}, cu sediul în ${data.client.address}, cod de înregistrare fiscală ${data.client.cui}`,
        `${data.employee.name}, salariat în funcția de ${data.employee.position}`,
        `data de începere a activității ${data.employee.hiredOn}`,
        'art. 16 alin. (1¹) și (1⁷) din Legea 53/2003',
        'art. 4 alin. (5) lit. c) din Legea 214/2024',
        'se semnează cu semnătură electronică avansată',
        `pusă la dispoziție de ${data.provider.legalName}`,
        'confirmă că au înțeles riscurile și sarcina probei',
        `un cod de unică folosință pe ${data.codeChannel}`,
        'Salariatul poate reveni oricând la semnarea olografă',
        'Fișele semnate electronic până la acea dată rămân valabile.',
        'Celelalte clauze ale contractului individual de muncă rămân neschimbate.',
        'cu același tip de semnătură',
      ]) {
        expect(text).toContain(sentence);
      }
      expect(text.includes('marca')).toBe(data.employee.identification !== '');
      expect(text.includes('Document generat cu SSM Ușor')).toBe(data.branding);
    }
  );
});
