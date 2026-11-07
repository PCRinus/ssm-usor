import { describe, expect, it } from 'vitest';

import { checkNameSpellings } from './name-spellings';
import { fromWire } from './reading';
import { files, wireAnswer } from './test/fixtures';

const instructions = 'Dosar/IPSSM.docx';

function proposalWith(representative: string) {
  const answer = wireAnswer();
  answer.facts = answer.facts.map((fact) =>
    fact.field === 'client.legalRepresentativeName' && fact.otherCompany === ''
      ? { ...fact, value: representative, quote: representative }
      : fact
  );
  return fromWire(answer);
}

describe('checkNameSpellings', () => {
  it('finds nothing in documents that spell every name one way', () => {
    expect(checkNameSpellings(fromWire(wireAnswer()), files)).toEqual([]);
  });

  it('flags a name another file spells one letter apart, with the file and the passage', () => {
    const proposal = proposalWith('Mihai IONESCU - DRAGOMIR');
    const texts = {
      ...files,
      [instructions]: [
        'INSTRUCȚIUNI PROPRII DE SECURITATE ȘI SĂNĂTATE ÎN MUNCĂ',
        'Aprobat, Administrator: Mihai IOANESCU - DRAGOMIR',
        'Semnătura: Mihai IOANESCU - DRAGOMIR',
      ].join('\n'),
    };

    expect(checkNameSpellings(proposal, texts)).toEqual([
      {
        path: 'client.legalRepresentativeName.options.0',
        code: 'name_spelled_differently',
        detail: 'Mihai IOANESCU - DRAGOMIR',
        source: { file: instructions, quote: 'Aprobat, Administrator: Mihai IOANESCU - DRAGOMIR' },
      },
    ]);
  });

  it('ignores case, diacritics, hyphens and the order of the names', () => {
    const proposal = proposalWith('Mihai Ionescu-Drăgomir');
    const texts = {
      [instructions]: 'Administrator IONESCU DRAGOMIR MIHAI\nIoanescu-Drăgomir Mihai',
    };

    expect(checkNameSpellings(proposal, texts).map((flag) => flag.detail)).toEqual([
      'Ioanescu-Drăgomir Mihai',
    ]);
  });

  it('checks the responsible persons too, each spelling once', () => {
    const texts = {
      [instructions]: 'Prim ajutor: Ionescu Mria.\nConducătorul locului de muncă: Ionescu Mria',
    };

    expect(checkNameSpellings(fromWire(wireAnswer()), texts)).toEqual([
      expect.objectContaining({
        path: 'responsiblePersons.0.fullName',
        detail: 'Ionescu Mria',
        source: { file: instructions, quote: 'Prim ajutor: Ionescu Mria.' },
      }),
    ]);
  });

  it('leaves alone another person, a declined name and a word that only starts like a name', () => {
    const proposal = fromWire(wireAnswer());
    const texts = {
      [instructions]: [
        'Ionescu Mariana, vânzătoare',
        'Ionescu Marian, șofer',
        'semnează doamnei Ionescu Mariei',
        'Vasilescu Ana, contabil',
        'Vasilescul Andreiescu',
        'Georgescu Dan și Georgescu Dana',
      ].join('\n'),
    };

    expect(checkNameSpellings(proposal, texts)).toEqual([]);
  });

  it('never joins the words of a name across lines', () => {
    const texts = { [instructions]: 'Responsabil: Ionescu\nMaia Popescu' };

    expect(checkNameSpellings(fromWire(wireAnswer()), texts)).toEqual([]);
  });

  it('says nothing of a spelling that is another option of the same value', () => {
    const answer = wireAnswer();
    answer.facts.push({
      field: 'client.legalRepresentativeName',
      value: 'Vasilescu Andrie',
      file: 'Dosar/Decizia 1.docx',
      quote: 'dl. Vasilescu Andrei',
      otherCompany: '',
    });
    const texts = { [instructions]: 'Administrator Vasilescu Andrie' };

    expect(checkNameSpellings(fromWire(answer), texts)).toEqual([]);
  });

  it('leaves out another company’s names and a name of one word', () => {
    const answer = wireAnswer();
    answer.responsiblePersons[0]!.fullName = 'Ionescu';
    const texts = { [instructions]: 'Petrescu Ioan, Ionescy, Ionesco' };

    expect(checkNameSpellings(fromWire(answer), texts)).toEqual([]);
  });
});
