import type { ApiEnv } from '../../lib/env';
import { copyFolder, describe, type PipelineDeps } from './pipeline';
import { pipelineDeps } from './queue';

// Long enough for the copy the confirmation queued to have run, or failed for good.
const copyGraceMilliseconds = 60 * 60 * 1000;

/**
 * The daily clean-up of ADR 030: folders whose copy did not finish are copied again, then
 * abandoned and failed imports go after 14 days and confirmed imports' proposals after 30.
 */
export async function cleanUpImports(deps: PipelineDeps, now = new Date()) {
  const uncopied = await deps.store.uncopiedImports(
    new Date(now.getTime() - copyGraceMilliseconds).toISOString()
  );
  let copied = 0;
  for (const importId of uncopied) {
    try {
      await copyFolder(deps, importId);
      copied++;
    } catch (error) {
      console.error(`The folder of import ${importId} was not copied: ${describe(error)}`);
    }
  }
  const abandoned = await deps.store.deleteAbandoned();
  const dropped = await deps.store.dropProposals();
  const paths = [...new Set([...abandoned, ...dropped])];
  // The rows that named these paths are gone or cleared, so nothing finds them again.
  try {
    await deps.objects.remove(paths);
  } catch (error) {
    console.error(`${paths.length} import objects were left in Storage: ${describe(error)}`);
    throw error;
  }
  return { copied, uncopied: uncopied.length - copied, removed: paths.length };
}

export async function scheduledImportCleanUp(env: ApiEnv['Bindings']) {
  const result = await cleanUpImports(pipelineDeps(env));
  console.log(
    `Import clean-up: ${result.copied} folders copied, ${result.uncopied} left, ${result.removed} objects removed.`
  );
}
