import { describe, expect, it } from 'vitest';

import { companyName } from './legal-forms';
import { foldName, sameCompany, sameName, sameSpelling } from './name-match';

describe('foldName', () => {
  it.each([
    ['S.C. Brutăria Fictivă S.R.L.', 'brutaria fictiva'],
    ['Mobila SA Prod S.R.L.', 'mobila prod'],
    ['Vasilescu Ana I. I.', 'vasilescu ana'],
    ['P. F. A. Vasilescu Ana', 'vasilescu ana'],
    ['S.C.A.B. S.R.L.', 'a b'],
    ['D-na Popescu Ana', 'popescu ana'],
  ])('drops SC, SRL, SA, PFA, I.I. and I.F. from %j', (name, folded) => {
    expect(foldName(name)).toBe(folded);
  });

  it.each([
    ['Hala II', 'hala ii'],
    ['Depozit IF', 'depozit if'],
    ['Ahmad Bin Ismail', 'ahmad bin ismail'],
    ['Halat bej', 'halat bej'],
    ['Ionescu S. A. Maria', 'ionescu s a maria'],
    ['Importul s-a oprit', 'importul s a oprit'],
    ['S.A.M.E. Trans', 's a m e trans'],
    ['M.S.C. Trans', 'm s c trans'],
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

describe('companyName', () => {
  it.each([
    ['SOCIETATE PROFESIONALA NOTARIALA STANCIUC', 'stanciuc', 'spn'],
    ['SOCIETATE PROFESIONALA NOTARIALA STANCIUC.', 'stanciuc', 'spn'],
    ['SOCIETATEA PROFESIONALA NOTARIALA STANCIUC', 'stanciuc', 'spn'],
    ['S.P.N. / STANCIUC', 'stanciuc', 'spn'],
    ['S. P. N. Stanciuc', 'stanciuc', 'spn'],
    ['SPN STANCIUC', 'stanciuc', 'spn'],
    ['B.I.N. Ionescu Ana', 'ionescu ana', 'bin'],
    ['Biroul Notarial Popescu Ana', 'popescu ana', 'bnp'],
    ['Casapu Mircea Adrian Persoană Fizică Autorizată', 'casapu mircea adrian', 'pfa'],
    ['Cabinet Medical Individual Dr. Popescu Ion', 'popescu ion', 'cmi'],
    ['C.M.I. Popescu Ion', 'popescu ion', 'cmi'],
    ['Cooperativa Meșteșugărească Arta Lemnului', 'arta lemnului', 'scm'],
    ['Societate Cooperativă Meșteșugărească de Gradul 1 Arta Lemnului', 'arta lemnului', 'scm'],
    ['Societatea Cooperativă de gradul I Unirea', 'unirea', 'scm'],
    ['BNP Paribas', 'paribas', 'bnp'],
    ['ION IONESCU - Cabinet de avocat', 'ion ionescu', 'cab'],
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
    ['S.C. Alfa S.R.L.', 'alfa', 'srl'],
    ['Societatea Comercială Alfa S.A.', 'alfa', 'sa'],
    ['SCM Impex SRL', 'scm impex', 'srl'],
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
  it('knows a company whatever way its documents write its form', () => {
    for (const [a, b] of [
      ['S.P.N. / STANCIUC', 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC'],
      ['SPN STANCIUC', 'SOCIETATE PROFESIONALA NOTARIALA STANCIUC.'],
      ['Casapu Mircea Adrian Persoană Fizică Autorizată', 'Casapu Mircea Adrian PFA'],
      ['Cabinet Medical Individual Dr. Popescu Ion', 'CMI Popescu Ion'],
      ['POPESCU ION INTREPRINDERE INDIVIDUALA', 'Popescu Ion II'],
      ['POPESCU INTREPRINDERE FAMILIALA', 'Popescu IF'],
      ['BIROU INDIVIDUAL NOTARIAL POPESCU ANA', 'BNP Popescu Ana'],
      ['BIROU INDIVIDUAL NOTARIAL POPESCU ANA', 'Biroul Notarial Popescu Ana'],
      ['S.C. Brutăria Fictivă S.R.L.', 'Brutaria Fictiva'],
    ]) {
      expect(sameCompany(a!, b!), `${a} / ${b}`).toBe(true);
    }
  });

  it('never takes initials inside a name, an honorific or another form for the same company', () => {
    for (const [a, b] of [
      ['SCM Impex SRL', 'Impex SRL'],
      ['SNC Lavalin Romania SA', 'Lavalin Romania'],
      ['CMI Dr. Popescu', 'Popescu SRL'],
      ['Cabinet de avocat Ionescu', 'Cabinet medical individual Ionescu'],
      ['Dr. Max SRL', 'Max SRL'],
      ['Popescu Ion PFA', 'Popescu Ion II'],
      ['SPN Stanciuc', 'SPN Stanciuc și Asociații Ionescu'],
    ]) {
      expect(sameCompany(a!, b!), `${a} / ${b}`).toBe(false);
    }
  });
});

describe('sameSpelling', () => {
  it('ignores case, diacritics, spaces and points', () => {
    expect(sameSpelling('Brutăria Spicul Auriu S.R.L.', 'BRUTARIA SPICUL AURIU SRL')).toBe(true);
  });

  it('keeps the legal form', () => {
    expect(sameSpelling('S.P.N. / STANCIUC', 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC')).toBe(
      false
    );
    expect(sameSpelling('S.C. ALFA S.R.L.', 'ALFA SRL')).toBe(false);
  });
});
