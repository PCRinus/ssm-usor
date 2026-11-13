import { diff, type DiffOp, tokenize } from '@ssm-usor/document-engine/token-diff';

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

export function wordDiff(before: string, after: string): DiffSegment[] {
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

  for (const op of diff(tokenize(before), tokenize(after))) {
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
