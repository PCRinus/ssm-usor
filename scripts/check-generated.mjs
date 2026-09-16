import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const paths = ['apps/api/openapi.json', 'apps/app/src/api/generated'];
function snapshot() {
  const files = new Map();
  function visit(path) {
    if (!existsSync(path)) return;
    if (path.endsWith('.json') || path.endsWith('.ts')) {
      files.set(path, createHash('sha256').update(readFileSync(path)).digest('hex'));
      return;
    }
    for (const entry of readdirSync(path).sort()) visit(join(path, entry));
  }
  paths.forEach(visit);
  return files;
}

const before = snapshot();
execFileSync('pnpm', ['generate:api'], { stdio: 'inherit' });
const after = snapshot();
const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
  (path) => before.get(path) !== after.get(path)
);
if (changed.length) {
  console.error(
    `Generated API files were stale:\n${changed.join('\n')}\nReview and commit the regenerated files.`
  );
  process.exitCode = 1;
}
