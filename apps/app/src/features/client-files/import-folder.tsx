import { useState } from 'react';

import { listClientFiles } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { saveFile } from '@/lib/save-file';

import { folderTexts, type ImportFolder } from './client-file-list';
import { zipFiles } from './zip-files';

export interface FolderZips {
  progress: (importId: string) => { done: number; total: number } | undefined;
  failed: (importId: string) => boolean;
  download: (folder: ImportFolder) => Promise<void>;
}

export function useFolderZips(clientId: string): FolderZips {
  const { request } = useApi();
  const [zipping, setZipping] = useState<Record<string, { done: number; total: number }>>({});
  const [failed, setFailed] = useState<string[]>([]);

  const progressOf = (importId: string, value: { done: number; total: number } | null) =>
    setZipping((current) => {
      const next = { ...current };
      if (value) next[importId] = value;
      else delete next[importId];
      return next;
    });

  async function download(folder: ImportFolder) {
    const { importId, files } = folder;
    setFailed((current) => current.filter((id) => id !== importId));
    progressOf(importId, { done: 0, total: files.length });
    try {
      const fresh = await listClientFiles(
        clientId,
        folder.first.employee ? { employeeId: folder.first.employee.id } : undefined,
        request
      );
      const links = new Map(fresh.items.map((file) => [file.id, file.link]));
      const blob = await zipFiles(
        files.map((file) => ({
          path: [file.importPath, file.originalFileName].filter(Boolean).join('/'),
          load: async () => {
            const link = links.get(file.id);
            if (!link) throw new Error('The file is no longer available.');
            const response = await fetch(link.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return new Uint8Array(await response.arrayBuffer());
          },
        })),
        (done) => progressOf(importId, { done, total: files.length })
      );
      saveFile(blob, folderTexts[folder.kind].zipName(folder.date));
    } catch {
      setFailed((current) => [...current, importId]);
    } finally {
      progressOf(importId, null);
    }
  }

  return {
    progress: (importId) => zipping[importId],
    failed: (importId) => failed.includes(importId),
    download,
  };
}
