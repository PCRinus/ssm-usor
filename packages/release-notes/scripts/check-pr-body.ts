import { readFileSync } from 'node:fs';

import { parsePullRequestBlock } from '../src/index.js';
import { fail } from './cli.js';

const result = parsePullRequestBlock(readFileSync(0, 'utf8'));
if (result.kind === 'invalid') {
  fail(
    result.errors.map(
      (error) => `Line ${error.line} of the pull request description: ${error.message}`
    )
  );
}
