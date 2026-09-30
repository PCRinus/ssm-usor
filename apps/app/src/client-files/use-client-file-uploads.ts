import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import {
  type ClientFileResponse,
  getListClientFilesQueryKey,
  getUploadClientFileUrl,
} from '../api/generated/api';
import { apiUpload } from '../api/http';
import { fileCountLabel, refusalBeforeUpload, uploadFailureMessage } from './client-file-format';

export type ChosenFile = {
  key: string;
  file: File;
  state: 'refused' | 'ready' | 'waiting' | 'sending' | 'uploaded' | 'failed';
  /** 0 to 100, while it goes up. */
  percent: number;
  error: string | null;
};

type Job = { key: string; file: File; ownersOnly: boolean; batch: Batch };

type Batch = { remaining: number; uploaded: string[]; failed: number };

const maxConcurrent = 3;

let lastKey = 0;

function choose(file: File): ChosenFile {
  const refusal = refusalBeforeUpload(file);
  return {
    key: `upload-${(lastKey += 1)}`,
    file,
    state: refusal ? 'refused' : 'ready',
    percent: 0,
    error: refusal,
  };
}

const sameFile = (a: File, b: File) =>
  a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

// `onAllUploaded` is not called after a failure: the list stays, so no file goes missing unsaid.
export function useClientFileUploads(
  clientId: string,
  initialFiles: File[],
  onAllUploaded: () => void
) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const [chosen, setChosen] = useState<ChosenFile[]>(() => initialFiles.map(choose));
  const [started, setStarted] = useState(false);
  const queue = useRef<Job[]>([]);
  const running = useRef(0);

  const change = (key: string, patch: Partial<ChosenFile>) =>
    setChosen((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry))
    );

  function settle(batch: Batch) {
    batch.remaining -= 1;
    if (batch.remaining > 0 || batch.failed > 0) return;
    toast.success(
      batch.uploaded.length === 1
        ? `„${batch.uploaded[0]}” a fost încărcat.`
        : `Au fost încărcate ${fileCountLabel(batch.uploaded.length)}.`
    );
    onAllUploaded();
  }

  async function send(job: Job) {
    change(job.key, { state: 'sending' });
    try {
      const { file } = await apiUpload<ClientFileResponse>(
        getUploadClientFileUrl(clientId, {
          fileName: job.file.name,
          ownersOnly: job.ownersOnly ? 'true' : 'false',
        }),
        job.file,
        {
          ...apiRequest,
          onProgress: (sent, total) =>
            change(job.key, { percent: Math.round((sent / total) * 100) }),
        }
      );
      job.batch.uploaded.push(file.name);
      await queryClient.invalidateQueries({ queryKey: getListClientFilesQueryKey(clientId) });
      change(job.key, { state: 'uploaded', percent: 100 });
    } catch (cause) {
      job.batch.failed += 1;
      change(job.key, { state: 'failed', error: uploadFailureMessage(cause) });
    }
    settle(job.batch);
  }

  function pump() {
    while (running.current < maxConcurrent && queue.current.length > 0) {
      const job = queue.current.shift()!;
      running.current += 1;
      void send(job).finally(() => {
        running.current -= 1;
        pump();
      });
    }
  }

  function add(files: File[]) {
    if (started) return;
    const fresh = files.filter(
      (file, index) =>
        !chosen.some((entry) => sameFile(entry.file, file)) &&
        files.findIndex((other) => sameFile(other, file)) === index
    );
    if (fresh.length > 0) setChosen((current) => [...current, ...fresh.map(choose)]);
  }

  const remove = (key: string) =>
    setChosen((current) => current.filter((entry) => entry.key !== key));

  function start(ownersOnly: boolean) {
    const ready = chosen.filter((entry) => entry.state === 'ready');
    if (started || ready.length === 0) return;
    setStarted(true);
    setChosen((current) =>
      current.map((entry) => (entry.state === 'ready' ? { ...entry, state: 'waiting' } : entry))
    );
    const batch: Batch = { remaining: ready.length, uploaded: [], failed: 0 };
    queue.current.push(...ready.map(({ key, file }) => ({ key, file, ownersOnly, batch })));
    pump();
  }

  const phase = !started
    ? 'choosing'
    : chosen.some((entry) => entry.state === 'waiting' || entry.state === 'sending')
      ? 'sending'
      : 'finished';

  return { chosen, phase, add, remove, start } as const;
}
