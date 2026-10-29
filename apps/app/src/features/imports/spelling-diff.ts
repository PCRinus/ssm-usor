export type DiffRun = { text: string; changed: boolean };

type Op = { value: string; written: string; same: boolean };

export const diffTokens = (text: string) =>
  text.match(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu) ?? [];

const isSeparator = (token: string) => /^[^\p{L}\p{M}\p{N}]+$/u.test(token);

function alignedOps(value: string[], written: string[]): Op[] {
  let start = 0;
  while (start < value.length && start < written.length && value[start] === written[start]) start++;
  let end = 0;
  while (
    end < value.length - start &&
    end < written.length - start &&
    value[value.length - 1 - end] === written[written.length - 1 - end]
  ) {
    end++;
  }
  const a = value.slice(start, value.length - end);
  const b = written.slice(start, written.length - end);

  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }

  const ops: Op[] = value
    .slice(0, start)
    .map((token) => ({ value: token, written: token, same: true }));
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ value: a[i]!, written: b[j]!, same: true });
      i++;
      j++;
    } else if (
      j < b.length &&
      (i === a.length || lcs[i * width + j + 1]! >= lcs[(i + 1) * width + j]!)
    ) {
      ops.push({ value: '', written: b[j]!, same: false });
      j++;
    } else {
      ops.push({ value: a[i]!, written: '', same: false });
      i++;
    }
  }
  for (const token of value.slice(value.length - end)) {
    ops.push({ value: token, written: token, same: true });
  }
  return ops;
}

// A value whose every word changed reads as one marked span, not as words with gaps.
function joinChangedWords(ops: Op[]): Op[] {
  return ops.map((op, index) =>
    op.same &&
    isSeparator(op.value) &&
    ops[index - 1]?.same === false &&
    ops[index + 1]?.same === false
      ? { ...op, same: false }
      : op
  );
}

function runs(ops: Op[], side: 'value' | 'written'): DiffRun[] {
  const result: DiffRun[] = [];
  for (const op of ops) {
    const text = op[side];
    if (!text) continue;
    const last = result.at(-1);
    if (last && last.changed === !op.same) last.text += text;
    else result.push({ text, changed: !op.same });
  }
  return result;
}

export function spellingDiff(value: string, written: string) {
  const ops = joinChangedWords(alignedOps(diffTokens(value), diffTokens(written)));
  return { value: runs(ops, 'value'), written: runs(ops, 'written') };
}
