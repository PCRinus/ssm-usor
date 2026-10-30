import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

// OpenAI's strict structured outputs take neither optional nor nullable members, and every
// nullable member and number adds alternatives to the compiled grammar, which then passes its
// size limit ("compiled grammar is too large"). So the model writes "" for unknown, numbers as
// strings, and an enum that may be unknown gains "".
export function flatten(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodNullable) {
    const inner = schema.unwrap() as z.ZodType;
    if (inner instanceof z.ZodEnum) {
      return z.enum([...(inner.options as string[]), ''] as unknown as [string, ...string[]]);
    }
    return flatten(inner);
  }
  if (schema instanceof z.ZodNumber) return z.string();
  if (schema instanceof z.ZodArray) return z.array(flatten(schema.element as z.ZodType));
  if (schema instanceof z.ZodObject) {
    return z.object(
      Object.fromEntries(
        Object.entries(schema.shape as Record<string, z.ZodType>).map(([key, value]) => [
          key,
          flatten(value),
        ])
      )
    );
  }
  if (schema instanceof z.ZodString || schema instanceof z.ZodEnum) return schema;
  if (schema instanceof z.ZodBoolean) return schema;
  throw new Error(`The wire form has no rule for ${schema.constructor.name}.`);
}

function wireNumber(value: unknown, integer: boolean) {
  const match = String(value).match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const number = Number(match[0].replace(',', '.'));
  return integer && !Number.isInteger(number) ? null : number;
}

const monthSchemas = new WeakSet<z.ZodType>();

// A duration in months the model may write in years ("1 an"), which the first number of the
// text would read as one month.
export function months<T extends z.ZodNumber>(schema: T): T {
  monthSchemas.add(schema);
  return schema;
}

const yearWord = /\b(?:ani?|years?)\b/;
// Romanian puts "de" between a number from 20 up and its unit: "24 de luni", "20 de ani".
const years = /^(\d+(?:[.,]\d+)?|un|one)\s+(?:de\s+)?(?:ani?|years?)(?:\s+de\s+zile)?$/;

export const intervalWords: Record<string, number> = {
  lunar: 1,
  trimestrial: 3,
  semestrial: 6,
  anual: 12,
};

const intervalWord = /^(?:periodicitate\s*:?\s*)?(lunar|trimestrial|semestrial|anual)[ae]?$/;

export function wireMonths(value: unknown) {
  const text = String(value)
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[\s.,;:!]+$/, '');
  const word = intervalWord.exec(text)?.[1];
  if (word !== undefined) return intervalWords[word]!;
  if (!yearWord.test(text)) return wireNumber(text, true);
  const match = years.exec(text);
  if (!match) return null;
  const count = /^\d/.test(match[1]!) ? Number(match[1]!.replace(',', '.')) : 1;
  const months = count * 12;
  return Number.isInteger(months) ? months : null;
}

export function restore(schema: z.ZodType, value: unknown): unknown {
  if (schema instanceof z.ZodNullable) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return restore(schema.unwrap() as z.ZodType, value);
  }
  if (schema instanceof z.ZodNumber) {
    if (typeof value === 'number') return value;
    if (monthSchemas.has(schema)) return wireMonths(value);
    return wireNumber(value, schema.format === 'safeint' || schema.format === 'int32');
  }
  if (schema instanceof z.ZodArray) {
    if (!Array.isArray(value)) return value;
    return value.map((element) => restore(schema.element as z.ZodType, element));
  }
  if (schema instanceof z.ZodObject) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(schema.shape as Record<string, z.ZodType>).map(([key, member]) => [
        key,
        restore(member, record[key]),
      ])
    );
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

// Strict mode also wants every property listed as required and no other property allowed,
// at every level.
export function strictJsonSchema(schema: z.ZodType): JsonSchema {
  const tighten = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(tighten);
    if (node === null || typeof node !== 'object') return node;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$schema') continue;
      result[key] = tighten(value);
    }
    if (result.type === 'object' && result.properties) {
      result.required = Object.keys(result.properties as object);
      result.additionalProperties = false;
    }
    return result;
  };
  return tighten(z.toJSONSchema(schema)) as JsonSchema;
}

export interface AnswerFormat<T> {
  name: string;
  jsonSchema: JsonSchema;
  // Throws a ZodError when the answer is outside the schema.
  parse: (answer: unknown) => T;
}

export function answerFormat<S extends z.ZodType, T = z.infer<S>>(
  name: string,
  schema: S,
  then: (value: z.infer<S>) => T = (value) => value as T
): AnswerFormat<T> {
  return {
    name,
    jsonSchema: strictJsonSchema(flatten(schema)),
    parse: (answer) => then(schema.parse(restore(schema, answer))),
  };
}
