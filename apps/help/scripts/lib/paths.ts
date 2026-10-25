import { fileURLToPath } from 'node:url';

export const helpRoot = fileURLToPath(new URL('../../', import.meta.url));
export const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const docsDirectory = fileURLToPath(new URL('../../src/content/docs/', import.meta.url));
export const distDirectory = fileURLToPath(new URL('../../dist/', import.meta.url));
export const topicsModule = fileURLToPath(
  new URL('../../../../packages/help-topics/src/topics.ts', import.meta.url)
);
