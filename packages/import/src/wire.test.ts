import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readingAnswer } from './reading';
import { sortingAnswer } from './sorting';
import { wireAnswer } from './test/fixtures';
import { answerFormat, flatten, minutes, months, restore, strictJsonSchema } from './wire';

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

  it('reads a duration in hours as minutes', () => {
    const duration = minutes(z.int()).nullable();
    const written = {
      '90': 90,
      '90 min': 90,
      '120 minute': 120,
      "45'": 45,
      '8 ore': 480,
      '8 ORE': 480,
      '1h': 60,
      '1 h': 60,
      '1h30': 90,
      '1h 30min': 90,
      '1 oră': 60,
      'o oră': 60,
      '1 oră și 30 de minute': 90,
      '1,5 ore': 90,
      '2 ore (120 min)': 120,
      '1:30': 90,
      '1,3 ore': 78,
      '': null,
      ore: null,
      '1,01 ore': null,
    };

    expect(Object.keys(written).map((value) => restore(duration, value))).toEqual(
      Object.values(written)
    );
    expect(restore(duration, 240)).toBe(240);
  });

  it('reads the intervals training themes write in words', () => {
    const interval = months(z.int()).nullable();

    expect(
      [
        'TRIMESTRIAL',
        'Semestrial',
        'LUNAR',
        'anual',
        'la 3 luni',
        '3 LUNI',
        'PERIODICITATE : TRIMESTRIAL',
        'trimestrială',
        'bianual',
      ].map((value) => restore(interval, value))
    ).toEqual([3, 6, 1, 12, 3, 3, 3, 3, null]);
  });

  it('reads the durations of an answer as the documents write them', () => {
    const written = {
      '24 de luni': 24,
      '36 luni de zile': 36,
      '12 luni.': 12,
      '12 months': 12,
      '18 luni (1,5 ani)': 18,
      '1,5 ani': 18,
      'un an': 12,
      '20 de ani': 240,
      '2 years': 24,
      '1 an (12 luni)': 12,
      '1,3 ani': null,
      '2 pe an': null,
    };
    const answer = wireAnswer();
    const entry = answer.protectiveEquipment[0]!;
    const post = answer.jobPositions[0]!;
    answer.protectiveEquipment = Object.keys(written).map((durationMonths) => ({
      ...entry,
      durationMonths,
    }));
    answer.jobPositions = Object.keys(written).map((trainingIntervalMonths) => ({
      ...post,
      trainingIntervalMonths,
    }));

    const read = readingAnswer.parse(answer);

    expect(read.protectiveEquipment.map((each) => each.durationMonths)).toEqual(
      Object.values(written)
    );
    expect(read.jobPositions.map((each) => each.trainingIntervalMonths)).toEqual(
      Object.values(written)
    );
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
