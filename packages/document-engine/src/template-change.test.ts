import { describe, expect, it } from 'vitest';

import { nextTemplateChange, type TemplateChange, templateChangeProblems } from './template-change';

const roadCode = { act: 'oug-195-2002', consolidatedOn: '2026-11-06' };
const safetyLaw = { act: 'lege-319-2006', consolidatedOn: '2026-10-01' };
const legal: TemplateChange = {
  kind: 'legal',
  note: 'Casca se poartă pe cap.',
  resolves: roadCode,
};

describe("a template version's change", () => {
  it('replaces the change of the last release, which production registered', () => {
    const released: TemplateChange = { kind: 'correction', note: 'Corecturi de limbă.' };
    expect(nextTemplateChange(released, released, legal)).toEqual(legal);
  });

  it('joins a change not released yet: notes in order, the stronger kind, every act resolved', () => {
    const pending: TemplateChange = {
      kind: 'legal',
      note: 'Instruirea anuală.',
      resolves: safetyLaw,
    };
    expect(
      nextTemplateChange(pending, { kind: 'correction', note: 'Corecturi de limbă.' }, legal)
    ).toEqual({
      kind: 'legal',
      note: 'Instruirea anuală; Casca se poartă pe cap.',
      resolves: [safetyLaw, roadCode],
    });
    expect(
      nextTemplateChange({ kind: 'layout', note: 'Tabel pe o pagină.' }, undefined, {
        kind: 'correction',
        note: 'Diacritice.',
      })
    ).toEqual({ kind: 'correction', note: 'Tabel pe o pagină; Diacritice.' });
    expect(
      nextTemplateChange({ kind: 'legal', note: 'Casca.', resolves: roadCode }, undefined, {
        kind: 'layout',
        note: 'Tabel.',
      })
    ).toEqual({ kind: 'legal', note: 'Casca; Tabel.', resolves: roadCode });
  });

  it('does not take the same change twice, as when a fix runs again', () => {
    const pending = nextTemplateChange(
      { kind: 'correction', note: 'Diacritice.' },
      undefined,
      legal
    );
    expect(nextTemplateChange(pending, undefined, legal)).toEqual(pending);
  });

  it('may resolve several changes of acts, each of an act on the list', () => {
    const acts = new Set(['oug-195-2002', 'lege-319-2006']);
    expect(templateChangeProblems({ ...legal, resolves: [roadCode, safetyLaw] }, acts)).toEqual([]);
    expect(templateChangeProblems({ ...legal, resolves: [] }, acts)).toEqual([
      'resolves lists no change',
    ]);
    expect(
      templateChangeProblems({ kind: 'correction', note: 'Notă.', resolves: roadCode }, acts)
    ).toEqual(['only a legal change resolves a change of an act']);
  });
});
