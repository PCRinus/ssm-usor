import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readingAnswer } from './reading';
import { sortingAnswer } from './sorting';
import { answerFormat, flatten, months, restore, strictJsonSchema } from './wire';

function visit(node: unknown, each: (node: Record<string, unknown>) => void) {
  if (Array.isArray(node)) node.forEach((child) => visit(child, each));
  else if (node !== null && typeof node === 'object') {
    each(node as Record<string, unknown>);
    Object.values(node).forEach((child) => visit(child, each));
  }
}

describe('the wire form', () => {
  const schema = z.object({
    name: z.string(),
    count: z.int().nullable(),
    kind: z.enum(['a', 'b']).nullable(),
    items: z.array(z.object({ note: z.string().nullable(), done: z.boolean() })),
  });

  it('has no nullable members, numbers as strings and "" for an unknown enum', () => {
    const json = strictJsonSchema(flatten(schema));

    expect(json).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'string' },
        kind: { type: 'string', enum: ['a', 'b', ''] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { note: { type: 'string' }, done: { type: 'boolean' } },
            required: ['note', 'done'],
            additionalProperties: false,
          },
        },
      },
      required: ['name', 'count', 'kind', 'items'],
      additionalProperties: false,
    });
  });

  it('restores nulls and numbers before validating', () => {
    const format = answerFormat('test', schema);

    expect(
      format.parse({
        name: ' Brutar ',
        count: '12 buc.',
        kind: '',
        items: [{ note: ' ', done: true }],
      })
    ).toEqual({ name: 'Brutar', count: 12, kind: null, items: [{ note: null, done: true }] });
    expect(restore(z.int().nullable(), '2,5')).toBeNull();
  });

  it('reads a duration in years as months, and any other text as unknown', () => {
    const duration = months(z.int()).nullable();

    expect(
      ['6', '1 an', '2 ani', '3 ANI', '12 luni', '', '-', 'până la uzură', '1-2 ani', 9].map(
        (value) => restore(duration, value)
      )
    ).toEqual([6, 12, 24, 36, 12, null, null, null, null, 9]);
    expect(restore(z.int().nullable(), '1 an')).toBe(1);
  });

  it('refuses an answer outside the schema', () => {
    const format = answerFormat('test', schema);

    expect(() => format.parse({ name: 'x', count: '', kind: 'c', items: [] })).toThrow(z.ZodError);
  });

  it('keeps the strict rules at every level of the real answers', () => {
    for (const format of [readingAnswer, sortingAnswer]) {
      visit(format.jsonSchema, (node) => {
        expect(node.anyOf).toBeUndefined();
        expect(node.type).not.toBe('null');
        expect(node.type).not.toBe('number');
        expect(node.type).not.toBe('integer');
        if (node.type === 'object') {
          expect(node.additionalProperties).toBe(false);
          expect(node.required).toEqual(Object.keys(node.properties as object));
        }
      });
      expect(format.jsonSchema.$schema).toBeUndefined();
    }
  });
});
