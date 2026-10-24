import { describe, expect, it } from 'vitest';

import { staleArticles, stepSummary, warningAnnotation } from './lib/sources';

const angajati = {
  file: 'apps/help/src/content/docs/clienti/angajati/index.md',
  sources: [
    'docs/architecture/adr-021-training-records-and-individual-sheets.md',
    'supabase/migrations/*employee_training_status*',
    'packages/contracts/src/employees.ts',
  ],
};
const posturi = {
  file: 'apps/help/src/content/docs/clienti/posturi/index.md',
  sources: ['apps/app/src/features/positions/**'],
};

describe('staleArticles', () => {
  it('names an article whose source changed while the article did not', () => {
    expect(
      staleArticles(
        [angajati, posturi],
        ['supabase/migrations/20261024_employee_training_status.sql', 'README.md']
      )
    ).toEqual([
      {
        file: angajati.file,
        changedSources: ['supabase/migrations/20261024_employee_training_status.sql'],
      },
    ]);
  });

  it('matches globs across directories', () => {
    expect(
      staleArticles([posturi], ['apps/app/src/features/positions/dialogs/position-form.tsx'])
    ).toHaveLength(1);
  });

  it('leaves out an article changed in the same pull request', () => {
    expect(
      staleArticles([angajati], ['packages/contracts/src/employees.ts', angajati.file])
    ).toEqual([]);
  });

  it('names nothing when no source changed', () => {
    expect(staleArticles([angajati, posturi], ['apps/api/src/index.ts'])).toEqual([]);
  });
});

describe('reporting', () => {
  const stale = { file: angajati.file, changedSources: ['packages/contracts/src/employees.ts'] };

  it('annotates the article as a warning', () => {
    expect(warningAnnotation(stale)).toMatch(
      /^::warning file=apps\/help\/src\/content\/docs\/clienti\/angajati\/index\.md,title=[^:]+::.*packages\/contracts\/src\/employees\.ts/
    );
  });

  it('lists each article and its changed sources in the summary', () => {
    expect(stepSummary([stale])).toContain(
      '- `apps/help/src/content/docs/clienti/angajati/index.md`: `packages/contracts/src/employees.ts`'
    );
    expect(stepSummary([])).toBe('');
  });
});
