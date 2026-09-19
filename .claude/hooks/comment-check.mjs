#!/usr/bin/env node
// PostToolUse hook for Write|Edit. When an edit adds comment lines to a source file, it
// hands them back to Claude with the rule from docs/agents/comments.md. It never blocks:
// whether a comment explains a why is a judgement a pattern cannot make.
import { readFileSync } from 'node:fs';
import process from 'node:process';

const slash = /^\s*(\/\/|\/\*|\*\s|\{\/\*|<!--)/;
const hash = /^\s*#(?!!)/;
const styles = {
  ts: slash,
  tsx: slash,
  js: slash,
  mjs: slash,
  cjs: slash,
  astro: slash,
  css: slash,
  sql: /^\s*--/,
  py: hash,
  sh: hash,
  yml: hash,
  yaml: hash,
  toml: hash,
};
const directive =
  /eslint-|@ts-(expect-error|ignore|nocheck)|prettier-ignore|biome-ignore|<reference|istanbul|v8 ignore|@vitest-environment/;

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const { file_path: file = '', content, old_string: before = '', new_string: after } =
  input.tool_input ?? {};
const pattern = styles[file.split('.').pop()];
if (!pattern || /\.gen\.|\/generated\/|node_modules/.test(file)) process.exit(0);

const commentsIn = (text) =>
  text
    .split('\n')
    .filter((line) => pattern.test(line) && !directive.test(line))
    .map((line) => line.trim());

const existing = new Set(commentsIn(before));
const added = commentsIn(after ?? content ?? '').filter((line) => !existing.has(line));
if (added.length === 0) process.exit(0);

const shown = added.slice(0, 12).map((line) => `  ${line.slice(0, 160)}`);
if (added.length > shown.length) shown.push(`  … and ${added.length - shown.length} more`);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: [
        `This edit to ${file} added ${added.length} comment line(s):`,
        ...shown,
        'Rule (docs/agents/comments.md): the code says how; a comment is only for a why the code',
        'cannot carry (external constraint, trap, rejected alternative, security reason, a meaning',
        'the types cannot express). Delete any line above that restates the code, names what a',
        'thing is, narrates steps, or describes the change. Keep the ones that pass, and do not',
        'mention this check to the user.',
      ].join('\n'),
    },
  })
);
