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

export type DiffSegment = { kind: 'same' | 'deleted' | 'inserted'; text: string };

const space = /^\s+$/;
const leading = (text: string) => /^\s*/.exec(text)![0];
const trailing = (text: string) => /\s*$/.exec(text)![0];

function commonPrefix(a: string, b: string) {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return a.slice(0, length);
}

function commonSuffix(a: string, b: string) {
  let length = 0;
  while (length < a.length && length < b.length && a.at(-1 - length) === b.at(-1 - length)) {
    length += 1;
  }
  return length === 0 ? '' : a.slice(-length);
}

export function wordDiff(before: string, after: string): DiffSegment[];
export function wordDiff(
  before: string,
  after: string,
  options: { maxCells: number }
): DiffSegment[] | null;
export function wordDiff(
  before: string,
  after: string,
  { maxCells = Infinity }: { maxCells?: number } = {}
): DiffSegment[] | null {
  const a = tokenize(before);
  const b = tokenize(after);
  if ((a.length + 1) * (b.length + 1) > maxCells) return null;

  const segments: DiffSegment[] = [];
  const push = (kind: DiffSegment['kind'], text: string) => {
    if (!text) return;
    const last = segments.at(-1);
    if (last?.kind === kind) last.text += text;
    else segments.push({ kind, text });
  };

  let deleted = '';
  let inserted = '';
  let held = '';
  let run: DiffOp<string>[] = [];
  const flush = () => {
    if (!deleted && !inserted) return;
    const before = deleted && inserted ? commonPrefix(leading(deleted), leading(inserted)) : '';
    const after =
      deleted && inserted
        ? commonSuffix(
            trailing(deleted.slice(before.length)),
            trailing(inserted.slice(before.length))
          )
        : '';
    const gone = deleted.slice(before.length, deleted.length - after.length);
    const added = inserted.slice(before.length, inserted.length - after.length);
    // Joined spacing that leaves one side as bare spacing would mark a change that is not one.
    if ((gone && !gone.trim()) || (added && !added.trim())) {
      for (const op of run) {
        if (op.kind === 'equal') push('same', op.after);
        else if (op.kind === 'delete') push('deleted', op.before);
        else push('inserted', op.after);
      }
    } else {
      push('same', before);
      push('deleted', gone);
      push('inserted', added);
      push('same', after);
    }
    deleted = '';
    inserted = '';
    run = [];
  };

  for (const op of diff(a, b)) {
    if (op.kind === 'equal') {
      // Spacing between two changed words joins them, so a phrase reads as one change.
      if ((deleted || inserted) && space.test(op.after)) {
        held += op.after;
        continue;
      }
      flush();
      push('same', held + op.after);
      held = '';
      continue;
    }
    deleted += held;
    inserted += held;
    if (held) run.push({ kind: 'equal', before: held, after: held });
    held = '';
    run.push(op);
    if (op.kind === 'delete') deleted += op.before;
    else inserted += op.after;
  }
  flush();
  push('same', held);
  return segments;
}
