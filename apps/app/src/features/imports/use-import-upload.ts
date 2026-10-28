import { importErrorReasons } from '@ssm-usor/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import {
  abandonImport,
  createImport,
  getGetImportQueryKey,
  getListImportsQueryKey,
  registerImportFiles,
  startImport,
} from '@/api/generated/api';

import { importErrorMessage, importErrorReason } from './import-format';
import { sha256Of, uploadImportObject } from './import-storage';
import type { SelectedFile } from './upload-selection';

export type UploadPhase =
  | { step: 'choosing' }
  | { step: 'hashing'; done: number; total: number }
  | { step: 'uploading'; sentBytes: number; totalBytes: number }
  | { step: 'starting' }
  | { step: 'stalled'; failed: number; uploaded: number }
  | { step: 'unstarted'; error: string }
  | { step: 'empty' }
  | { step: 'failed'; error: string };

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

export function useImportUpload(clientId: string | undefined, onStarted: (id: string) => void) {
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
      if (reason === importErrorReasons.notUploading) await opened(id);
      else if (reason === importErrorReasons.empty) setPhase({ step: 'empty' });
      else {
        setPhase({
          step: 'unstarted',
          error: importErrorMessage(cause, 'Citirea nu a putut porni. Încearcă din nou.'),
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

  async function upload(files: SelectedFile[]) {
    if (phase.step !== 'choosing' && phase.step !== 'failed') return;
    abandoned.current = false;
    fileCount.current = files.length;
    try {
      setPhase({ step: 'hashing', done: 0, total: files.length });
      const hashes = new Map<string, string>();
      let hashed = 0;
      await inParallel(files, 4, async (file) => {
        hashes.set(file.key, await sha256Of(file.blob));
        hashed += 1;
        setPhase({ step: 'hashing', done: hashed, total: files.length });
      });
      if (abandoned.current) return;
      const id = (await createImport(clientId ? { clientId } : {}, apiRequest)).import.id;
      importId.current = id;
      if (abandoned.current) {
        abandon();
        return;
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
            })),
          },
          apiRequest
        );
        const byPath = new Map(registered.files.map((each) => [each.uploadPath, each.storagePath]));
        for (const file of batch) jobs.push({ file, storagePath: byPath.get(file.path)! });
      }
      void queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
      await send(id, jobs);
    } catch (cause) {
      if (abandoned.current) return;
      // Its files are half registered, so trying again starts a new import.
      if (importId.current) void abandonImport(importId.current, apiRequest).catch(() => undefined);
      importId.current = null;
      setPhase({
        step: 'failed',
        error: importErrorMessage(
          cause,
          'Fișierele nu au putut fi încărcate. Verifică conexiunea și încearcă din nou.'
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

  return { phase, upload, retry, continueWithout, abandon } as const;
}
