import { describe, expect, it } from 'vitest';

import { releaseTagSchema, updateFeatureSchema } from './releases';

describe('releaseTagSchema', () => {
  it('takes a day and a later release of that day', () => {
    expect(releaseTagSchema.safeParse('2026.10.23').success).toBe(true);
    expect(releaseTagSchema.safeParse('2026.10.23.10').success).toBe(true);
  });

  it('refuses anything else', () => {
    for (const tag of ['2026-10-23', 'v2026.10.23', '2026.10.23.', '2026.1.23']) {
      expect(releaseTagSchema.safeParse(tag).success).toBe(false);
    }
  });
});

describe('updateFeatureSchema', () => {
  it('takes a lucide name in kebab case only', () => {
    const feature = { title: 'Teste', text: 'Pe telefon.', where: null };
    expect(updateFeatureSchema.safeParse({ ...feature, icon: 'clipboard-check' }).success).toBe(
      true
    );
    expect(updateFeatureSchema.safeParse({ ...feature, icon: 'ClipboardCheck' }).success).toBe(
      false
    );
  });
});
