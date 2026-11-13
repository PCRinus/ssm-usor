import { describe, expect, it } from 'vitest';

import { readingVersion } from './reading-version';

describe('readingVersion', () => {
  it('is the same for every reading the same code does', async () => {
    const first = await readingVersion('client');
    expect(await readingVersion('client')).toEqual(first);
    expect(first).toEqual({
      models: { sorting: 'gpt-6-luna', scanning: 'gpt-6.1-terra', reading: 'gpt-6.1-terra' },
      prompts: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
  });

  it('differs between readers, each with the models of its own steps', async () => {
    const versions = await Promise.all(
      (
        ['client', 'employees', 'instructions_ssm', 'instructions_su', 'risk_evaluations'] as const
      ).map((reader) => readingVersion(reader))
    );
    expect(new Set(versions.map((version) => version.prompts)).size).toBe(5);
    expect(versions.map((version) => version.models)).toEqual([
      { sorting: 'gpt-6-luna', scanning: 'gpt-6.1-terra', reading: 'gpt-6.1-terra' },
      { scanning: 'gpt-6.1-terra', locating: 'gemini-3.1-flash-lite' },
      { instructions: 'gpt-6.1-terra', similarity: 'gpt-6-luna' },
      { instructions: 'gpt-6.1-terra', similarity: 'gpt-6-luna' },
      { risks: 'gpt-6.1-terra' },
    ]);
  });
});
