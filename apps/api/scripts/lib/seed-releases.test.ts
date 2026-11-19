import { releaseSchema } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { parseReleaseBody } from '../../../../packages/release-notes/src/parse';
import { bucharestTag, inventedReleases } from './seed-releases';

describe('bucharestTag', () => {
  it('takes the day in Bucharest, not in UTC', () => {
    expect(bucharestTag(new Date('2026-10-23T22:30:00Z'))).toBe('2026.10.24');
    expect(bucharestTag(new Date('2026-10-23T20:30:00Z'))).toBe('2026.10.23');
  });
});

describe('inventedReleases', () => {
  const now = new Date('2026-10-24T09:00:00Z');
  const rows = inventedReleases(now, new Date('2026-09-17T12:00:00Z'));

  it('dates two releases today and two in the past, newest first', () => {
    expect(rows.map((row) => [row.tag, row.published_at])).toEqual([
      ['2026.10.24.2', '2026-10-24T09:00:00.000Z'],
      ['2026.10.24', '2026-10-24T08:59:50.000Z'],
      ['2026.10.21', '2026-10-21T09:00:00.000Z'],
      ['2026.10.10', '2026-10-10T09:00:00.000Z'],
    ]);
  });

  it('publishes the two of today after an admin profile created moments ago', () => {
    const fresh = inventedReleases(now, new Date('2026-10-24T08:59:58Z'));
    expect(fresh.slice(0, 2).map((row) => [row.tag, row.published_at])).toEqual([
      ['2026.10.24.2', '2026-10-24T09:00:00.000Z'],
      ['2026.10.24', '2026-10-24T08:59:59.000Z'],
    ]);

    const later = inventedReleases(now, new Date('2026-10-24T09:00:00Z'));
    expect(later.slice(0, 2).map((row) => row.published_at)).toEqual([
      '2026-10-24T09:00:02.000Z',
      '2026-10-24T09:00:01.000Z',
    ]);
  });

  it('fits the release contract', () => {
    for (const row of rows) {
      expect(() =>
        releaseSchema.parse({
          tag: row.tag,
          publishedAt: row.published_at,
          headline: row.headline,
          lead: row.lead,
          features: row.features,
          improvements: row.improvements,
          fixes: row.fixes,
          unread: false,
        })
      ).not.toThrow();
    }
  });

  it('writes the body in the dialect, leaving out empty sections', () => {
    for (const row of rows) {
      expect(parseReleaseBody(row.body), row.tag).toEqual({
        kind: 'update',
        update: {
          headline: row.headline,
          lead: row.lead,
          features: row.features,
          improvements: row.improvements,
          fixes: row.fixes,
        },
        source: expect.any(String),
      });
    }
    expect(rows[2]!.body).not.toContain('## Ce e nou');
    expect(rows[2]!.body).toContain('## Remedieri\n- Arhiva setului');
  });
});
