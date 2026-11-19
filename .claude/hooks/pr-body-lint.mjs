#!/usr/bin/env node
// PreToolUse hook for Bash. A broken "## Actualizări" block stops the release at the
// publishing step, long after the pull request merged, so `gh pr create` and `gh pr edit`
// are denied here when the block they carry does not parse. A body this hook cannot read
// out of the command (a pipe, an unreadable file) is let through.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const command = input.tool_input?.command ?? '';
if (!/(^|[;&|(])\s*(\w+=\S*\s+)*gh\s+pr\s+(create|edit)\b/m.test(command)) process.exit(0);

function bodyOf(text) {
  const file = text.match(/(?:--body-file|-F)[ =]+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (file) {
    const path = file[1] ?? file[2] ?? file[3];
    if (path === '-') return null;
    const absolute = resolve(process.cwd(), path);
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
  }
  const heredoc = text.match(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2\s*(?:\n|\)|$)/);
  if (heredoc) return heredoc[3];
  const quoted = text.match(/(?:--body|-b)[ =]+(?:"((?:[^"\\]|\\[\s\S])*)"|'([^']*)')/);
  if (quoted) return quoted[1] ?? quoted[2];
  return null;
}

const body = bodyOf(command);
if (body === null || !/^## Actualiz/m.test(body)) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
try {
  execFileSync('node', ['--import', 'tsx', 'scripts/check-pr-body.ts'], {
    cwd: join(projectDir, 'packages/release-notes'),
    input: body,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 20_000,
  });
} catch (error) {
  const problems = String(error.stderr ?? '');
  if (!problems.includes('of the pull request description')) process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `The "## Actualizări" block does not parse, which would stop the release (ADR 026):\n${problems.trim()}`,
      },
    })
  );
}
