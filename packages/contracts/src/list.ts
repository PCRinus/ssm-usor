import { z } from 'zod';

// Shared shape of paginated list endpoints: offset pagination with page numbers, one sort
// key at a time from a per-resource whitelist, and a common response envelope.

export const defaultPageSize = 25;
export const maxPageSize = 100;

export const sortOrders = ['asc', 'desc'] as const;
export const sortOrderSchema = z.enum(sortOrders);
export type SortOrder = z.infer<typeof sortOrderSchema>;

// Query parameters arrive as strings; coercion keeps the OpenAPI document numeric.
export function listQuerySchema<const Keys extends readonly [string, ...string[]]>(
  sortKeys: Keys,
  defaultSort: Keys[number]
) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
    sort: z.enum(sortKeys).default(defaultSort),
    order: sortOrderSchema.default('asc'),
  });
}

export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    page: z.int().min(1),
    pageSize: z.int().min(1).max(maxPageSize),
    total: z.int().min(0),
  });
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

// Zero-based inclusive row range for a page, as PostgREST expects it.
export function pageRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function pageCount({ pageSize, total }: PageMeta) {
  return Math.max(1, Math.ceil(total / pageSize));
}

// "1–25 din 120" style bounds for a pager; both are zero when the page is empty.
export function pageBounds({ page, pageSize, total }: PageMeta) {
  if (total === 0) return { first: 0, last: 0 };
  const first = (page - 1) * pageSize + 1;
  return { first, last: Math.min(first + pageSize - 1, total) };
}
