import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type ActText, parseActText } from './act-text';
import { type CitedPassage, parseLocator } from './locator';
import { reviewQuotes } from './review';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const quotes = (
  JSON.parse(fixture('template-quotes.json')) as {
    citations: (CitedPassage & { file: string })[];
  }
).citations;
const quotesOf = (act: string) => quotes.filter((citation) => citation.act === act);
const statuses = (text: ActText, act: string) =>
  Object.fromEntries(
    reviewQuotes(text, quotesOf(act)).map((result) => [result.citation.locator, result.status])
  );

const roadCode = parseActText(fixture('oug-195-2002-text.html'), 41006);

function withNorms(): ActText {
  const decision = parseActText(fixture('hg-1425-2006-text.html'), 76337);
  const norms = parseActText(fixture('hg-1425-2006-norms.html'), 252029);
  decision.references[0]!.unit!.content.push(...norms.content);
  return decision;
}

describe('reading a citation locator', () => {
  it('reads articles, alineate, ranges, letters and points', () => {
    expect(parseLocator('Art. 36 alin. (1) – (3)')).toEqual({
      articles: ['36'],
      alineate: { list: ['1', '3'], range: true },
      letters: [],
      point: null,
      annex: null,
    });
    expect(parseLocator('Art. 12 alin. (1¹) lit. c), d)')).toMatchObject({
      articles: ['12'],
      alineate: { list: ['1^1'], range: false },
      letters: ['c', 'd'],
    });
    expect(parseLocator('Art. 24, 25')?.articles).toEqual(['24', '25']);
    expect(parseLocator('Art. II, pct. 1')).toMatchObject({ articles: ['II'], point: '1' });
    expect(parseLocator('Anexa 2')?.annex).toBe('2');
    expect(parseLocator('pct. 5')?.point).toBe('5');
  });
});

describe("reviewing the templates' quotes against the current law", () => {
  it('finds the alineat the law changed and passes over how the templates write it', () => {
    expect(statuses(roadCode, 'oug-195-2002')).toEqual({
      'Art. 1 alin. (1), (2)': 'matches',
      'Art. 35 alin. (1) – (7)': 'matches',
      'Art. 36 alin. (1) – (3)': 'differs',
    });
    const [changed] = reviewQuotes(roadCode, quotesOf('oug-195-2002')).filter(
      (result) => result.status === 'differs'
    );
    expect(changed).toMatchObject({
      differences: [
        {
          alineat: '2',
          template:
            '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.',
          changes: [
            { template: '', current: 'pe cap' },
            {
              template: '',
              current:
                'pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător',
            },
          ],
        },
      ],
    });
  });

  it('finds the quotes of the Criminal Code and of norms kept as an annex document', () => {
    expect(
      statuses(parseActText(fixture('codul-penal-text.html'), 314314), 'lege-286-2009')
    ).toEqual({ 'Art. 349': 'matches', 'Art. 350': 'matches' });
    expect(statuses(withNorms(), 'hg-1425-2006')).toEqual({ 'Art. 98': 'matches' });
  });

  it('reads an alineat the older forms mark as a letter', () => {
    expect(statuses(parseActText(fixture('hg-971-2006-text.html'), 74127), 'hg-971-2006')).toEqual({
      'Art. 6': 'matches',
    });
  });

  it('leaves a quote it cannot find as not located', () => {
    const [result] = reviewQuotes(roadCode, [
      {
        form: 'quote',
        act: 'oug-195-2002',
        article: '36',
        locator: 'Art. 36',
        text: 'Angajatorul asigură echipamentul individual de protecție.',
      },
    ]);
    expect(result?.status).toBe('not_located');
  });
});
