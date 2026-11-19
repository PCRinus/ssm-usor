import { execFileSync } from 'node:child_process';

import type { Plugin } from 'vite';

export function commitSha() {
  const configuredSha = process.env.GIT_COMMIT_SHA?.trim();
  if (configuredSha) return configuredSha;

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

// Open tabs fetch it and compare it with the commit they run to learn of a newer build (ADR 040).
export function versionFile(commit: string): Plugin {
  return {
    name: 'ssm-usor-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ commit })}\n`,
      });
    },
  };
}
