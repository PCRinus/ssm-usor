import { describe, expect, it } from 'vitest';

import { withoutLegalForms } from './legal-forms';
import { foldName, sameName } from './name-match';

describe('withoutLegalForms anywhere', () => {
  it.each([
    ['SOCIETATE PROFESIONALA NOTARIALA STANCIUC', 'stanciuc'],
    ['SOCIETATE PROFESIONALA NOTARIALA STANCIUC.', 'stanciuc'],
    ['SOCIETATEA PROFESIONALA NOTARIALA STANCIUC', 'stanciuc'],
    ['S.P.N. / STANCIUC', 'stanciuc'],
    ['S. P. N. Stanciuc', 'stanciuc'],
    ['SPN STANCIUC', 'stanciuc'],
    ['Societatea Profesională Notarială Stănciuc', 'stanciuc'],
    ['Biroul Individual Notarial Ionescu Ana', 'ionescu ana'],
    ['B.I.N. Ionescu Ana', 'ionescu ana'],
    ['Casapu Mircea Adrian Persoană Fizică Autorizată', 'casapu mircea adrian'],
    ['Casapu Mircea Adrian PFA', 'casapu mircea adrian'],
    ['Cabinet Medical Individual Popescu Ion', 'popescu ion'],
    ['C.M.I. Popescu Ion', 'popescu ion'],
    ['CMI Popescu Ion', 'popescu ion'],
    ['Cabinetul Medical Individual Popescu Ion', 'popescu ion'],
    ['Societate Civilă Medicală Dentis', 'dentis'],
    ['S.C.M. Dentis', 'dentis'],
    ['ION IONESCU - Cabinet de avocat', 'ion ionescu'],
    ['Ionescu, Popescu - Societate civilă de avocați', 'ionescu popescu'],
    ['Ionescu și Asociații S.C.A.', 'ionescu si asociatii'],
    ['Ionescu S.P.A.R.L.', 'ionescu'],
    ['BEJ Marinescu Dan', 'marinescu dan'],
    ['Birou Executor Judecătoresc Marinescu Dan', 'marinescu dan'],
    ['Insolvență Expert IPURL', 'insolventa expert'],
    ['Cabinet Individual de Insolvență Pop Ana', 'pop ana'],
    ['Lichidator S.P.R.L.', 'lichidator'],
    ['Alfa S.R.L.-D.', 'alfa'],
    ['ALFA SRL-D', 'alfa'],
    ['Alfa Societate cu Răspundere Limitată', 'alfa'],
    ['Societatea Comercială Alfa S.A.', 'alfa'],
  ])('reads %j as %j', (name, words) => {
    expect(withoutLegalForms(name, 'anywhere').join(' ')).toBe(words);
  });

  it.each([
    ['Hala II', 'hala ii'],
    ['Depozit IF', 'depozit if'],
    ['Casa IF Design SRL', 'casa if design'],
    ['Sucursala Cluj Alfa SRL', 'sucursala cluj alfa'],
    ['Cabinet medical', 'cabinet medical'],
    ['Birou', 'birou'],
    ['Societatea Alfa', 'societatea alfa'],
  ])('keeps the words of %j', (name, words) => {
    expect(withoutLegalForms(name, 'anywhere').join(' ')).toBe(words);
  });

  it('reads S.C. as the opening form when initials follow it', () => {
    expect(withoutLegalForms('S.C. A.B. S.R.L.', 'anywhere')).toEqual(['a', 'b']);
    expect(withoutLegalForms('S.C.A.B. S.R.L.', 'anywhere')).toEqual(['a', 'b']);
    expect(withoutLegalForms('S.C. M. & M. S.R.L.', 'anywhere')).toEqual(['m', 'm']);
    expect(withoutLegalForms('S.C. A. Popescu SRL', 'anywhere')).toEqual(['a', 'popescu']);
  });
});

describe('foldName', () => {
  it('drops an honorific', () => {
    expect(foldName('CMI Dr. Popescu Ion')).toBe('popescu ion');
    expect(foldName('D-na Popescu Ana')).toBe('popescu ana');
  });

  it('keeps DR without its point, which may be a company’s initials', () => {
    expect(foldName('DR Construct SRL')).toBe('dr construct');
  });

  it('keeps a name that is nothing but a legal form', () => {
    expect(foldName('SRL')).toBe('srl');
    expect(sameName('S.R.L.', 'S.A.')).toBe(false);
  });
});

describe('sameName', () => {
  it('knows a company whatever way its documents write its form', () => {
    for (const name of [
      'S.P.N. / STANCIUC',
      'SPN STANCIUC',
      'SOCIETATE PROFESIONALA NOTARIALA STANCIUC.',
    ]) {
      expect(sameName(name, 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC'), name).toBe(true);
    }
    expect(
      sameName('Casapu Mircea Adrian Persoană Fizică Autorizată', 'Casapu Mircea Adrian PFA')
    ).toBe(true);
    expect(sameName('Cabinet Medical Individual Dr. Popescu Ion', 'CMI Popescu Ion')).toBe(true);
  });

  it('still tells companies apart by the rest of their name', () => {
    expect(sameName('SPN Stanciuc', 'SPN Stanciuc și Asociații Ionescu')).toBe(false);
    expect(sameName('Hala II', 'Hala')).toBe(false);
  });
});
