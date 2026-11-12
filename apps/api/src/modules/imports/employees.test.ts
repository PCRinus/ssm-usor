import { describe, expect, it } from 'vitest';

import { peopleCounts, personStates } from './employees';

describe('personStates', () => {
  it('reads every person as still to check unless the member checked or set them aside', () => {
    const states = personStates(
      { people: [{ id: 'person-1' }, { id: 'person-2' }, { id: 'person-3' }] },
      {
        people: {
          'person-1': { state: 'checked' },
          'person-3': { state: 'set_aside' },
          'person-9': { state: 'checked' },
        },
        jobTitles: {},
        workplaces: {},
        rows: {},
        pages: {},
      }
    );

    expect(states).toEqual({
      'person-1': 'checked',
      'person-2': 'to_check',
      'person-3': 'set_aside',
    });
    expect(peopleCounts(states)).toEqual({ total: 3, toCheck: 1, checked: 1, setAside: 1 });
  });
});
