import type { ApiEnv } from '../../lib/env';
import { keepMissingCopies } from './copies';
import { alertImport, daySummary } from './import-alerts';
import { libraryReasons, riskReasons } from './library';
import { copyFolder, describe, importReasons, type PipelineDeps } from './pipeline';
import { pipelineDeps } from './queue';
import type { ImportCopy, ImportObjectList } from './store';

// Long enough for the copy the confirmation queued to have run, or failed for good.
const copyGraceMilliseconds = 60 * 60 * 1000;

/**
 * The daily clean-up of ADR 030: folders whose copy did not finish are copied again, imports the
 * queue lost or members left are failed, the improvement copies not yet written are written
 * (ADR 037), then the objects of abandoned and failed imports go after 14 days and confirmed
 * imports' proposals and objects after 30, and the improvement copies after 12 months. Objects go
 * before the rows that name them, so an import or a copy whose removal failed is listed again the
 * next day.
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
  const failedParts = await deps.store.failStalledLibraryParts({
    instructions: libraryReasons.stalled,
    risks: riskReasons.stalled,
  });
  for (const importId of failed) await alertImport(deps, importId, null, ['cleanUp']);
  for (const { importId, part } of failedParts) {
    await alertImport(deps, importId, part, ['cleanUp']);
  }
  const kept = await keepMissingCopies(deps, now);
  const abandoned = await deps.store.listAbandoned();
  const deleted = await deps.store.deleteAbandoned(await removeObjects(deps, abandoned));
  const dropped = await deps.store.dropProposals();
  const emptied = await deps.store.listObjectsToRemove();
  const marked = await deps.store.markObjectsRemoved(await removeObjects(deps, emptied));
  const expired = await deps.store.listExpiredCopies();
  const removedCopies = await deps.store.markCopiesRemoved(await removeCopies(deps, expired));
  return {
    copied,
    uncopied: uncopied.length - copied,
    failed: failed.length,
    failedParts: failedParts.length,
    copiesWritten: kept.written,
    copiesNotWritten: kept.failed,
    deleted: deleted.length,
    dropped,
    emptied: marked.length,
    copiesRemoved: removedCopies.length,
    left:
      abandoned.length -
      deleted.length +
      emptied.length -
      marked.length +
      expired.length -
      removedCopies.length,
  };
}

export type CleanUpResult = Awaited<ReturnType<typeof cleanUpImports>>;

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

async function removeCopies(deps: PipelineDeps, copies: ImportCopy[]) {
  const removed: string[] = [];
  for (const copy of copies) {
    try {
      const paths = await deps.copies.list(copy.folder);
      // A part ends up to 14 days after its import, so its copy may outlive the import's.
      const own = copy.part
        ? paths
        : paths.filter((path) => !path.startsWith(`${copy.folder}/parts/`));
      if (own.length > 0) await deps.copies.remove(own);
      removed.push(copy.id);
    } catch (error) {
      console.error(`The copy ${copy.folder} was left in Storage: ${describe(error)}`);
    }
  }
  return removed;
}

export const cleanUpLine = (result: CleanUpResult) =>
  `${result.copied} folders copied, ${result.uncopied} not; ${result.failed} imports failed as stalled or left; ${result.failedParts} library parts failed as stalled; ${result.copiesWritten} improvement copies written, ${result.copiesNotWritten} not; ${result.deleted} deleted; ${result.dropped} proposals dropped; ${result.emptied} folders emptied; ${result.copiesRemoved} improvement copies removed; ${result.left} left for tomorrow.`;

const dayMilliseconds = 24 * 60 * 60 * 1000;

/** Posted after the clean-up, so that a day with no alert still shows the alerts run. */
export async function postDaySummary(deps: PipelineDeps, line: string, now = new Date()) {
  if (!deps.alerts.enabled) return;
  const to = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const from = new Date(to.getTime() - dayMilliseconds);
  try {
    const records = await deps.records.between(from.toISOString(), to.toISOString());
    await deps.alerts.send(daySummary(records, from, to, line));
  } catch (error) {
    console.error(`The imports' day summary was not posted: ${describe(error)}`);
    await deps.alerts.send({
      severity: 'summary',
      title: `Imports on ${from.toISOString().slice(0, 10)}`,
      lines: ['The day could not be read.', `Clean-up: ${line}`],
    });
  }
}

export async function scheduledImportCleanUp(env: ApiEnv['Bindings']) {
  const deps = pipelineDeps(env);
  const line = cleanUpLine(await cleanUpImports(deps));
  console.log(`Import clean-up: ${line}`);
  await postDaySummary(deps, line);
}
