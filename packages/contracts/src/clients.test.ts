import { describe, expect, it } from 'vitest';

import { clientSearchTerms, listClientsQuerySchema } from './clients';

describe('clientSearchTerms', () => {
  it.each([
    ['SC Alfa SRL', ['alfa']],
    ['S.C. ALFA S.R.L.', ['alfa']],
    ['Beton Someș S.A.', ['beton', 'somes']],
    ['Ion Pop PFA', ['ion', 'pop']],
    ['Pop Ion I.I.', ['pop', 'ion']],
    ['Arcadia SNC', ['arcadia']],
    ['RO 1590082', ['1590082']],
    ['RO1590082', ['1590082']],
    ['ro 15 900 82', ['1590082']],
    ['15.900.82', ['1590082']],
    ['Studio 24.7', ['studio', '24', '7']],
    ['24.7 Fitness', ['24', '7', 'fitness']],
    ['24.7', ['24', '7']],
    ['Alfa 12 345', ['alfa', '12', '345']],
    ['S.C. M & M S.R.L.', ['m', 'm']],
    ['S.C. A.B. S.R.L.', ['a', 'b']],
    ['M & M SRL', ['m', 'm']],
    ['Casa IF Design', ['casa', 'if', 'design']],
    ['Casa IF Design SRL', ['casa', 'if', 'design']],
    ['Mobila SA Prod S.R.L.', ['mobila', 'sa', 'prod']],
    ['Popescu Ana I.I.', ['popescu', 'ana']],
    ['S.C. Ion Pop P.F.A.', ['ion', 'pop']],
    ['Cluj-Napoca', ['cluj', 'napoca']],
    ['S.P.N. / Stanciuc', ['stanciuc']],
    ['Societatea Profesională Notarială Stanciuc', ['stanciuc']],
    ['Casapu Mircea Persoană Fizică Autorizată', ['casapu', 'mircea']],
    ['CMI Dr Popescu', ['dr', 'popescu']],
    ['Ionescu S.P.A.R.L.', ['ionescu']],
    ['Alfa SRL-D', ['alfa']],
    ['Cabinet medical Dentis', ['cabinet', 'medical', 'dentis']],
    ['Dentis SCM Prod', ['dentis', 'scm', 'prod']],
    ['RO 1590082 SRL', ['1590082']],
  ])('reads %j as %j', (q, terms) => {
    expect(clientSearchTerms(q)).toEqual(terms);
  });

  it('keeps the legal form when nothing else is typed', () => {
    expect(clientSearchTerms('SRL')).toEqual(['srl']);
    expect(clientSearchTerms('s.r.l.')).toEqual(['s', 'r', 'l']);
  });

  it('keeps single letters that make no legal form', () => {
    expect(clientSearchTerms('Alfa B C')).toEqual(['alfa', 'b', 'c']);
  });

  it('is empty for no search', () => {
    expect(clientSearchTerms(undefined)).toEqual([]);
    expect(clientSearchTerms('  ')).toEqual([]);
  });
});

describe('the clients list query', () => {
  it('takes one value or a repeated one for a filter', () => {
    expect(listClientsQuerySchema.parse({ county: 'CJ' }).county).toEqual(['CJ']);
    expect(listClientsQuerySchema.parse({ training: ['untrained', 'overdue'] }).training).toEqual([
      'untrained',
      'overdue',
    ]);
  });

  it.each([{ county: 'XX' }, { documentation: 'done' }, { attention: [] }, { contract: 'soon' }])(
    'rejects %j',
    (query) => {
      expect(listClientsQuerySchema.safeParse(query).success).toBe(false);
    }
  );
});
