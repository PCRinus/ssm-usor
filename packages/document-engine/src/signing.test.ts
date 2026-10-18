import { readFileSync } from 'node:fs';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { signingAgreementFacts, signingAgreementSamples } from '../tools/signing-samples';
import { renderDocument, TemplateError, templatePlaceholders } from './render';
import {
  buildSigningAgreementData,
  SigningAgreementDataError,
  signingContractClauseText,
  signingRegulationAnnexData,
} from './signing';
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
      'art. 16 alin. (1²), (1³) și (1⁶)–(1⁸) din Legea 53/2003 – Codul muncii',
      'art. 4 din Legea 214/2024',
      'art. 26 din Regulamentul (UE) nr. 910/2014',
      'fișele individuale de instructaj în domeniul situațiilor de urgență (OMAI 712/2005), rând cu rând',
      'de lucrătorul instruit și de cel care a efectuat instruirea, iar pe fișa de securitate și sănătate în muncă și de cel care a verificat însușirea cunoștințelor',
      'rubrica „Admis la lucru” a acestei fișe se semnează de cel care l-a admis la lucru',
      'Fișele se semnează cu semnătură electronică avansată',
      'fără certificat calificat, creată în platforma pusă la dispoziție de S.C. SERVICIU EXTERN DEMO S.R.L., serviciul extern de prevenire și protecție al angajatorului',
      'Fiecare semnatar are o cheie de semnare proprie, cu un certificat emis de platformă pe numele său, păstrată criptat în platformă.',
      'exclusiv sub controlul său și este legată de fișă astfel încât orice modificare ulterioară poate fi detectată',
      'un cod semnează numai documentele afișate semnatarului în momentul în care l-a cerut',
      'adresa IP și browserul folosite și amprenta digitală a fișei înainte și după semnare',
      'mențiunea „anulat”',
      'de la angajare până la data încetării raporturilor de muncă (art. 81 alin. (4) și (5) din H.G. 1425/2006)',
      'fără a le fi solicitată și în format letric (art. 16 alin. (1⁸) din Legea 53/2003)',
      'Fișa se arhivează potrivit Legii 16/1996 și Legii 135/2007 (art. 16 alin. (1³) din Legea 53/2003)',
      'pe care salariatul nu poate fi obligat să îl semneze electronic (art. 16 alin. (1⁶) din Legea 53/2003)',
      'poate reveni oricând la semnarea olografă, printr-o cerere scrisă',
      'cu consultarea sindicatului sau a reprezentanților salariaților, după caz (art. 241 din Legea 53/2003)',
      'de la luarea la cunoștință (art. 243 din Legea 53/2003)',
      'Angajator\nFlorin Cristian TALOȘ\nAdministrator',
      'Întocmit\nAna IONESCU\nEvaluator de risc SSM',
      'Consultat: ',
    ]) {
      expect(text).toContain(sentence);
    }
    expect(text).toContain('Document generat cu SSM Ușor');
    expect(text).not.toContain('(1⁴)');
    expect(text).not.toContain('prestator');
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
        'Nr. ________ din ______________',
        'Exemplarul semnat electronic poartă data ultimei semnături.',
        `${data.client.legalName}, cu sediul în ${data.client.address}, cod de înregistrare fiscală ${data.client.cui}, reprezentată prin ${data.client.representativeName}, în calitate de ${data.client.representativeRole}`,
        `${data.employee.name}, salariat în funcția de ${data.employee.position}`,
        `cu contract individual de muncă nr. ______ din data de ${data.employee.hiredOn}`,
        'art. 16 alin. (1¹) și (1⁷) din Legea 53/2003',
        'al art. 3 din Legea 214/2024 și al art. 5 alin. (3) din aceeași lege',
        'Începând cu data la care prezentul act adițional este semnat de ambele părți',
        'se semnează cu semnătură electronică avansată',
        `pusă la dispoziție de ${data.provider.legalName}`,
        'Semnătura electronică din platformă este, în caz de litigiu, dovada că salariatul a semnat; platforma păstrează pentru fiecare semnătură când, de unde și cum a fost dată.',
        'Părțile iau act că, în cazul în care semnătura electronică avansată este contestată, angajatorul, care o invocă, trebuie să dovedească îndeplinirea condițiilor legale și tehnice ale acesteia (art. 5 alin. (3) din Legea 214/2024).',
        `un cod de unică folosință pe ${data.codeChannel}`,
        'Salariatul poate reveni oricând la semnarea olografă',
        'cererea produce efecte de la data înregistrării ei de către angajator',
        'Fișele semnate până atunci rămân valabile.',
        'Celelalte clauze ale contractului individual de muncă rămân neschimbate.',
        'cu același tip de semnătură',
        'Pentru angajator, reprezentant legal sau împuternicit:',
      ]) {
        expect(text).toContain(sentence);
      }
      expect(text).not.toMatch(/lit\. c\)|aceleași efecte juridice ca semnătura olografă/);
      expect(text.split(data.client.representativeName)).toHaveLength(2);
      expect(text.includes('marca')).toBe(data.employee.identification !== '');
      expect(text.includes('Document generat cu SSM Ușor')).toBe(data.branding);
    }
  );

  it('is not drawn up without the representative its parties name', () => {
    const { recorded } = signingAgreementFacts;
    const without = (client: Partial<typeof recorded.client>) => () =>
      buildSigningAgreementData({ ...recorded, client: { ...recorded.client, ...client } });
    expect(without({ representativeName: '  ' })).toThrow(SigningAgreementDataError);
    expect(without({ representativeName: '', representativeRole: '' })).toThrow(
      expect.objectContaining({
        missing: ['client.representativeName', 'client.representativeRole'],
      })
    );
  });

  it('has a signature field for each party, the employer first, as its signed copy needs', () => {
    const xml = new PizZip(agreementTemplate).file('word/document.xml')!.asText();
    expect([...xml.matchAll(/<w:alias w:val="([^"]+)"\/>/g)].map((match) => match[1])).toEqual([
      'sig_employer',
      'sig_employee',
    ]);
    expect(xml).not.toContain('SIGNATURE_FIELD');
  });
});

describe('the clause for a new hire’s contract', () => {
  const clause = signingContractClauseText(' S.C. SERVICIU EXTERN DEMO S.R.L. ');

  it('carries the agreement’s three terms with the provider named and nothing left to merge', () => {
    expect(clause).toHaveLength(3);
    expect(clause.join('\n')).not.toContain('{{');
    expect(clause[0]).toContain('pusă la dispoziție de S.C. SERVICIU EXTERN DEMO S.R.L., potrivit');
    expect(clause[0]).toContain('(art. 5 alin. (3) din Legea 214/2024)');
    expect(clause[1]).toContain('un cod de unică folosință');
    expect(clause[2]).toContain(
      'cererea produce efecte de la data înregistrării ei de către angajator'
    );
  });

  it('names no party and no signature, being part of the contract', () => {
    expect(clause.join('\n')).not.toMatch(/act adițional|semnează de ambele părți/);
  });
});
