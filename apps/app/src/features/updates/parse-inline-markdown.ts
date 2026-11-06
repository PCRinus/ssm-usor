export type InlineNode =
  string | { mark: 'strong' | 'em'; children: InlineNode[] } | { mark: 'code'; text: string };

const escapable = /[!-/:-@[-`{-~]/;
const wordCharacter = /[\p{L}\p{N}]/u;
const space = /\s/u;

function runLength(text: string, at: number, character: string) {
  let end = at;
  while (text[end] === character) end += 1;
  return end - at;
}

// The flanking rules of CommonMark, reduced: `2 * 3 * 4` and `snake_case` stay as typed.
function canOpen(text: string, at: number, length: number) {
  const next = text[at + length];
  if (next === undefined || space.test(next)) return false;
  return text[at] !== '_' || !wordCharacter.test(text[at - 1] ?? '');
}

function canClose(text: string, at: number, length: number) {
  const previous = text[at - 1];
  if (previous === undefined || space.test(previous)) return false;
  return text[at] !== '_' || !wordCharacter.test(text[at + length] ?? '');
}

function codeEnd(text: string, at: number, end: number) {
  const length = runLength(text, at, '`');
  let k = at + length;
  while (k < end) {
    if (text[k] === '`') {
      const closing = runLength(text, k, '`');
      if (closing === length) return { close: k, length };
      k += closing;
    } else {
      k += 1;
    }
  }
  return { close: -1, length };
}

function findCloser(text: string, from: number, end: number, character: string, length: number) {
  let k = from;
  while (k < end) {
    const current = text[k];
    if (current === '\\') {
      k += 2;
    } else if (current === '`') {
      const code = codeEnd(text, k, end);
      k = code.close === -1 ? k + code.length : code.close + code.length;
    } else if (current === character) {
      const run = runLength(text, k, character);
      const fits = length === 2 ? run >= 2 : run === 1;
      if (fits && k > from && canClose(text, k, length)) return k;
      k += run;
    } else {
      k += 1;
    }
  }
  return -1;
}

function parse(text: string, start: number, end: number): InlineNode[] {
  const nodes: InlineNode[] = [];
  let plain = '';
  const flush = () => {
    if (plain !== '') nodes.push(plain);
    plain = '';
  };

  let i = start;
  while (i < end) {
    const current = text[i]!;
    if (current === '\\' && i + 1 < end && escapable.test(text[i + 1]!)) {
      plain += text[i + 1];
      i += 2;
      continue;
    }
    if (current === '`') {
      const { close, length } = codeEnd(text, i, end);
      if (close === -1) {
        plain += '`'.repeat(length);
        i += length;
        continue;
      }
      let code = text.slice(i + length, close);
      if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') {
        code = code.slice(1, -1);
      }
      flush();
      nodes.push({ mark: 'code', text: code });
      i = close + length;
      continue;
    }
    if (current === '*' || current === '_') {
      const run = runLength(text, i, current);
      const length = run >= 2 ? 2 : 1;
      if (canOpen(text, i, length)) {
        const close = findCloser(text, i + length, end, current, length);
        if (close !== -1) {
          flush();
          nodes.push({
            mark: length === 2 ? 'strong' : 'em',
            children: parse(text, i + length, close),
          });
          i = close + length;
          continue;
        }
      }
      plain += current.repeat(run);
      i += run;
      continue;
    }
    plain += current;
    i += 1;
  }
  flush();
  return nodes;
}

export function parseInlineMarkdown(text: string): InlineNode[] {
  return parse(text, 0, text.length);
}
