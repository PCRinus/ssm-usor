import {
  type CreditsShort,
  importErrorReasons,
  type ImportKind,
  importLimits,
} from '@ssm-usor/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import {
  abandonImport,
  addFoundSheets,
  type ApiErrorResponse,
  createImport,
  getGetBillingQueryKey,
  getGetImportQueryKey,
  getListFoundSheetsQueryKey,
  getListImportsQueryKey,
  registerImportFiles,
  startImport,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';

import { shrinkSelected } from './employees/shrink-photo';
import { importErrorMessage, importErrorReason } from './import-format';
import { sha256Of, uploadImportObject } from './import-storage';
import { type SelectedFile, shrinksBeforeUpload } from './upload-selection';

export type UploadPhase =
  | { step: 'choosing' }
  | { step: 'shrinking'; done: number; total: number }
  | { step: 'hashing'; done: number; total: number }
  | { step: 'uploading'; sentBytes: number; totalBytes: number }
  | { step: 'starting' }
  | { step: 'stalled'; failed: number; uploaded: number }
  | { step: 'unstarted'; error: string }
  | { step: 'empty' }
  | { step: 'failed'; error: string }
  | { step: 'short'; credits: CreditsShort };

export const busySteps = new Set<UploadPhase['step']>([
  'shrinking',
  'hashing',
  'uploading',
  'starting',
]);

export const heldSteps = new Set<UploadPhase['step']>(['stalled', 'unstarted', 'empty']);

export const choosingSteps = new Set<UploadPhase['step']>(['choosing', 'failed', 'short']);

const creditsShortOf = (cause: unknown) =>
  cause instanceof ApiHttpError
    ? (cause.body as Partial<ApiErrorResponse> | undefined)?.credits
    : undefined;

const registerBatch = 50;
const maxConcurrent = 3;
const attempts = 2;

async function inParallel<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next]!;
        next += 1;
        await work(item);
      }
    })
  );
}

function overAfterShrinking(files: SelectedFile[], foundBytes: number) {
  const limits = importLimits.employees;
  const large = files.filter((file) => file.size > limits.fileBytes);
  if (large.length === 1) {
    return `Fotografia „${large[0]!.name}” are peste 25 MB și nu am putut-o micșora. Salveaz-o mai mică sau fotografiaz-o din nou, apoi alege fotografiile din nou.`;
  }
  if (large.length > 1) {
    return `${large.length} fotografii au peste 25 MB și nu le-am putut micșora, între ele „${large[0]!.name}”. Salvează-le mai mici, apoi alege fotografiile din nou.`;
  }
  const bytes = files.reduce((total, file) => total + file.size, foundBytes);
  if (bytes > limits.totalBytes) {
    return 'Și micșorate, fotografiile au peste 1 GB, cât intră într-un import. Scoate o parte și păstreaz-o pentru un import următor, cu toate fotografiile unei persoane în același import.';
  }
  return null;
}

async function withRetry(work: () => Promise<void>) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await work();
      return;
    } catch (cause) {
      if (attempt >= attempts) throw cause;
    }
  }
}

export function useImportUpload(
  clientId: string | undefined,
  onStarted: (id: string) => void,
  kind: ImportKind = 'client'
) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<UploadPhase>({ step: 'choosing' });
  const importId = useRef<string | null>(null);
  const fileCount = useRef(0);
  const pending = useRef<{ file: SelectedFile; storagePath: string }[]>([]);
  const abandoned = useRef(false);

  async function opened(id: string) {
    // The list behind the dialog may have read the import while it was still uploading.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetImportQueryKey(id) }),
    ]);
    if (!abandoned.current) onStarted(id);
  }

  async function start(id: string) {
    setPhase({ step: 'starting' });
    try {
      await startImport(id, apiRequest);
    } catch (cause) {
      if (abandoned.current) return;
      const reason = importErrorReason(cause);
      // An earlier start reached the server and only its answer was lost.
      const short = creditsShortOf(cause);
      if (reason === importErrorReasons.notUploading) await opened(id);
      else if (reason === importErrorReasons.empty) setPhase({ step: 'empty' });
      // The balance changed after the dialog opened. Its files cannot be read until credits
      // come, long after an upload stalls, so the import goes and the files can be chosen again.
      else if (reason === importErrorReasons.creditsInsufficient && short) {
        importId.current = null;
        await abandonImport(id, apiRequest).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: getGetBillingQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
        if (!abandoned.current) setPhase({ step: 'short', credits: short });
      } else {
        setPhase({
          step: 'unstarted',
          error: importErrorMessage(cause, 'Citirea nu a putut porni. Încearcă din nou.', kind),
        });
      }
      return;
    }
    await opened(id);
  }

  async function send(id: string, jobs: { file: SelectedFile; storagePath: string }[]) {
    const totalBytes = jobs.reduce((total, job) => total + job.file.size, 0);
    let sentBytes = 0;
    const failed: typeof jobs = [];
    setPhase({ step: 'uploading', sentBytes, totalBytes });
    await inParallel(jobs, maxConcurrent, async (job) => {
      if (abandoned.current) return;
      try {
        await withRetry(() =>
          uploadImportObject(job.storagePath, job.file.blob, job.file.mimeType)
        );
        sentBytes += job.file.size;
        setPhase({ step: 'uploading', sentBytes, totalBytes });
      } catch (cause) {
        // A retry after an answer lost on the way finds the object stored by the first attempt.
        if (cause instanceof Error && /already exists/i.test(cause.message)) {
          sentBytes += job.file.size;
          setPhase({ step: 'uploading', sentBytes, totalBytes });
        } else failed.push(job);
      }
    });
    if (abandoned.current) return;
    pending.current = failed;
    if (failed.length > 0) {
      setPhase({
        step: 'stalled',
        failed: failed.length,
        uploaded: fileCount.current - failed.length,
      });
      return;
    }
    await start(id);
  }

  async function shrink(chosen: SelectedFile[]) {
    const photos = chosen.filter((file) => shrinksBeforeUpload(kind, file.mimeType));
    if (photos.length === 0) return chosen;
    const taken = new Set(chosen.map((file) => file.path));
    const shrunk = new Map<string, SelectedFile>();
    let done = 0;
    setPhase({ step: 'shrinking', done, total: photos.length });
    await inParallel(photos, 2, async (file) => {
      shrunk.set(file.key, await shrinkSelected(file, taken));
      done += 1;
      setPhase({ step: 'shrinking', done, total: photos.length });
    });
    return chosen.map((file) => shrunk.get(file.key) ?? file);
  }

  // `found`: an employee import's sheets found in the client's documentation, copied server side
  // rather than uploaded.
  async function upload(
    chosen: SelectedFile[],
    found: { ids: string[]; bytes: number } = { ids: [], bytes: 0 }
  ) {
    if (!choosingSteps.has(phase.step)) return;
    abandoned.current = false;
    fileCount.current = chosen.length;
    try {
      const files = kind === 'employees' ? await shrink(chosen) : chosen;
      if (abandoned.current) return;
      const over = kind === 'employees' ? overAfterShrinking(files, found.bytes) : null;
      if (over) {
        setPhase({ step: 'failed', error: over });
        return;
      }
      setPhase({ step: 'hashing', done: 0, total: files.length });
      const hashes = new Map<string, string>();
      let hashed = 0;
      await inParallel(files, 4, async (file) => {
        hashes.set(file.key, await sha256Of(file.blob));
        hashed += 1;
        setPhase({ step: 'hashing', done: hashed, total: files.length });
      });
      if (abandoned.current) return;
      const body = kind === 'employees' ? { clientId, kind } : clientId ? { clientId } : {};
      const id = (await createImport(body, apiRequest)).import.id;
      importId.current = id;
      if (abandoned.current) {
        abandon();
        return;
      }
      if (found.ids.length > 0) {
        await addFoundSheets(id, { fileIds: found.ids }, apiRequest);
      }
      const jobs: { file: SelectedFile; storagePath: string }[] = [];
      for (let first = 0; first < files.length; first += registerBatch) {
        const batch = files.slice(first, first + registerBatch);
        const registered = await registerImportFiles(
          id,
          {
            files: batch.map((file) => ({
              uploadPath: file.path,
              mimeType: file.mimeType,
              sizeBytes: file.size,
              sha256: hashes.get(file.key)!,
              ...(kind === 'employees' && file.mimeType === 'application/pdf'
                ? { pages: file.pages }
                : {}),
            })),
          },
          apiRequest
        );
        const byPath = new Map(registered.files.map((each) => [each.uploadPath, each.storagePath]));
        for (const file of batch) jobs.push({ file, storagePath: byPath.get(file.path)! });
      }
      void queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
      if (jobs.length === 0) await start(id);
      else await send(id, jobs);
    } catch (cause) {
      if (abandoned.current) return;
      // Its files are half registered, so trying again starts a new import. It must be gone first:
      // until then its found sheets count as taken, and the retry would be refused them.
      const id = importId.current;
      importId.current = null;
      if (id) await abandonImport(id, apiRequest).catch(() => undefined);
      if (abandoned.current) return;
      if (importErrorReason(cause) === importErrorReasons.noFoundSheets && clientId) {
        await queryClient.invalidateQueries({ queryKey: getListFoundSheetsQueryKey(clientId) });
      }
      setPhase({
        step: 'failed',
        error: importErrorMessage(
          cause,
          'Fișierele nu au putut fi încărcate. Verifică conexiunea și încearcă din nou.',
          kind
        ),
      });
    }
  }

  function retry() {
    const id = importId.current;
    if (!id) return;
    void (pending.current.length > 0 ? send(id, pending.current) : start(id));
  }

  const continueWithout = () => importId.current && void start(importId.current);

  function abandon() {
    abandoned.current = true;
    const id = importId.current;
    importId.current = null;
    if (!id) return;
    void abandonImport(id, apiRequest)
      .catch(() => undefined)
      .then(() => queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }));
  }

  const forgetShort = () =>
    setPhase((current) => (current.step === 'short' ? { step: 'choosing' } : current));

  return { phase, upload, retry, continueWithout, abandon, forgetShort } as const;
}
