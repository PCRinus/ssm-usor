import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

// The sweep's Python runs in the converter's image, outside this package's tests; its pure part
// has unit tests of its own.
it('passes the unit tests of the import tools', () => {
  const tools = fileURLToPath(new URL('../../tools/import/', import.meta.url));
  expect(() =>
    execFileSync('python3', ['-m', 'unittest', 'discover', '-s', tools, '-p', 'test_*.py'], {
      cwd: tools,
      stdio: 'pipe',
    })
  ).not.toThrow();
});
