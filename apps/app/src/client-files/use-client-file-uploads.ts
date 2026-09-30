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

export type PendingUpload = {
  key: string;
  fileName: string;
  state: 'waiting' | 'sending' | 'failed';
  /** 0 to 100, while it goes up. */
  percent: number;
  error: string | null;
};

type Job = { key: string; file: File; ownersOnly: boolean; batch: Batch };

type Batch = { remaining: number; uploaded: string[] };

const maxConcurrent = 3;

export function useClientFileUploads(clientId: string) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const queue = useRef<Job[]>([]);
  const running = useRef(0);
  const nextKey = useRef(0);

  const change = (key: string, patch: Partial<PendingUpload>) =>
    setUploads((current) =>
      current.map((upload) => (upload.key === key ? { ...upload, ...patch } : upload))
    );

  function settle(batch: Batch) {
    batch.remaining -= 1;
    if (batch.remaining > 0 || batch.uploaded.length === 0) return;
    toast.success(
      batch.uploaded.length === 1
        ? `„${batch.uploaded[0]}” a fost încărcat.`
        : `Au fost încărcate ${fileCountLabel(batch.uploaded.length)}.`
    );
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
      setUploads((current) => current.filter((upload) => upload.key !== job.key));
    } catch (cause) {
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

  function add(files: File[], ownersOnly: boolean) {
    if (files.length === 0) return;
    const batch: Batch = { remaining: 0, uploaded: [] };
    const added: PendingUpload[] = [];
    for (const file of files) {
      const key = `upload-${(nextKey.current += 1)}`;
      const refusal = refusalBeforeUpload(file);
      added.push({
        key,
        fileName: file.name,
        state: refusal ? 'failed' : 'waiting',
        percent: 0,
        error: refusal,
      });
      if (!refusal) {
        batch.remaining += 1;
        queue.current.push({ key, file, ownersOnly, batch });
      }
    }
    setUploads((current) => [...added, ...current]);
    pump();
  }

  const dismiss = (key: string) =>
    setUploads((current) => current.filter((upload) => upload.key !== key));

  return { uploads, add, dismiss };
}
