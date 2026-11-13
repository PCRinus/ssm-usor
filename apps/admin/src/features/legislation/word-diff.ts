export type DiffPart =
  { kind: 'same'; text: string } | { kind: 'changed'; deleted: string; inserted: string };

type Op = { kind: 'same' | 'deleted' | 'inserted'; token: string };

const tokenPattern = /\s+|[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu;

// Past this many cells the table outgrows a tab's patience; an article is a few hundred words.
const maxCells = 4_000_000;

function operations(a: string[], b: string[]) {
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        a[i] === b[j]
          ? lengths[(i + 1) * width + j + 1]! + 1
          : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: 'same', token: a[i]! });
      i += 1;
      j += 1;
    } else if (
      j < b.length &&
      (i === a.length || lengths[i * width + j + 1]! >= lengths[(i + 1) * width + j]!)
    ) {
      ops.push({ kind: 'inserted', token: b[j]! });
      j += 1;
    } else {
      ops.push({ kind: 'deleted', token: a[i]! });
      i += 1;
    }
  }
  return ops;
}

function pushSame(parts: DiffPart[], text: string) {
  const last = parts.at(-1);
  if (last?.kind === 'same') last.text += text;
  else parts.push({ kind: 'same', text });
}

const blank = (op: Op | undefined) => op?.kind === 'same' && /^\s+$/.test(op.token);

// A space kept between two changed words is part of the change: "casca" → "pe cap cască" reads
// as one replacement, not as three edits around kept spaces.
export function wordDiff(before: string, after: string): DiffPart[] | null {
  const a = before.match(tokenPattern) ?? [];
  const b = after.match(tokenPattern) ?? [];
  if ((a.length + 1) * (b.length + 1) > maxCells) return null;
  const ops = operations(a, b);
  const parts: DiffPart[] = [];
  let index = 0;
  while (index < ops.length) {
    const op = ops[index]!;
    if (op.kind === 'same') {
      pushSame(parts, op.token);
      index += 1;
      continue;
    }
    let deleted = '';
    let inserted = '';
    const start = index;
    while (index < ops.length) {
      const current = ops[index]!;
      if (current.kind === 'deleted') deleted += current.token;
      else if (current.kind === 'inserted') inserted += current.token;
      else if (blank(current) && ops[index + 1] && ops[index + 1]!.kind !== 'same') {
        deleted += current.token;
        inserted += current.token;
      } else break;
      index += 1;
    }
    const space = (op: Op) => /^\s+$/.test(op.token);
    if (space(ops[start]!)) pushSame(parts, ' ');
    parts.push({ kind: 'changed', deleted: deleted.trim(), inserted: inserted.trim() });
    if (index - 1 > start && space(ops[index - 1]!)) pushSame(parts, ' ');
  }
  return parts;
}
