import { describe, expect, it } from 'vitest';

import { otherVersionsLine, templateReason } from './behind-labels';

const kindLabels = {
  legal: 'Modificare legislativă',
  correction: 'Corectură',
  layout: 'Aranjare în pagină',
};

const version = (number: number, kind: 'legal' | 'correction' | 'layout') => ({
  version: number,
  kind,
  note: `Nota ${number}`,
  legalChanges: [],
});

describe('templateReason', () => {
  const versions = [
    version(6, 'layout'),
    version(5, 'correction'),
    version(4, 'correction'),
    version(3, 'legal'),
    version(2, 'legal'),
  ];

  it('names the newest legal version after the document, whatever came after it', () => {
    const found = templateReason(versions, 1);
    expect(found?.reason.version).toBe(3);
    expect(found?.others.map((other) => other.version)).toEqual([2, 4, 5, 6]);
  });

  it('names the newest correction when no legal version is newer than the document', () => {
    expect(templateReason(versions, 3)?.reason.version).toBe(5);
  });

  it('falls back to the newest layout version, and to nothing past the newest version', () => {
    expect(templateReason(versions, 5)).toEqual({ reason: versions[0], others: [] });
    expect(templateReason(versions, 6)).toBeNull();
  });
});

describe('otherVersionsLine', () => {
  it('names each other version with its kind, or nothing when there is none', () => {
    expect(otherVersionsLine([], kindLabels)).toBeNull();
    expect(otherVersionsLine([version(4, 'layout')], kindLabels)).toBe(
      'Regenerarea aduce și versiunea 4 (aranjare în pagină).'
    );
    expect(
      otherVersionsLine(
        [version(2, 'legal'), version(4, 'correction'), version(6, 'layout')],
        kindLabels
      )
    ).toBe(
      'Regenerarea aduce și versiunile 2 (modificare legislativă), 4 (corectură) și 6 (aranjare în pagină).'
    );
    expect(otherVersionsLine([version(4, 'layout')], kindLabels, true)).toBe(
      'La clientul cel mai în urmă, regenerarea aduce și versiunea 4 (aranjare în pagină).'
    );
  });
});
