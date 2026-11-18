import type { Plugin } from 'vite';

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
