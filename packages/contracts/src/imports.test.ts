import { describe, expect, it } from 'vitest';

import { employeeImportChangesSchema } from './imports';

describe('employeeImportChangesSchema', () => {
  it('defaults every part to nothing changed', () => {
    expect(employeeImportChangesSchema.parse({})).toEqual({
      people: {},
      jobTitles: {},
      workplaces: {},
      rows: {},
      pages: {},
    });
  });

  it('takes a person’s state, field choices and post, a row’s tick and values, a page’s owner', () => {
    const changes = {
      people: {
        'person-1': {
          state: 'checked',
          included: true,
          fields: { homeAddress: { replace: true }, lastName: { option: 1 } },
          cnpCorrection: true,
          jobPositionId: '00000000-0000-4000-8000-000000000101',
          workplaceId: null,
        },
      },
      jobTitles: { 'title-1': { jobPositionId: '00000000-0000-4000-8000-000000000102' } },
      workplaces: { 'workplace-1': { workplaceId: null } },
      rows: { 'row-3': { included: true, test: false, values: { durationMinutes: 120 } } },
      pages: { 'page-2': { personId: 'person-1' }, 'page-8': { personId: null } },
    };

    expect(employeeImportChangesSchema.parse(changes)).toEqual(changes);
  });

  it('refuses a field the sheets do not have, a state it does not know and an unknown key', () => {
    const refused = [
      { people: { 'person-1': { fields: { salary: { value: 1 } } } } },
      { people: { 'person-1': { state: 'done' } } },
      { rows: { 'row-1': { included: true, hidden: true } } },
      { jobTitles: { 'title-1': { jobPositionId: 'Brutar' } } },
    ];

    for (const changes of refused) {
      expect(employeeImportChangesSchema.safeParse(changes).success).toBe(false);
    }
  });
});
