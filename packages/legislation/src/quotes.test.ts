import { describe, expect, it } from 'vitest';

import { compareTexts, tokenize } from './quotes';

const words = (text: string) => tokenize(text).map((token) => token.value);
const compare = (template: string, current: string, excerpt = false) =>
  compareTexts(template, current, { actToken: 'act:319/2006', excerpt, article: '7' });

describe('reading a passage as words', () => {
  it('ignores diacritics, cedillas, case, quotes and punctuation', () => {
    expect(words('baston de culoare albă; «mâini libere» – Şi ţara')).toEqual(
      words('Baston de culoare alba, "mâini libere" - și țara')
    );
  });

  it('reads a superscript as the portal writes it, and a subscript', () => {
    expect(words('art. 80¹ alin. (1²), CO₂')).toEqual(words('art. 80^1 alin. (1^2), CO_2'));
  });

  it('reads every way of naming an act as the act', () => {
    const act = ['act:319/2006'];
    expect(words('Legea 319/2006')).toEqual(act);
    expect(words('Legea nr. 319/2006')).toEqual(act);
    expect(words('Legii securității și sănătății în muncă nr. 319/2006')).toEqual(act);
    expect(words('Hotărârea Guvernului nr. 1.425/2006')).toEqual(words('H.G. 1425/2006'));
    expect(words('Ordinul ministrului administrației și internelor nr. 163/2007')).toEqual(
      words('OMAI 163/2007')
    );
  });

  it('pairs alineate by their numbers and drops the labels of letters and points', () => {
    expect(words('(1¹) Angajatorul:\na) evaluează;\n1.2. verifică')).toEqual([
      '¶1^1',
      'angajatorul',
      'evalueaza',
      'verifica',
    ]);
  });

  it('drops a letter label run into the line before it', () => {
    expect(words('la un sindicat; m¹) dreptul de a solicita')).toEqual(
      words('la un sindicat;\nm^1) dreptul de a solicita')
    );
  });
});

describe('comparing a quoted passage with the current text', () => {
  it('finds nothing where only the presentation differs', () => {
    const comparison = compare(
      '(1) Angajatorul are obligația să ia măsurile prevăzute la art. 7 alin. (2) din Legea 319/2006.\n' +
        '(2) Dispozițiile Legii 319/2006 se aplică evenimentelor de muncă.',
      '(1) Angajatorul are obligația să ia măsurile prevăzute la alin. (2).\n' +
        '(2) Dispozițiile prezentei legi se aplică eveni-mentelor de muncă.'
    );
    expect(comparison).toEqual({ similarity: 1, differences: [] });
  });

  it('names the norms\' "lege" by the act it means', () => {
    expect(
      compare('potrivit art. 7 din Legea 319/2006', 'potrivit art. 7 din lege').differences
    ).toEqual([]);
  });

  it('reports the words that changed, per alineat, with both passages', () => {
    const comparison = compare(
      '(1) Lucrătorii poartă echipamentul.\n(2) Conducătorii poartă casca de protecție omologată.',
      '(1) Lucrătorii poartă echipamentul.\n(2) Conducătorii poartă pe cap cască de protecție omologată pentru această categorie de vehicul.'
    );
    expect(comparison.differences).toEqual([
      {
        alineat: '2',
        template: '(2) Conducătorii poartă casca de protecție omologată.',
        current:
          '(2) Conducătorii poartă pe cap cască de protecție omologată pentru această categorie de vehicul.',
        changes: [
          { template: '', current: 'pe cap' },
          { template: '', current: 'pentru această categorie de vehicul' },
        ],
      },
    ]);
  });

  it('reports an alineat the act gained', () => {
    const comparison = compare(
      '(1) Primul.\n(2) Al doilea.',
      '(1) Primul.\n(1^1) Nou.\n(2) Al doilea.'
    );
    expect(comparison.differences).toEqual([
      expect.objectContaining({
        alineat: '1^1',
        changes: [{ template: '', current: '(1^1) Nou' }],
      }),
    ]);
  });

  it('keeps a name the act does not use for itself as a difference', () => {
    expect(
      compare('Dispozițiile O.U.G. 99/2000 se aplică.', 'Dispozițiile prezentei legi se aplică.')
        .differences
    ).toHaveLength(1);
  });

  it('compares an extract with the stretch of a long text it comes from', () => {
    const annex = [
      'LISTA agenților',
      ...Array.from(
        { length: 30 },
        (_, index) => `${index + 1}. Agent ${index} cu efecte asupra lucrătorilor.`
      ),
    ].join('\n');
    const comparison = compare(
      'LISTA agenților\nAgent 0 cu efecte asupra lucrătorilor.',
      annex,
      true
    );
    expect(comparison).toEqual({ similarity: 1, differences: [] });
  });
});
