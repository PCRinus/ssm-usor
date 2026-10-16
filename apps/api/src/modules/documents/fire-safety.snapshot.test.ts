import { expect, it } from 'vitest';

import { stableJson } from './context';
import { facts } from './context.fixture';
import { buildFireSafetyContext } from './fire-safety';

it('builds the same fire-safety merge data for the fixture client', async () => {
  const context = buildFireSafetyContext({
    ...facts,
    issueDate: '2026-01-19',
    period: 2026,
    firstDecisionNumber: 5,
    branding: true,
  });
  await expect(`${JSON.stringify(JSON.parse(stableJson(context)), null, 2)}\n`).toMatchFileSnapshot(
    './fire-safety.snapshot.json'
  );
});
