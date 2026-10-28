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

import { importErrorMessage } from './import-format';
import { sha256Of, uploadImportObject } from './import-storage';
import type { SelectedFile } from './upload-selection';

export type UploadPhase =
  | { step: 'choosing' }
  | { step: 'hashing'; done: number; total: number }
  | { step: 'uploading'; sentBytes: number; totalBytes: number }
  | { step: 'starting' }
  | { step: 'stalled'; failed: number; error?: string }
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
  const pending = useRef<{ file: SelectedFile; storagePath: string }[]>([]);

  async function start(id: string) {
    setPhase({ step: 'starting' });
    try {
      await startImport(id, apiRequest);
    } catch (cause) {
      setPhase({
        step: 'stalled',
        failed: 0,
        error: importErrorMessage(cause, 'Citirea nu a putut porni. Încearcă din nou.'),
      });
      return;
    }
    // The list behind the dialog may have read the import while it was still uploading.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetImportQueryKey(id) }),
    ]);
    onStarted(id);
  }

  async function send(id: string, jobs: { file: SelectedFile; storagePath: string }[]) {
    const totalBytes = jobs.reduce((total, job) => total + job.file.size, 0);
    let sentBytes = 0;
    const failed: typeof jobs = [];
    setPhase({ step: 'uploading', sentBytes, totalBytes });
    await inParallel(jobs, maxConcurrent, async (job) => {
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
    pending.current = failed;
    if (failed.length > 0) {
      setPhase({ step: 'stalled', failed: failed.length });
      return;
    }
    await start(id);
  }

  async function upload(files: SelectedFile[]) {
    if (phase.step !== 'choosing' && phase.step !== 'failed') return;
    try {
      setPhase({ step: 'hashing', done: 0, total: files.length });
      const hashes = new Map<string, string>();
      let hashed = 0;
      await inParallel(files, 4, async (file) => {
        hashes.set(file.key, await sha256Of(file.blob));
        hashed += 1;
        setPhase({ step: 'hashing', done: hashed, total: files.length });
      });
      const id = (await createImport(clientId ? { clientId } : {}, apiRequest)).import.id;
      importId.current = id;
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

  const retry = () => importId.current && void send(importId.current, pending.current);

  const continueWithout = () => importId.current && void start(importId.current);

  return { phase, upload, retry, continueWithout } as const;
}
