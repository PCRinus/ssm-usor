import { renewalMs } from '@ssm-usor/api-http/file-link';
import type { InstructionDomain } from '@ssm-usor/contracts';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  type ClientFileResponse,
  type EarlierInstructionsResponse,
  getGetEarlierInstructionsQueryKey,
  getListClientFilesQueryKey,
  getUploadClientFileUrl,
  updateClientFile,
  useGetEarlierInstructions,
} from '@/api/generated/api';
import { apiUpload } from '@/api/http';
import { dateToIso } from '@/lib/dates';

import { refusalBeforeUpload, uploadFailureMessage } from './client-file-format';

export type EarlierInstructions = EarlierInstructionsResponse['domains'][number];

export const instructionsName: Record<InstructionDomain, string> = { ssm: 'IPSSM', su: 'IPSU' };

export const domainChoiceLabel: Record<InstructionDomain, string> = {
  ssm: 'SSM (IPSSM)',
  su: 'SU (IPSU)',
};

export const groupTitle = 'Instrucțiuni proprii anterioare';

export const keptToast = `Păstrate la „Alte documente”, în „${groupTitle}”.`;

export const todayIso = () => dateToIso(new Date());

export function namesOf(domains: InstructionDomain[]) {
  const names = domains.map((domain) => instructionsName[domain]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} și ${names.at(-1)}` : names[0];
}

export const answered = (domain: EarlierInstructions) => domain.state !== 'missing';

export const askedOnClientPage = (domains: EarlierInstructions[]) =>
  domains.filter((domain) => domain.paperTrainingCount > 0 && !answered(domain));

export function useEarlierInstructions(clientId: string, userId: string, enabled = true) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useGetEarlierInstructions(clientId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetEarlierInstructionsQueryKey(clientId), userId],
      enabled: enabled && Boolean(userId && apiRequest.baseUrl),
      // Its files carry signed links, so it fetches itself again before they expire.
      staleTime: (current) => renewalMs(firstLink(current.state.data)?.expiresInSeconds),
      refetchInterval: (current) => renewalMs(firstLink(current.state.data)?.expiresInSeconds),
    },
  });
}

const firstLink = (data: EarlierInstructionsResponse | undefined) =>
  data?.domains.flatMap((domain) => [...domain.files, ...(domain.imported?.files ?? [])])[0]?.link;

export function useRefreshEarlierInstructions(clientId: string) {
  const { queryClient } = useRouteContext({ from: '__root__' });
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetEarlierInstructionsQueryKey(clientId) }),
      queryClient.invalidateQueries({ queryKey: getListClientFilesQueryKey(clientId) }),
    ]);
}

export type InlineUpload = {
  key: string;
  domain: InstructionDomain;
  name: string;
  size: number;
  /** 0 to 100, while it goes up. */
  percent: number;
  error: string | null;
};

let lastKey = 0;

/** Uploads as soon as files are picked, one after the other, for a page with no submit. */
export function useEarlierInstructionsUploads(clientId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const refresh = useRefreshEarlierInstructions(clientId);
  const [uploads, setUploads] = useState<InlineUpload[]>([]);

  const change = (key: string, patch: Partial<InlineUpload>) =>
    setUploads((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry))
    );

  async function upload(files: File[], domain: InstructionDomain, validUntil: string) {
    const entries = files.map((file) => ({
      file,
      entry: {
        key: `earlier-${(lastKey += 1)}`,
        domain,
        name: file.name,
        size: file.size,
        percent: 0,
        error: refusalBeforeUpload(file),
      } satisfies InlineUpload,
    }));
    setUploads((current) => [...current, ...entries.map(({ entry }) => entry)]);
    for (const { file, entry } of entries) {
      if (entry.error) continue;
      try {
        await apiUpload<ClientFileResponse>(
          getUploadClientFileUrl(clientId, {
            fileName: file.name,
            earlierInstructionsDomain: domain,
            validUntil,
          }),
          file,
          {
            ...apiRequest,
            onProgress: (sent, total) =>
              change(entry.key, { percent: Math.round((sent / total) * 100) }),
          }
        );
        await refresh();
        setUploads((current) => current.filter((each) => each.key !== entry.key));
      } catch (cause) {
        change(entry.key, { error: uploadFailureMessage(cause) });
      }
    }
  }

  const dismiss = (key: string) =>
    setUploads((current) => current.filter((entry) => entry.key !== key));

  return { uploads, upload, dismiss } as const;
}

export function useChangeValidUntil(clientId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const refresh = useRefreshEarlierInstructions(clientId);
  return async (fileIds: string[], validUntil: string) => {
    try {
      await Promise.all(
        fileIds.map((fileId) => updateClientFile(clientId, fileId, { validUntil }, apiRequest))
      );
    } finally {
      await refresh();
    }
  };
}
