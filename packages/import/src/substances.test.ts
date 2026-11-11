import { describe, expect, it } from 'vitest';

import { checkAllowedValues, checkQuotes } from './checks';
import { proposalChoices, proposalSchema } from './proposal';
import { type Reading, readingAnswer, toProposal } from './reading';

type Named = Reading['substances'][number];
type Fact = Reading['facts'][number];

const riskEvaluation = 'Dosar/SSM/Evaluarea riscurilor.docx';
const cleaningPlan = 'Dosar/SSM/Plan de igienizare.docx';
const meansList = 'Dosar/PSI/Lista mijloacelor.docx';

const reading = (substances: Named[], facts: Fact[] = []): Reading => ({
  facts,
  workplaces: [],
  workplaceFacts: [],
  workplaceSuggestions: [],
  jobPositions: [],
  jobPositionFacts: [],
  responsiblePersons: [],
  fireEquipment: [],
  fireInstallations: [],
  substances,
  protectiveEquipment: [],
  employees: [],
  notes: [],
});

const named = (name: string, file: string, quote: string, otherCompany: string | null = null) => ({
  name,
  file,
  quote,
  otherCompany,
});

const noneUsed: Fact = {
  field: 'fireSafety.substancesState',
  value: 'none',
  file: meansList,
  quote: 'La punctul de lucru nu se utilizează substanțe periculoase.',
  otherCompany: null,
};

describe('the substances a client import proposes', () => {
  it('proposes "listed" with one entry for each substance the documents name, each with its passage', () => {
    const proposal = toProposal(
      reading([
        named('Detergenți', riskEvaluation, '| Detergenți | spălarea vaselor |'),
        named('Ulei de prăjit', riskEvaluation, '| Ulei de prăjit | friteuză |'),
      ])
    );

    expect(proposal.fireSafety.substancesState).toEqual({
      options: [
        {
          value: 'listed',
          sources: [
            { file: riskEvaluation, quote: '| Detergenți | spălarea vaselor |' },
            {
              file: riskEvaluation,
              quote: '| Ulei de prăjit | friteuză |',
            },
          ],
          otherCompanyName: null,
        },
      ],
    });
    expect(proposal.substances).toEqual([
      {
        id: 'substance-1',
        name: 'Detergenți',
        sources: [{ file: riskEvaluation, quote: '| Detergenți | spălarea vaselor |' }],
        otherCompanyName: null,
        spelling: {},
      },
      {
        id: 'substance-2',
        name: 'Ulei de prăjit',
        sources: [{ file: riskEvaluation, quote: '| Ulei de prăjit | friteuză |' }],
        otherCompanyName: null,
        spelling: {},
      },
    ]);
  });

  it('proposes "none" where a document says the client uses none and names none', () => {
    const proposal = toProposal(reading([], [noneUsed]));

    expect(proposal.fireSafety.substancesState.options).toEqual([
      {
        value: 'none',
        sources: [{ file: meansList, quote: noneUsed.quote }],
        otherCompanyName: null,
      },
    ]);
    expect(proposal.substances).toEqual([]);
  });

  it('proposes no answer where the documents say nothing, since silence is never "none"', () => {
    const proposal = toProposal(reading([]));

    expect(proposal.fireSafety.substancesState.options).toEqual([]);
    expect(proposal.substances).toEqual([]);
  });

  it('takes "listed" from the substances named, never from a sentence the model gave it for', () => {
    const proposal = toProposal(
      reading([], [{ ...noneUsed, value: 'listed', quote: 'Se utilizează substanțe periculoase.' }])
    );

    expect(proposal.fireSafety.substancesState.options).toEqual([]);
  });

  it('leaves documents that name substances and say none are used as a choice for the member', () => {
    const proposal = toProposal(
      reading([named('Dezinfectant', cleaningPlan, 'dezinfectant pentru suprafețe')], [noneUsed])
    );

    expect(proposal.fireSafety.substancesState.options.map((option) => option.value)).toEqual([
      'none',
      'listed',
    ]);
    expect(proposalChoices(proposal).map((choice) => choice.path)).toContain(
      'fireSafety.substancesState'
    );
    expect(proposal.substances.map((substance) => substance.name)).toEqual(['Dezinfectant']);
  });

  it('folds a name several files give into one entry with every passage, keeping its diacritics', () => {
    const proposal = toProposal(
      reading([
        named('Detergenti', riskEvaluation, '| Detergenti | spalarea vaselor |'),
        named('Benzină', meansList, '| Benzină | canistră 10 l |'),
      ]),
      reading([named('Detergenți', cleaningPlan, 'Detergenți pentru vase')])
    );

    expect(
      proposal.substances.map((substance) => [
        substance.name,
        substance.sources.map((source) => source.file),
      ])
    ).toEqual([
      ['Detergenți', [riskEvaluation, cleaningPlan]],
      ['Benzină', [meansList]],
    ]);
  });

  it('joins a name to the fuller one that lists it with "și" or a comma, in any order', () => {
    const row = '| Detergenți și soluții de curățare | spălarea pardoselilor |';
    const proposal = toProposal(
      reading([
        named('Detergenți', cleaningPlan, 'Detergenți pentru pardoseli'),
        named('Soluții de curățare', cleaningPlan, 'soluții de curățare diluate'),
        named('Detergenți și soluții de curățare', riskEvaluation, row),
        named('Soluții de curățare, detergenți', meansList, 'soluții de curățare, detergenți'),
        named('Benzină', meansList, '| Benzină | canistră 10 l |'),
      ])
    );

    expect(
      proposal.substances.map((substance) => [
        substance.name,
        substance.sources.map((source) => source.quote),
      ])
    ).toEqual([
      [
        'Detergenți și soluții de curățare',
        [
          'Detergenți pentru pardoseli',
          row,
          'soluții de curățare, detergenți',
          'soluții de curățare diluate',
        ],
      ],
      ['Benzină', ['| Benzină | canistră 10 l |']],
    ]);
    expect(
      checkQuotes(proposal, {
        [cleaningPlan]: 'Detergenți pentru pardoseli; soluții de curățare diluate.',
        [riskEvaluation]: row,
        [meansList]: 'soluții de curățare, detergenți | Benzină | canistră 10 l |',
      })
    ).toEqual([]);
  });

  it('keeps apart names that share a word but not a listed item', () => {
    const proposal = toProposal(
      reading([
        named('Ulei', meansList, '| Ulei hidraulic | Ulei |'),
        named('Ulei hidraulic', meansList, '| Ulei hidraulic | Ulei |'),
        named('Vopsele și diluanți', meansList, 'vopsele și diluanți'),
        named('Diluanți și lacuri', meansList, 'diluanți și lacuri'),
        named('?!', meansList, '?!'),
      ])
    );

    expect(proposal.substances.map((substance) => substance.name)).toEqual([
      'Ulei',
      'Ulei hidraulic',
      'Vopsele și diluanți',
      'Diluanți și lacuri',
      '?!',
    ]);
  });

  it('does not split a name at a decimal comma, nor hold its quote by a digit', () => {
    const proposal = toProposal(
      reading([
        named('Hipoclorit 2,5%', meansList, '| Hipoclorit 2,5% | 5 l |'),
        named('Hipoclorit', meansList, '| Hipoclorit 2,5% | 5 l |'),
      ])
    );

    expect(proposal.substances.map((substance) => substance.name)).toEqual([
      'Hipoclorit 2,5%',
      'Hipoclorit',
    ]);
    expect(
      checkQuotes(
        {
          ...proposal,
          substances: [
            {
              ...proposal.substances[0]!,
              sources: [
                { file: meansList, quote: 'Soluție de 5 litri pentru spălarea pardoselilor' },
              ],
            },
          ],
        },
        {
          [meansList]: '| Hipoclorit 2,5% | 5 l |\nSoluție de 5 litri pentru spălarea pardoselilor',
        }
      ).map((flag) => flag.code)
    ).toEqual(['value_not_in_quote']);
  });

  it('does not join the client’s substance to a fuller name read in another company’s passage', () => {
    const proposal = toProposal(
      reading([
        named('Detergenți', riskEvaluation, 'Detergenți'),
        named('Detergenți și clor', meansList, 'detergenți și clor', 'ALTĂ FIRMĂ SRL'),
      ])
    );

    expect(
      proposal.substances.map((substance) => [substance.name, substance.otherCompanyName])
    ).toEqual([
      ['Detergenți', null],
      ['Detergenți și clor', 'ALTĂ FIRMĂ SRL'],
    ]);
  });

  it('writes a name in capitals in sentence case and keeps the document’s spelling beside it', () => {
    const proposal = toProposal(
      reading([named('BUTELIE GPL', meansList, '| BUTELIE GPL | 1 buc. |')])
    );

    expect(proposal.substances[0]).toMatchObject({
      name: 'Butelie GPL',
      spelling: { name: 'BUTELIE GPL' },
    });
  });

  it('proposes unticked what only another company’s passages name', () => {
    const proposal = toProposal(
      reading([named('Diluant', meansList, 'diluant pentru vopsele', 'Alt Client SRL')])
    );

    expect(proposal.substances[0]!.otherCompanyName).toBe('Alt Client SRL');
    expect(proposal.fireSafety.substancesState.options[0]).toMatchObject({
      value: 'listed',
      otherCompanyName: 'Alt Client SRL',
    });
  });

  it('flags a passage not found in its file, and one that does not name the substance', () => {
    const proposal = toProposal(
      reading([
        named('Vopsea', meansList, 'vopsea acrilică în depozit'),
        named('Motorină', meansList, 'rezervor de 200 l'),
      ])
    );
    const flags = checkQuotes(proposal, {
      [meansList]: 'În depozit se păstrează vopsea lavabilă. Generatorul are un rezervor de 200 l.',
    });

    expect(flags).toEqual(
      expect.arrayContaining([
        { path: 'substances.0.sources.0', code: 'quote_not_found' },
        { path: 'substances.1.sources.0', code: 'value_not_in_quote' },
        { path: 'fireSafety.substancesState.options.0.sources.0', code: 'quote_not_found' },
      ])
    );
  });

  it('drops a name shorter or longer than the list takes, and lists nothing on it', () => {
    const proposal = toProposal(
      reading([
        named('x'.repeat(161), meansList, 'x'.repeat(161)),
        named(' - ', meansList, 'Substanțe: -'),
      ])
    );

    expect(proposal.substances).toEqual([]);
    expect(proposal.fireSafety.substancesState.options).toEqual([]);
    expect(checkAllowedValues(proposal)).toEqual([]);
  });

  it('reads a page read before substances were asked, and opens a proposal stored before', () => {
    const old: Partial<Reading> = reading([]);
    delete old.substances;
    const proposal = toProposal(old as Reading);
    expect(proposal.substances).toEqual([]);

    const stored: Record<string, unknown> = structuredClone(proposal);
    delete stored.substances;
    delete (stored.fireSafety as Record<string, unknown>).substancesState;
    const parsed = proposalSchema.parse(stored);
    expect(parsed.substances).toEqual([]);
    expect(parsed.fireSafety.substancesState).toEqual({ options: [] });
  });

  it('asks the model for the substances and the statement on the wire, with no nullable member', () => {
    const answer = readingAnswer.parse({
      ...reading([named('Detergenți', riskEvaluation, '| Detergenți | spălarea vaselor |')]),
      facts: [{ ...noneUsed, otherCompany: '' }],
      substances: [
        {
          name: 'Detergenți',
          file: riskEvaluation,
          quote: '| Detergenți | spălarea vaselor |',
          otherCompany: '',
        },
      ],
    });

    expect(answer.facts[0]!.field).toBe('fireSafety.substancesState');
    expect(answer.substances).toEqual([
      {
        name: 'Detergenți',
        file: riskEvaluation,
        quote: '| Detergenți | spălarea vaselor |',
        otherCompany: null,
      },
    ]);
  });
});
