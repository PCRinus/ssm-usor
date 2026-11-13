import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LineChange } from './messages';

export interface IndexedQuote {
  manifest: string;
  file: string;
  paragraph: number;
  lastParagraph: number;
  form: 'quote' | 'reference';
  act: string;
  locator: string | null;
  text: string | null;
}

interface ManifestEntry {
  file: string;
  title: string;
  change: {
    resolves?: { act: string; consolidatedOn: string } | { act: string; consolidatedOn: string }[];
  };
}

export interface Templates {
  citations(): IndexedQuote[];
  read(file: string): Uint8Array;
  titleOf(file: string): string;
  /** True when a manifest entry already names the change, merged and waiting for a release. */
  resolves(act: string, consolidatedOn: string): boolean;
}

const manifestFolders = ['', 'fire/', 'other/'];

export function templatesAt(folder: URL): Templates {
  const entries = () =>
    manifestFolders.flatMap((prefix) =>
      (
        JSON.parse(readFileSync(new URL(`${prefix}manifest.json`, folder), 'utf8')) as {
          templates: ManifestEntry[];
        }
      ).templates.map((entry) => ({ ...entry, file: `${prefix}${entry.file}` }))
    );
  return {
    citations: () =>
      (
        JSON.parse(readFileSync(new URL('citations.json', folder), 'utf8')) as {
          citations: IndexedQuote[];
        }
      ).citations,
    read: (file) => new Uint8Array(readFileSync(new URL(file, folder))),
    titleOf: (file) => entries().find((entry) => entry.file === file)?.title ?? file,
    resolves: (act, consolidatedOn) =>
      entries().some((entry) => {
        const resolves = entry.change.resolves;
        const list = resolves === undefined ? [] : Array.isArray(resolves) ? resolves : [resolves];
        return list.some((each) => each.act === act && each.consolidatedOn === consolidatedOn);
      }),
  };
}

export interface ResolvedChange {
  act: string;
  consolidatedOn: string;
}

export interface PatchInput {
  citation: Pick<IndexedQuote, 'file' | 'paragraph' | 'act' | 'locator' | 'text'>;
  changes: { old: string | null; new: string | null; unit: string }[];
  change?: { note: string; resolves: ResolvedChange | ResolvedChange[] };
}

export type ToolResult =
  | {
      status: 'applied';
      written: string[];
      summary: {
        file: string;
        act: string;
        locator: string;
        changes: LineChange[];
        notes: string[];
      };
      copies: string[];
      markdown: string;
    }
  | {
      status: 'needs-review';
      problems: { alineat: string | null; reason: string }[];
      markdown: string;
    }
  | { status: 'nothing-to-apply'; notes: string[]; markdown: string };

export class PendingChangeError extends Error {}

export type QuoteTool = (input: PatchInput) => ToolResult;

const engine = new URL('../../../../../packages/document-engine/', import.meta.url);

// The engine's own command, so that the scheduled fix and a person at the terminal apply a
// change the same way; it reads the release tags to join a change not yet released.
export const replaceQuoteTool: QuoteTool = (input) => {
  const folder = mkdtempSync(join(tmpdir(), 'legislation-fix-'));
  try {
    const inputPath = join(folder, 'input.json');
    const summaryPath = join(folder, 'summary.json');
    writeFileSync(inputPath, JSON.stringify(input));
    const run = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'tools/replace-legal-quote.ts', inputPath, '--summary', summaryPath],
      { cwd: fileURLToPath(engine), encoding: 'utf8', timeout: 300_000 }
    );
    if (run.status !== 0 && run.status !== 3 && run.status !== 4) {
      const output = (run.stderr || run.stdout || String(run.error)).trim().slice(0, 1_000);
      if (output.includes('the change joined to the pending one')) {
        throw new PendingChangeError(output);
      }
      throw new Error(`replace-quote failed on ${input.citation.file}: ${output}`);
    }
    return JSON.parse(readFileSync(summaryPath, 'utf8')) as ToolResult;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
};

export interface Git {
  /** Throws when the templates hold changes of a person's that a restore would discard. */
  assertClean(): void;
  restore(): void;
  currentBranch(): string;
  /** The commit the branch points to on GitHub, null when it is not there. */
  remoteHead(branch: string): string | null;
  commit(branch: string, files: string[], message: string): void;
  /** Replaces the branch on GitHub only if it still points to `expected` (null: not there). */
  push(branch: string, expected: string | null): void;
  switchTo(branch: string): void;
}

// The checkout keeps no credentials (legislation-fix.yml): the App's token reaches git only for
// the calls that talk to GitHub, through a credential helper that reads it from the environment
// of that one call, never from the command line or the repository's config.
const tokenHelper =
  '!f() { test "$1" = get && echo username=x-access-token && echo "password=$LEGISLATION_PUSH_TOKEN"; }; f';

export function gitAt(
  root: URL,
  {
    pushToken,
    templatesPath = 'packages/document-engine/templates',
  }: { pushToken?: string; templatesPath?: string } = {}
): Git {
  const cwd = fileURLToPath(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const remote = (...args: string[]) =>
    pushToken
      ? execFileSync(
          'git',
          ['-c', 'credential.helper=', '-c', `credential.helper=${tokenHelper}`, ...args],
          {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, LEGISLATION_PUSH_TOKEN: pushToken, GIT_TERMINAL_PROMPT: '0' },
          }
        ).trim()
      : git(...args);
  return {
    assertClean() {
      if (git('status', '--porcelain', '--', templatesPath)) {
        throw new Error(`${templatesPath} has uncommitted changes; commit or stash them first.`);
      }
    },
    restore() {
      git('checkout', '--', templatesPath);
    },
    currentBranch: () => git('rev-parse', '--abbrev-ref', 'HEAD'),
    remoteHead(branch) {
      const line = remote('ls-remote', 'origin', `refs/heads/${branch}`);
      return line ? line.split(/\s+/)[0]! : null;
    },
    commit(branch, files, message) {
      git('switch', '-C', branch);
      git('add', '--', ...files.map((file) => `${templatesPath}/${file}`));
      git('commit', '--quiet', '-m', message);
    },
    // The branch is the change's own and only this workflow writes it: a run that pushed and
    // then failed to open the pull request leaves it behind for the next run to replace. The
    // lease refuses the push when anyone moved it since this run looked.
    push(branch, expected) {
      const ref = `refs/heads/${branch}`;
      remote('push', `--force-with-lease=${ref}:${expected ?? ''}`, 'origin', `HEAD:${ref}`);
    },
    switchTo(branch) {
      git('switch', branch);
    },
  };
}
