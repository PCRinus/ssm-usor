import { expect, it } from 'vitest';

import { buildDocumentContext, stableJson } from './context';
import { facts } from './context.fixture';

it('builds the same merge data for the fixture client', async () => {
  const context = buildDocumentContext(facts);
  await expect(`${JSON.stringify(JSON.parse(stableJson(context)), null, 2)}\n`).toMatchFileSnapshot(
    './context.snapshot.json'
  );
});
