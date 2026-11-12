export type DiffOp<T> =
  | { kind: 'equal'; before: T; after: T }
  | { kind: 'delete'; before: T }
  | { kind: 'insert'; after: T };

const tokenPattern = /\s+|[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu;

export function tokenize(text: string): string[] {
  return text.match(tokenPattern) ?? [];
}

export function diff<T>(
  before: readonly T[],
  after: readonly T[],
  same: (before: T, after: T) => boolean = Object.is
): DiffOp<T>[] {
  let start = 0;
  while (start < before.length && start < after.length && same(before[start]!, after[start]!)) {
    start += 1;
  }
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    same(before[before.length - 1 - end]!, after[after.length - 1 - end]!)
  ) {
    end += 1;
  }
  const a = before.slice(start, before.length - end);
  const b = after.slice(start, after.length - end);
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] = same(a[i]!, b[j]!)
        ? lengths[(i + 1) * width + j + 1]! + 1
        : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
  }
  const ops: DiffOp<T>[] = [];
  for (let index = 0; index < start; index += 1) {
    ops.push({ kind: 'equal', before: before[index]!, after: after[index]! });
  }
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && same(a[i]!, b[j]!)) {
      ops.push({ kind: 'equal', before: a[i]!, after: b[j]! });
      i += 1;
      j += 1;
    } else if (
      j < b.length &&
      (i === a.length || lengths[i * width + j + 1]! >= lengths[(i + 1) * width + j]!)
    ) {
      ops.push({ kind: 'insert', after: b[j]! });
      j += 1;
    } else {
      ops.push({ kind: 'delete', before: a[i]! });
      i += 1;
    }
  }
  for (let index = end; index > 0; index -= 1) {
    ops.push({
      kind: 'equal',
      before: before[before.length - index]!,
      after: after[after.length - index]!,
    });
  }
  return ops;
}

export interface Hunk {
  /** Where the replaced characters start and end in the text before. */
  start: number;
  end: number;
  insert: string;
}

export function textHunks(before: string, after: string): Hunk[] {
  const hunks: Hunk[] = [];
  let offset = 0;
  let open: Hunk | null = null;
  for (const op of diff(tokenize(before), tokenize(after))) {
    if (op.kind === 'equal') {
      if (open) hunks.push(open);
      open = null;
      offset += op.before.length;
      continue;
    }
    open ??= { start: offset, end: offset, insert: '' };
    if (op.kind === 'delete') {
      offset += op.before.length;
      open.end = offset;
    } else {
      open.insert += op.after;
    }
  }
  if (open) hunks.push(open);
  return hunks;
}
