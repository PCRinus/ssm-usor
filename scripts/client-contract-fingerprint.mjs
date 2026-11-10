import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { parse } from '@typescript-eslint/parser';

// Comments carry the OpenAPI descriptions, so a reworded description must not make every
// open tab reload. A parser finds them, so a `//` inside a string or regex stays code.
export function clientContractFingerprint(path) {
  const source = readFileSync(path, 'utf8');
  const { comments = [] } = parse(source, { comment: true, range: true });
  let code = '';
  let from = 0;
  for (const { range } of comments) {
    code += source.slice(from, range[0]);
    from = range[1];
  }
  code += source.slice(from);
  return createHash('sha256').update(code).digest('hex').slice(0, 16);
}
