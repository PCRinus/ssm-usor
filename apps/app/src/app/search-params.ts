import { defaultStringifySearch } from '@tanstack/react-router';

type Primitive = string | number | boolean;

const isPrimitive = (value: unknown): value is Primitive =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

// TanStack writes an array as URL-encoded JSON (`documentation=%5B%22none%22%5D`). A repeated
// key reads like any other link (`documentation=none&documentation=issued`), and the default
// parser already turns a repeated key back into an array.
export function stringifySearch(search: Record<string, unknown>) {
  const scalars: Record<string, unknown> = {};
  const lists: [string, Primitive[]][] = [];
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value) && value.every(isPrimitive)) lists.push([key, value]);
    else scalars[key] = value;
  }
  const params = new URLSearchParams(defaultStringifySearch(scalars));
  for (const [key, list] of lists) {
    for (const item of list) params.append(key, String(item));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
