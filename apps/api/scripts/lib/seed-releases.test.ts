import { releaseSchema } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { bucharestTag, inventedReleases } from './seed-releases';

describe('bucharestTag', () => {
  it('takes the day in Bucharest, not in UTC', () => {
    expect(bucharestTag(new Date('2026-10-23T22:30:00Z'))).toBe('2026.10.24');
    expect(bucharestTag(new Date('2026-10-23T20:30:00Z'))).toBe('2026.10.23');
  });
});

describe('inventedReleases', () => {
  const now = new Date('2026-10-24T09:00:00Z');
  const rows = inventedReleases(now);

  it('dates two releases today and two in the past, newest first', () => {
    expect(rows.map((row) => [row.tag, row.published_at])).toEqual([
      ['2026.10.24.2', '2026-10-24T09:00:00.000Z'],
      ['2026.10.24', '2026-10-24T08:59:50.000Z'],
      ['2026.10.21', '2026-10-21T09:00:00.000Z'],
      ['2026.10.10', '2026-10-10T09:00:00.000Z'],
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
    expect(rows[3]!.body).toBe(
      [
        '# Prima versiune publică',
        'SSM Ușor se deschide pentru primii clienți: documentația SSM și PSI, semnătura electronică avansată și portalul participanților.',
        '',
        '## Ce e nou',
        '### Documentația SSM și PSI, generată din datele clientului',
        'Cele 23 de documente ale celor două seturi se generează din posturi, angajați și instruiri, și se emit ca PDF.',
        'Unde o găsești: Client, fila Documente',
        'Pictogramă: files',
        '### Semnătură electronică avansată',
        'Fișele individuale se semnează din portal, cu certificat per participant, fără hârtie.',
        'Unde o găsești: Semnături',
        'Pictogramă: pen-line',
        '',
      ].join('\n')
    );
    expect(rows[2]!.body).not.toContain('## Ce e nou');
    expect(rows[2]!.body).toContain('## Remedieri\n- Arhiva setului');
  });
});
