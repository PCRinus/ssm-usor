import { describe, expect, it } from 'vitest';

import {
  documentSetGroups,
  documentSetOf,
  documentSetQuerySchema,
  documentSets,
  documentSetTypeKeys,
  fireSafetyDocumentTypeKeys,
  generateDocumentsRequestSchema,
} from './documents';

describe('documentSetOf', () => {
  it.each(documentSets)('places every built-in type of the %s set in it', (set) => {
    expect(documentSetTypeKeys[set].map(documentSetOf)).toEqual(
      documentSetTypeKeys[set].map(() => set)
    );
  });

  it('places a type no list names by its prefix', () => {
    expect(documentSetOf('fire_smoking_decision')).toBe('fire_safety');
    expect(documentSetOf('provider_own_form')).toBe('occupational_safety');
  });
});

describe('the sets', () => {
  it('share no type key', () => {
    const occupational = new Set<string>(documentSetTypeKeys.occupational_safety);
    expect(fireSafetyDocumentTypeKeys.filter((key) => occupational.has(key))).toEqual([]);
  });

  it('each have a group of their own', () => {
    expect(new Set(Object.values(documentSetGroups)).size).toBe(documentSets.length);
  });

  it('default to the occupational safety one when a request names none', () => {
    expect(documentSetQuerySchema.parse({})).toEqual({ set: 'occupational_safety' });
    expect(documentSetQuerySchema.parse({ set: 'fire_safety' })).toEqual({ set: 'fire_safety' });
    expect(documentSetQuerySchema.safeParse({ set: 'other' }).success).toBe(false);
  });
});

describe('generateDocumentsRequestSchema', () => {
  it('needs only the issue date', () => {
    expect(generateDocumentsRequestSchema.parse({ issueDate: '2026-10-06' })).toEqual({
      issueDate: '2026-10-06',
      firstDecisionNumber: 1,
    });
  });
});
