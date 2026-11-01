import { releaseSchema } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { updateLimits } from './limits';
import { parsePullRequestBlock, parseReleaseBody } from './parse';

const text = (...lines: string[]) => lines.join('\n');
const ofLength = (length: number) => 'ă'.repeat(length);

function body(over: Partial<Record<keyof typeof updateLimits, number>> = {}) {
  const length = (key: keyof typeof updateLimits) => updateLimits[key] + (over[key] ?? 0);
  return text(
    `# ${ofLength(length('headline'))}`,
    ofLength(length('lead')),
    '',
    '## Ce e nou',
    `### ${ofLength(length('featureTitle'))}`,
    ofLength(length('featureText')),
    `Unde o găsești: ${ofLength(length('featureWhere'))}`,
    'Pictogramă: camera',
    '',
    '---'
  );
}

describe('update limits', () => {
  it('accepts an update at every limit, and the API returns it as a release', () => {
    const parsed = parseReleaseBody(body());
    if (parsed.kind !== 'update') throw new Error(`Expected an update, got ${parsed.kind}`);

    const release = releaseSchema.safeParse({
      ...parsed.update,
      tag: '2026.11.01',
      publishedAt: '2026-11-01T00:00:00.000Z',
      unread: true,
    });
    expect(release.error?.issues).toBeUndefined();
  });

  it.each([
    ['headline', 1, 'The headline is 161 characters long; the most is 160.'],
    ['lead', 2, 'The lead is 602 characters long; the most is 600.'],
    ['featureTitle', 5, 'is 165 characters long; the most is 160.'],
    ['featureText', 1, 'is 1201 characters long; the most is 1200.'],
    ['featureWhere', 1, 'is 201 characters long; the most is 200.'],
  ] as const)('rejects a %s over its limit, naming its line', (key, extra, message) => {
    const parsed = parseReleaseBody(body({ [key]: extra }));
    expect(parsed.kind).toBe('invalid');
    if (parsed.kind !== 'invalid') return;
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]!.message).toContain(message);
    expect(parsed.errors[0]!.line).toBe(key === 'headline' ? 1 : key === 'lead' ? 2 : 5);
  });

  it('holds a pull request block to the feature limits', () => {
    const parsed = parsePullRequestBlock(
      text('## Actualizări', '## Ce e nou', '### Titlu', ofLength(updateLimits.featureText + 1))
    );
    expect(parsed).toEqual({
      kind: 'invalid',
      errors: [
        { line: 3, message: 'The text of "Titlu" is 1201 characters long; the most is 1200.' },
      ],
    });
  });
});
