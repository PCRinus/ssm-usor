import type { ApiEnv } from '../../lib/env';
import { copyFolder, describe, importReasons, type PipelineDeps } from './pipeline';
import { pipelineDeps } from './queue';
import type { ImportObjectList } from './store';

// Long enough for the copy the confirmation queued to have run, or failed for good.
const copyGraceMilliseconds = 60 * 60 * 1000;

/**
 * The daily clean-up of ADR 030: folders whose copy did not finish are copied again, imports the
 * queue lost or members left are failed, then the objects of abandoned and failed imports go
 * after 14 days and confirmed imports' proposals and objects after 30. Objects go before the rows
 * that name them, so an import whose removal failed is listed again the next day.
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
  const failed = await deps.store.failStalled({
    stalled: importReasons.stalled,
    left: importReasons.left,
  });
  const abandoned = await deps.store.listAbandoned();
  const deleted = await deps.store.deleteAbandoned(await removeObjects(deps, abandoned));
  const dropped = await deps.store.dropProposals();
  const emptied = await deps.store.listObjectsToRemove();
  const marked = await deps.store.markObjectsRemoved(await removeObjects(deps, emptied));
  return {
    copied,
    uncopied: uncopied.length - copied,
    failed: failed.length,
    deleted: deleted.length,
    dropped,
    emptied: marked.length,
    left: abandoned.length - deleted.length + emptied.length - marked.length,
  };
}

// The listed paths, and whatever else the import's folder holds: a scan's page readings and
// claims are named by no row.
async function objectsOf(deps: PipelineDeps, paths: string[]) {
  const folder = paths[0]?.split('/').slice(0, -1).join('/');
  if (!folder) return paths;
  const names = await deps.objects.list(folder);
  return [...new Set([...paths, ...names.map((name) => `${folder}/${name}`)])];
}

async function removeObjects(deps: PipelineDeps, lists: ImportObjectList[]) {
  const removed: string[] = [];
  for (const { importId, paths } of lists) {
    try {
      await deps.objects.remove(await objectsOf(deps, paths));
      removed.push(importId);
    } catch (error) {
      console.error(`The objects of import ${importId} were left in Storage: ${describe(error)}`);
    }
  }
  return removed;
}

export async function scheduledImportCleanUp(env: ApiEnv['Bindings']) {
  const result = await cleanUpImports(pipelineDeps(env));
  console.log(
    `Import clean-up: ${result.copied} folders copied, ${result.uncopied} not; ${result.failed} imports failed as stalled or left; ${result.deleted} deleted; ${result.dropped} proposals dropped; ${result.emptied} folders emptied; ${result.left} left for tomorrow.`
  );
}
