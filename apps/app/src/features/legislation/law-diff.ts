import { diff, tokenize } from '@ssm-usor/document-engine/token-diff';

export type DiffSegment = { kind: 'same' | 'deleted' | 'inserted'; text: string };

const space = /^\s+$/;
const leading = (text: string) => /^\s*/.exec(text)![0];
const trailing = (text: string) => /\s*$/.exec(text)![0];

export function wordDiff(before: string, after: string): DiffSegment[] {
  const segments: DiffSegment[] = [];
  const push = (kind: DiffSegment['kind'], text: string) => {
    if (!text) return;
    const last = segments.at(-1);
    if (last?.kind === kind) last.text += text;
    else segments.push({ kind, text });
  };
  const pushSame = (text: string) => {
    const last = segments.at(-1);
    // A changed run hands its edge spacing to the text beside it, which may bring its own.
    push('same', last?.kind === 'same' && /\s$/.test(last.text) ? text.trimStart() : text);
  };

  let deleted = '';
  let inserted = '';
  let held = '';
  const flush = () => {
    if (!deleted && !inserted) return;
    const edges = inserted || deleted;
    pushSame(leading(edges));
    push('deleted', deleted.trim());
    if (deleted.trim() && inserted.trim()) push('same', ' ');
    push('inserted', inserted.trim());
    pushSame(trailing(edges));
    deleted = '';
    inserted = '';
  };

  for (const op of diff(tokenize(before), tokenize(after))) {
    if (op.kind === 'equal') {
      // Spacing between two changed words joins them, so a phrase reads as one change.
      if ((deleted || inserted) && space.test(op.after)) {
        held += op.after;
        continue;
      }
      flush();
      pushSame(held + op.after);
      held = '';
      continue;
    }
    deleted += held;
    inserted += held;
    held = '';
    if (op.kind === 'delete') deleted += op.before;
    else inserted += op.after;
  }
  flush();
  pushSame(held);
  return segments;
}
