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

export interface PatchInput {
  citation: Pick<IndexedQuote, 'file' | 'paragraph' | 'act' | 'locator' | 'text'>;
  changes: { old: string | null; new: string | null }[];
  change?: { note: string; resolves: { act: string; consolidatedOn: string } };
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
    };

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
    if (run.status !== 0 && run.status !== 3) {
      throw new Error(
        `replace-quote failed on ${input.citation.file}: ${(run.stderr || run.stdout || String(run.error)).trim().slice(0, 1_000)}`
      );
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
  commit(branch: string, files: string[], message: string): void;
  push(branch: string): void;
  switchTo(branch: string): void;
}

export function gitAt(root: URL, templatesPath = 'packages/document-engine/templates'): Git {
  const cwd = fileURLToPath(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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
    commit(branch, files, message) {
      git('switch', '-C', branch);
      git('add', '--', ...files.map((file) => `${templatesPath}/${file}`));
      git('commit', '--quiet', '-m', message);
    },
    // The branch is the change's own and only this workflow writes it: a run that pushed and
    // then failed to open the pull request leaves it behind for the next run to replace.
    push(branch) {
      git('push', '--force', 'origin', `HEAD:refs/heads/${branch}`);
    },
    switchTo(branch) {
      git('switch', branch);
    },
  };
}
