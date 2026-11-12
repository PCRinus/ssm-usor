import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type ActText, parseActText } from './act-text';
import { assessImpact, type CitedPassage, parseLocator } from './impact';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const quotes = (
  JSON.parse(fixture('template-quotes.json')) as {
    citations: (CitedPassage & { file: string })[];
  }
).citations;
const quotesOf = (act: string) => quotes.filter((citation) => citation.act === act);
const reference = (act: string, article: string | null): CitedPassage => ({
  form: 'reference',
  act,
  article,
  locator: null,
  text: null,
});

const roadCode = parseActText(fixture('oug-195-2002-text.html'), 41006);
const criminalCode = parseActText(fixture('codul-penal-text.html'), 314314);

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

describe('assessing what a new consolidated form means for the templates', () => {
  it('finds the changed alineat of a quote and the act that changed it', () => {
    const impact = assessImpact({
      actId: 'oug-195-2002',
      citations: quotesOf('oug-195-2002'),
      text: roadCode,
      since: '2026-08-25',
    });
    expect(impact.outcome).toBe('quote_differs');
    expect(impact.amendingActs.map((act) => act.name)).toEqual(['Legea 207/2026']);
    expect(impact.amendedUnits.map((note) => note.subject)).toEqual([
      'Alineatul (2), Articolul 36, Sectiunea 1, Capitolul V',
    ]);
    const statuses = Object.fromEntries(
      impact.citations.map((result) => [result.citation.locator, result.status])
    );
    expect(statuses).toEqual({
      'Art. 1 alin. (1), (2)': 'unaffected',
      'Art. 35 alin. (1) – (7)': 'unaffected',
      'Art. 36 alin. (1) – (3)': 'quote_differs',
    });
    const changed = impact.citations.find((result) => result.status === 'quote_differs');
    expect(changed).toMatchObject({
      differences: [
        {
          alineat: '2',
          template:
            '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.',
          current:
            '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător.',
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
      amendedSince: [expect.objectContaining({ date: '2026-11-06' })],
    });
  });

  it('compares the text itself, so a change the notes date earlier still shows', () => {
    const impact = assessImpact({
      actId: 'oug-195-2002',
      citations: quotesOf('oug-195-2002'),
      text: roadCode,
      since: '2026-11-06',
    });
    expect(impact.amendedUnits).toEqual([]);
    expect(impact.outcome).toBe('quote_differs');
  });

  it('sends a reference to an amended article for review', () => {
    const impact = assessImpact({
      actId: 'oug-195-2002',
      citations: [reference('oug-195-2002', '36'), reference('oug-195-2002', '1')],
      text: roadCode,
      since: '2026-08-25',
    });
    expect(impact.outcome).toBe('needs_review');
    expect(impact.citations.map((result) => result.status)).toEqual([
      'reference_touched',
      'unaffected',
    ]);
  });

  it('sends a reference to an article no longer in the act for review', () => {
    const [result] = assessImpact({
      actId: 'oug-195-2002',
      citations: [reference('oug-195-2002', '999')],
      text: roadCode,
      since: '2026-11-06',
    }).citations;
    expect(result).toMatchObject({ status: 'reference_touched', missing: true });
  });

  it('counts every amendment when the templates were never compared', () => {
    const impact = assessImpact({
      actId: 'oug-195-2002',
      citations: [reference('oug-195-2002', '35'), reference('oug-195-2002', null)],
      text: roadCode,
      since: null,
    });
    expect(impact.amendedUnits.length).toBe(roadCode.notes.length);
    expect(impact.citations.map((result) => result.status)).toEqual([
      'reference_touched',
      'unaffected',
    ]);
  });

  it('finds no impact when the quotes match and nothing cited was amended', () => {
    const impact = assessImpact({
      actId: 'lege-286-2009',
      citations: [...quotesOf('lege-286-2009'), reference('lege-286-2009', '350')],
      text: criminalCode,
      since: '2026-10-18',
    });
    expect(impact.outcome).toBe('no_impact');
  });

  it('finds an article of norms the act approves in an annex of their own', () => {
    const impact = assessImpact({
      actId: 'hg-1425-2006',
      citations: quotesOf('hg-1425-2006'),
      text: withNorms(),
      since: '2022-03-07',
    });
    expect(impact.citations.map((result) => result.status)).toEqual(['unaffected']);
  });

  it('reads an alineat the older forms mark as a letter', () => {
    const impact = assessImpact({
      actId: 'hg-971-2006',
      citations: quotesOf('hg-971-2006'),
      text: parseActText(fixture('hg-971-2006-text.html'), 74127),
      since: '2015-06-01',
    });
    expect(impact.outcome).toBe('no_impact');
  });

  it('sends a quote it cannot find for review', () => {
    const impact = assessImpact({
      actId: 'oug-195-2002',
      citations: [
        {
          form: 'quote',
          act: 'oug-195-2002',
          article: '36',
          locator: 'Art. 36',
          text: 'Angajatorul asigură echipamentul individual de protecție.',
        },
      ],
      text: roadCode,
      since: '2026-11-06',
    });
    expect(impact.outcome).toBe('needs_review');
    expect(impact.citations[0]?.status).toBe('not_located');
  });

  it('checks a quote with no words as a reference to its article', () => {
    const [result] = assessImpact({
      actId: 'oug-195-2002',
      citations: [
        { form: 'quote', act: 'oug-195-2002', article: '36', locator: 'Art. 36', text: '' },
      ],
      text: roadCode,
      since: '2026-08-25',
    }).citations;
    expect(result?.status).toBe('reference_touched');
  });
});
