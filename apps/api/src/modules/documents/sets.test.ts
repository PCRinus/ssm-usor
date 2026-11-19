import { type DocumentSet, documentSetTypeKeys } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { stableJson } from '../../lib/json';
import { type DocumentFacts } from './context';
import { facts } from './context.fixture';
import type { StoredDocumentFacts } from './facts';
import { rulesOf } from './sets';

const stored = (set: DocumentSet, from: DocumentFacts): StoredDocumentFacts => ({
  ...from,
  set,
  clientArchived: false,
});

const withGaps: DocumentFacts = {
  ...facts,
  client: { ...facts.client, representativeName: null, trainingDayTo: null },
  organization: { ...facts.organization, fireSafetyTechnicianName: null },
  responsiblePersons: [],
};

describe('the data a draft is compared with', () => {
  for (const set of ['occupational_safety', 'fire_safety'] as const) {
    for (const [label, from] of [
      ['complete facts', facts],
      ['facts with gaps', withGaps],
    ] as const) {
      it(`is, under each name a ${set} document printed, what the whole data holds there, from ${label}`, () => {
        const rules = rulesOf(stored(set, from), {
          issueDate: from.issueDate,
          firstDecisionNumber: from.firstDecisionNumber,
          period: 2026,
        });
        for (const typeKey of documentSetTypeKeys[set]) {
          for (const decisionNumber of [null, 7]) {
            const whole = rules.data(typeKey, decisionNumber);
            for (const name of Object.keys(whole)) {
              const printed = rules.printedData(typeKey, decisionNumber, [name]);
              expect(stableJson(printed[name]), `${typeKey} ${name}`).toBe(stableJson(whole[name]));
            }
            const all = rules.printedData(typeKey, decisionNumber, Object.keys(whole));
            expect(stableJson(all), typeKey).toBe(stableJson(whole));
          }
        }
      });
    }
  }
});
