import { describe, expect, it } from 'vitest';

import { companyName, namesCompany } from './legal-forms';
import {
  foldName,
  registeredNameAsWritten,
  registeredNameOffered,
  sameCompany,
  sameName,
  sameSpelling,
  similar,
} from './name-match';

describe('foldName', () => {
  it.each([
    ['S.C. Brutăria Fictivă S.R.L.', 'brutaria fictiva'],
    ['BRUTARIA FICTIVA SRL', 'brutaria fictiva'],
    ['BRUTĂRIA FICTIVĂ S.A.', 'brutaria fictiva'],
    ['Mobila SA Prod S.R.L.', 'mobila prod'],
    ['VASILESCU M. ANA PFA', 'vasilescu m ana'],
    ['VASILESCU M.ANA P.F.A.', 'vasilescu m ana'],
    ['P.F.A. Vasilescu Ana', 'vasilescu ana'],
    ['Vasilescu Ana I.I.', 'vasilescu ana'],
    ['Vasilescu Ana I. I.', 'vasilescu ana'],
    ['Maria I. I. Pop', 'maria pop'],
    ['P. F. A. Vasilescu Ana', 'vasilescu ana'],
    ['Familia Vasilescu I.F.', 'familia vasilescu'],
    ['D-na Popescu Ana', 'popescu ana'],
  ])('drops SC, SRL, SA, PFA, I.I. and I.F. from %j', (name, folded) => {
    expect(foldName(name)).toBe(folded);
  });

  it.each([
    ['Hala', 'hala'],
    ['Hala II', 'hala ii'],
    ['Depozit IF', 'depozit if'],
    ['Ahmad Bin Ismail', 'ahmad bin ismail'],
    ['Halat bej', 'halat bej'],
    ['Ionescu S. A. Maria', 'ionescu s a maria'],
    ['Popescu S. A.', 'popescu s a'],
    ['Importul s-a oprit', 'importul s a oprit'],
    ['S.A.M.E. Trans', 's a m e trans'],
    ['M.S.C. Trans', 'm s c trans'],
    ['S.C.A.B. Trans', 's c a b trans'],
    ['Alfa S.R.L.D.', 'alfa s r l d'],
    ['SPN Stanciuc', 'spn stanciuc'],
    ['CMI Dr. Popescu', 'cmi dr popescu'],
    ['Dr. Max SRL', 'dr max'],
  ])('keeps every other word of %j', (name, folded) => {
    expect(foldName(name)).toBe(folded);
  });

  it('keeps a name that is nothing but a legal form', () => {
    expect(foldName('SRL')).toBe('srl');
    expect(sameName('S.R.L.', 'S.A.')).toBe(false);
  });
});

describe('similar', () => {
  it('ignores word order and company forms', () => {
    expect(similar('Vasilescu Ana', 'ANA VASILESCU')).toBe(1);
    expect(similar('S.C. Brutăria Fictivă S.R.L.', 'Brutaria Fictiva')).toBe(1);
  });
});

describe('sameName', () => {
  it.each([
    ['S.C. Brutăria Fictivă S.R.L.', 'BRUTARIA FICTIVA SRL', true],
    ['VASILESCU M. ANA PFA', 'VASILESCU M.ANA P.F.A.', true],
    ['Protect SRL', 'Protecție Construct SRL', false],
    ['Alfa SRL', 'Alfa Construct SRL', false],
  ])('takes %j and %j for one name: %j', (a, b, same) => {
    expect(sameName(a, b)).toBe(same);
  });
});

describe('companyName', () => {
  it.each([
    ['SOCIETATE PROFESIONALA NOTARIALA STANCIUC', 'stanciuc', 'spn'],
    ['SOCIETATE PROFESIONALA NOTARIALA STANCIUC.', 'stanciuc', 'spn'],
    ['SOCIETATEA PROFESIONALA NOTARIALA STANCIUC', 'stanciuc', 'spn'],
    ['S.P.N. / STANCIUC', 'stanciuc', 'spn'],
    ['S. P. N. Stanciuc', 'stanciuc', 'spn'],
    ['SPN STANCIUC', 'stanciuc', 'spn'],
    ['B.I.N. Ionescu Ana', 'ionescu ana', 'bin'],
    ['Biroul Notarial Individual Ionescu Ana', 'ionescu ana', 'bin'],
    ['Biroul Notarial Popescu Ana', 'popescu ana', 'bnp'],
    ['Casapu Mircea Adrian Persoană Fizică Autorizată', 'casapu mircea adrian', 'pfa'],
    ['Cabinet Medical Individual Dr. Popescu Ion', 'popescu ion', 'cmi'],
    ['Dr. Popescu Ion - Cabinet Medical Individual', 'popescu ion', 'cmi'],
    ['Cabinet Medical Dr. Popescu Ion', 'popescu ion', 'cabinet-medical'],
    ['C.M.I. Popescu Ion', 'popescu ion', 'cmi'],
    ['S.C.M. Unirea', 'unirea', 'scm'],
    ['S.C.A. Popescu și Asociații', 'popescu si asociatii', 'sca'],
    ['S.C.P.E.J. Marinescu', 'marinescu', 'scpej'],
    ['Cooperativa Meșteșugărească Arta Lemnului', 'arta lemnului', 'scm'],
    ['Societate Cooperativă Meșteșugărească de Gradul 1 Arta Lemnului', 'arta lemnului', 'scm'],
    ['Societatea Cooperativă de gradul I Unirea', 'unirea', 'scm'],
    ['Societatea Agricolă Holda', 'holda', 'sag'],
    ['Asociația Familială Popescu', 'popescu', 'af'],
    ['BNP Paribas', 'paribas', 'bnp'],
    ['ION IONESCU - Cabinet de avocat', 'ion ionescu', 'cab'],
    ['Cabinet Avocat Ionescu Maria', 'ionescu maria', 'cab'],
    ['Cabinet de Avocatură Ionescu', 'ionescu', 'cab'],
    ['Ionescu S.P.A.R.L.', 'ionescu', 'sparl'],
    [
      'Lichidator Expert Întreprindere Unipersonală cu Răspundere Limitată',
      'lichidator expert',
      'ipurl',
    ],
    ['Popescu Ion II', 'popescu ion', 'ii'],
    ['Popescu IF', 'popescu', 'if'],
    ['Alfa S.R.L.-D.', 'alfa', 'srl'],
    ['Alfa SRLD', 'alfa', 'srl'],
    ['Alfa S.R.L.D.', 'alfa', 'srl'],
    ['S.C. Alfa S.R.L.', 'alfa', 'srl'],
    ['S.C.A.B. S.R.L.', 'ab', 'srl'],
    ['Societatea Comercială Alfa S.A.', 'alfa', 'sa'],
    ['SCM Impex SRL', 'scm impex', 'srl'],
    ['S.C.M. Impex S.R.L.', 'scm impex', 'srl'],
    ['SNC Lavalin Romania SA', 'snc lavalin romania', 'sa'],
    ['BNP Paribas Personal Finance SA', 'bnp paribas personal finance', 'sa'],
    ['Dr. Max SRL', 'dr max', 'srl'],
    ['Brutăria Fictivă', 'brutaria fictiva', null],
  ])('reads %j as %j with the form %j', (name, words, form) => {
    const read = companyName(name);
    expect(read.words.join(' ')).toBe(words);
    expect(read.form?.id ?? null).toBe(form);
  });
});

describe('sameCompany', () => {
  it.each([
    ['S.P.N. / STANCIUC', 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC'],
    ['SPN STANCIUC', 'SOCIETATE PROFESIONALA NOTARIALA STANCIUC.'],
    ['Casapu Mircea Adrian Persoană Fizică Autorizată', 'Casapu Mircea Adrian PFA'],
    ['Cabinet Medical Individual Dr. Popescu Ion', 'CMI Popescu Ion'],
    ['CABINET MEDICAL INDIVIDUAL DR. POPESCU ION', 'Cabinet Medical Dr. Popescu Ion'],
    ['CABINET MEDICAL INDIVIDUAL DR. POPESCU ION', 'Dr. Popescu Ion - Cabinet Medical Individual'],
    ['Dr. Popescu Ion CMI', 'CMI Dr. Popescu Ion'],
    ['CABINET AVOCAT IONESCU MARIA', 'Cabinet de avocat Ionescu Maria'],
    ['Cabinet individual de avocat Ionescu Maria', 'Ionescu Maria - Cabinet de avocat'],
    ['Biroul Individual Notarial Popescu Ana', 'Biroul Notarial Individual Popescu Ana'],
    ['POPESCU ION INTREPRINDERE INDIVIDUALA', 'Popescu Ion II'],
    ['POPESCU INTREPRINDERE FAMILIALA', 'Popescu IF'],
    ['BIROU INDIVIDUAL NOTARIAL POPESCU ANA', 'BNP Popescu Ana'],
    ['BIROU INDIVIDUAL NOTARIAL POPESCU ANA', 'Biroul Notarial Popescu Ana'],
    ['S.C. Brutăria Fictivă S.R.L.', 'Brutaria Fictiva'],
    ['ALFA II S.R.L.', 'Alfa II'],
    ['SCM IMPEX SRL', 'SCM Impex'],
    ['SCM IMPEX SRL', 'S.C.M. Impex S.R.L.'],
    ['Arta IF SRL', 'Arta IF'],
    ['BIN Trans SRL', 'BIN Trans'],
    ['Spn Trans SRL', 'SPN Trans'],
    ['IF Construct', 'IF Construct SRL'],
    ['Euro Bin SRL', 'Euro Bin'],
    ['SOCIETATEA COOPERATIVA MESTESUGAREASCA UNIREA', 'S.C.M. Unirea'],
    ['S.C.A. Popescu și Asociații', 'SCA Popescu și Asociații'],
    ['S.C.P.E.J. Marinescu și Asociații', 'SCPEJ Marinescu și Asociații'],
  ])('takes %j and %j for one company', (a, b) => {
    expect(sameCompany(a, b)).toBe(true);
  });

  it.each([
    ['SCM Impex SRL', 'Impex SRL'],
    ['SNC Lavalin Romania SA', 'Lavalin Romania'],
    ['CMI Dr. Popescu', 'Popescu SRL'],
    ['Cabinet de avocat Ionescu', 'Cabinet medical individual Ionescu'],
    ['Dr. Max SRL', 'Max SRL'],
    ['Popescu Ion PFA', 'Popescu Ion II'],
    ['Alfa SA', 'Alfa SRL'],
    ['SPN Stanciuc', 'SPN Stanciuc și Asociații Ionescu'],
  ])('keeps %j and %j apart', (a, b) => {
    expect(sameCompany(a, b)).toBe(false);
  });
});

describe('sameSpelling', () => {
  it('ignores case, diacritics, spaces, punctuation and the old S.C. prefix', () => {
    expect(sameSpelling('Brutăria Spicul Auriu S.R.L.', 'BRUTARIA SPICUL AURIU SRL')).toBe(true);
    expect(sameSpelling('S.C. Brutăria Fictivă S.R.L.', 'BRUTARIA FICTIVA SRL')).toBe(true);
    expect(sameSpelling('SC ALFA SRL', 'ALFA SRL')).toBe(true);
  });

  it('keeps the rest of the legal form', () => {
    expect(sameSpelling('S.P.N. / STANCIUC', 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC')).toBe(
      false
    );
    expect(sameSpelling('ALFA SA', 'ALFA SRL')).toBe(false);
    expect(sameSpelling('S.C.M. Unirea', 'M UNIREA')).toBe(false);
  });
});

describe('registeredNameOffered', () => {
  const anaf = 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC';

  it('offers ANAF’s name against one name or several ways of writing its firm', () => {
    expect(registeredNameOffered(['SPN STANCIUC'], anaf)).toBe(true);
    expect(registeredNameOffered(['SPN STANCIUC', 'S.P.N. / STANCIUC'], anaf)).toBe(true);
    expect(registeredNameOffered(['Alfa SA'], 'ALFA SRL')).toBe(true);
  });

  it('offers nothing when a document writes ANAF’s name or the names are a real choice', () => {
    expect(
      registeredNameOffered(['SPN STANCIUC', 'Societatea Profesională Notarială Stanciuc'], anaf)
    ).toBe(false);
    expect(registeredNameOffered(['SPN STANCIUC', 'Brutăria Fictivă SRL'], anaf)).toBe(false);
    expect(registeredNameOffered(['S.C. Alfa S.R.L.'], 'ALFA SRL')).toBe(false);
  });
});

describe('registeredNameAsWritten', () => {
  it('keeps the documents’ diacritics and capitals on the words ANAF writes too', () => {
    expect(
      registeredNameAsWritten(
        'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC',
        'Societate Profesională Notarială Stănciuc'
      )
    ).toBe('Societatea Profesională Notarială Stănciuc');
    expect(
      registeredNameAsWritten('ȘTEFĂNESCU ANA PFA', 'Ștefănescu Ana Persoană Fizică Autorizată')
    ).toBe('Ștefănescu Ana PFA');
  });

  it('spells the words of the form only ANAF writes as the form is, in the documents’ capitals', () => {
    expect(
      registeredNameAsWritten('POPESCU ION PERSOANA FIZICA AUTORIZATA', 'Popescu Ion PFA')
    ).toBe('Popescu Ion Persoană Fizică Autorizată');
    expect(
      registeredNameAsWritten('SOCIETATEA PROFESIONALA NOTARIALA STANCIUC', 'S.P.N. / Stănciuc')
    ).toBe('Societatea Profesională Notarială Stănciuc');
  });

  it('keeps ANAF’s name for documents in capitals or another firm', () => {
    expect(
      registeredNameAsWritten('SOCIETATEA PROFESIONALA NOTARIALA STANCIUC', 'SPN STANCIUC')
    ).toBe('SOCIETATEA PROFESIONALA NOTARIALA STANCIUC');
    expect(registeredNameAsWritten('ALFA SRL', 'Beta Construct SRL')).toBe('ALFA SRL');
  });
});

describe('namesCompany', () => {
  const client = 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC';

  it('finds the client written with its form, however the form is written', () => {
    expect(namesCompany('Angajații S.P.N. Stanciuc poartă ecuson.', client)).toBe(true);
    expect(namesCompany('Lucrătorii Stanciuc SPN', client)).toBe(true);
    expect(
      namesCompany('Medicul CMI Dr. Popescu Ion', 'Cabinet Medical Individual Popescu Ion')
    ).toBe(true);
  });

  it('does not take a bare surname, or the name with another form, for the client', () => {
    expect(namesCompany('Instructajul îl face Stanciuc.', client)).toBe(false);
    expect(namesCompany('Stanciuc SRL livrează hârtie.', client)).toBe(false);
  });
});
