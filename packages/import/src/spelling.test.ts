import { describe, expect, it } from 'vitest';

import { allCapitals, correctSpelling, sentenceCase } from './spelling';

const source = (quote: string) => [{ file: 'Dosar/Decizia 1.docx', quote }];

describe('sentenceCase', () => {
  it('lowers a value in capitals and raises its first letter and each one after a stop or a colon', () => {
    expect(sentenceCase('ÎNGRIJITOR HOTEL')).toBe('Îngrijitor hotel');
    expect(sentenceCase('SE INTERZICE FUMATUL. ACCESUL: NUMAI CU ACORD')).toBe(
      'Se interzice fumatul. Accesul: Numai cu acord'
    );
    expect(sentenceCase('- FĂINĂ\n- AMBALAJE')).toBe('- Făină\n- Ambalaje');
  });

  it('keeps a legal form’s initials and the trade’s acronyms in capitals', () => {
    expect(sentenceCase('SALUBRIS S.A. ȘI ECO S.R.L.,')).toBe('Salubris S.A. și eco S.R.L.,');
    expect(sentenceCase('RESPONSABIL PSI (ISU)')).toBe('Responsabil PSI (ISU)');
  });

  it('leaves a number at the start as it is', () => {
    expect(sentenceCase('2 STINGĂTOARE')).toBe('2 stingătoare');
  });
});

describe('allCapitals', () => {
  it('takes a value of at least four letters, none of them small', () => {
    expect(allCapitals('BUCATAR')).toBe(true);
    expect(allCapitals('P6 / CO2')).toBe(false);
    expect(allCapitals('Bucătar')).toBe(false);
    expect(allCapitals('PET')).toBe(false);
  });
});

describe('correctSpelling', () => {
  it('corrects capitals and keeps the quote’s spelling beside', () => {
    expect(correctSpelling('ÎNGRIJITOR HOTEL', source('FUNCTIA : | INGRIJITOR HOTEL'))).toEqual({
      value: 'Îngrijitor hotel',
      spelling: 'INGRIJITOR HOTEL',
    });
  });

  it('keeps the value as written by the model when the quote does not hold it', () => {
    expect(correctSpelling('ÎNGRIJITOR', source('Postul de la recepție'))).toEqual({
      value: 'Îngrijitor',
      spelling: 'ÎNGRIJITOR',
    });
  });

  it('keeps the quote’s spelling of a value the model gave diacritics', () => {
    expect(correctSpelling('Bucătar', source('| Bucatar | Arsuri |'))).toEqual({
      value: 'Bucătar',
      spelling: 'Bucatar',
    });
  });

  it('records nothing for a value as the document writes it, or written in other capitals only', () => {
    expect(correctSpelling('Bucătar', source('Postul de bucătar'))).toEqual({
      value: 'Bucătar',
      spelling: null,
    });
    expect(correctSpelling('Bucătar', source('Postul: | Bucătar |'))).toEqual({
      value: 'Bucătar',
      spelling: null,
    });
  });

  it('records nothing for a value only the model changed in other ways', () => {
    expect(correctSpelling('Bucătar', source('cofetar'))).toEqual({
      value: 'Bucătar',
      spelling: null,
    });
  });

  it('corrects only the capitals when asked to', () => {
    expect(
      correctSpelling('Administrator', source('Administrator societate'), { diacritics: false })
    ).toEqual({ value: 'Administrator', spelling: null });
    expect(
      correctSpelling('ADMINISTRATOR', source('ADMINISTRATOR'), { diacritics: false })
    ).toEqual({ value: 'Administrator', spelling: 'ADMINISTRATOR' });
  });
});
