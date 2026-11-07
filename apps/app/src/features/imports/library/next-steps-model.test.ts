import { describe, expect, it } from 'vitest';

import { deadlineLine, foundSentence, importOutcome, takenSentence } from './next-steps-model';

const expiresAt = '2026-11-19T10:00:00.000Z';
const at = (iso: string) => Date.parse(iso);

describe('the deadline of the parts left to confirm', () => {
  it('counts the calendar days to the last one', () => {
    expect(deadlineLine(expiresAt, at('2026-11-05T12:00:00Z'))).toBe(
      'Până pe 19 noiembrie · mai ai 14 zile'
    );
    expect(deadlineLine(expiresAt, at('2026-10-29T12:00:00Z'))).toBe(
      'Până pe 19 noiembrie · mai ai 21 de zile'
    );
  });

  it('says one day on the day before, and today on the day itself', () => {
    expect(deadlineLine(expiresAt, at('2026-11-18T12:00:00Z'))).toBe(
      'Până pe 19 noiembrie · mai ai o zi'
    );
    expect(deadlineLine(expiresAt, at('2026-11-19T08:00:00Z'))).toBe(
      'Până pe 19 noiembrie · expiră azi'
    );
  });
});

describe('what the confirmed import says it took', () => {
  it('names the client data and the kinds confirmed', () => {
    expect(
      takenSentence([
        { part: 'instructions_ssm' },
        { part: 'instructions_su' },
        { part: 'risk_evaluations' },
      ])
    ).toBe(
      'Datele clientului, instrucțiunile și evaluările de risc sunt preluate. Poți genera documentația clientului.'
    );
    expect(takenSentence([{ part: 'risk_evaluations' }])).toBe(
      'Datele clientului și evaluările de risc sunt preluate. Poți genera documentația clientului.'
    );
    expect(takenSentence([])).toBe(
      'Datele clientului sunt preluate. Poți genera documentația clientului.'
    );
  });

  it('says what the pack holds that the library lacks, and nothing when it lacks nothing', () => {
    const part = (name: 'instructions_ssm' | 'risk_evaluations', added: number) => ({
      part: name,
      status: 'to_review' as const,
      expiresAt,
      counts: { identical: 2, similar: 0, new: added, unread: 0 },
    });
    expect(foundSentence([part('instructions_ssm', 3), part('risk_evaluations', 2)])).toBe(
      'Am găsit în pachet instrucțiuni și evaluări de risc pe care nu le ai.'
    );
    expect(foundSentence([part('instructions_ssm', 0), part('risk_evaluations', 2)])).toBe(
      'Am găsit în pachet evaluări de risc pe care nu le ai.'
    );
    expect(foundSentence([part('instructions_ssm', 0)])).toBeNull();
  });
});

describe("an import's outcome on the client's page", () => {
  const now = at('2026-11-05T12:00:00Z');

  it('counts the parts left to confirm and gives their deadline', () => {
    expect(
      importOutcome(
        [
          { part: 'instructions_ssm', status: 'to_review', expiresAt },
          { part: 'instructions_su', status: 'confirmed', expiresAt },
          { part: 'risk_evaluations', status: 'reading', expiresAt },
        ],
        now
      )
    ).toEqual({ kind: 'open', label: '2 de verificat, până pe 19 nov.' });
  });

  it('is over when every part is confirmed, or there were none', () => {
    expect(
      importOutcome([{ part: 'risk_evaluations', status: 'confirmed', expiresAt }], now)
    ).toEqual({ kind: 'done', label: 'Încheiat' });
    expect(importOutcome([], now)).toEqual({ kind: 'done', label: 'Încheiat' });
  });

  it('names what expired once nothing is left to confirm', () => {
    const later = at('2026-11-20T12:00:00Z');
    expect(
      importOutcome(
        [
          { part: 'instructions_ssm', status: 'to_review', expiresAt },
          { part: 'risk_evaluations', status: 'confirmed', expiresAt },
        ],
        later
      )
    ).toEqual({ kind: 'expired', label: 'Instrucțiunile au expirat' });
    expect(
      importOutcome([{ part: 'risk_evaluations', status: 'nothing_new', expiresAt }], later)
    ).toEqual({ kind: 'expired', label: 'Evaluările au expirat' });
    expect(
      importOutcome(
        [
          { part: 'instructions_su', status: 'failed', expiresAt },
          { part: 'risk_evaluations', status: 'to_review', expiresAt },
        ],
        later
      )
    ).toEqual({ kind: 'expired', label: 'Instrucțiunile și evaluările au expirat' });
  });
});
