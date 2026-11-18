import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Citation } from '@ssm-usor/document-engine';
import {
  type LegalQuoteResult,
  type PatchInput,
  PendingChangeError,
  releasedManifestAt,
  replaceLegalQuote,
} from '@ssm-usor/document-engine/legal-quote';
import { manifestEntries } from '@ssm-usor/document-engine/template-store';

export interface Templates {
  citations(): Citation[];
  read(file: string): Uint8Array;
  titleOf(file: string): string;
  /** True when a manifest entry already names the change, merged and waiting for a release. */
  resolves(act: string, consolidatedOn: string): boolean;
}

export function templatesAt(folder: URL): Templates {
  const entries = () => manifestEntries(folder);
  return {
    citations: () =>
      (
        JSON.parse(readFileSync(new URL('citations.json', folder), 'utf8')) as {
          citations: Citation[];
        }
      ).citations,
    read: (file) => new Uint8Array(readFileSync(new URL(file, folder))),
    titleOf: (file) => entries().find((entry) => entry.path === file)?.title ?? file,
    resolves: (act, consolidatedOn) =>
      entries().some((entry) =>
        (entry.change.resolves ?? []).some(
          (each) => each.act === act && each.consolidatedOn === consolidatedOn
        )
      ),
  };
}

export type QuoteTool = (input: PatchInput) => LegalQuoteResult;

// The function behind the engine's `replace-quote` command, so that the scheduled fix and a
// person at the terminal apply a change the same way; it reads the release tags to join a
// change not yet released.
export const quoteToolAt =
  (templates: URL): QuoteTool =>
  (input) => {
    try {
      return replaceLegalQuote(
        templates,
        input,
        releasedManifestAt(undefined, fileURLToPath(templates))
      );
    } catch (error) {
      if (error instanceof PendingChangeError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`replace-quote failed on ${input.citation.file}: ${message}`, {
        cause: error,
      });
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
