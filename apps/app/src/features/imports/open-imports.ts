import type { ImportListResponseItemsItem } from '@/api/generated/api';
import { roCount } from '@/features/employees/employee-format';

import { isRunning } from './import-format';
import { type ImportLink, linkOf } from './import-ready-notices';

type ImportItem = ImportListResponseItemsItem;

export type OpenImport = {
  id: string;
  kind: ImportItem['kind'];
  name: string;
  detail: string;
  // Percent, for a running import whose files can be counted.
  progress: number | null;
  action: string | null;
  link: ImportLink;
};

export type OpenImports = {
  ready: OpenImport[];
  running: OpenImport[];
  failed: OpenImport[];
};

const nameOf = (item: ImportItem) =>
  item.client?.legalName ??
  item.companyName ??
  (item.kind === 'employees' ? 'Fișele unui client' : 'Client nou din documente');

const kindLabel = (item: ImportItem) =>
  item.kind === 'employees' ? 'Import angajați' : 'Import client';

function runningStep(item: ImportItem): { step: string; progress: number | null } {
  const progress = item.progress;
  const photos = item.kind === 'employees';
  if (item.status === 'preparing') {
    if (!progress || progress.files === 0) return { step: 'pregătim fișierele', progress: null };
    return {
      step: `${progress.prepared} din ${roCount(progress.files, 'fișier', 'fișiere')} pregătite`,
      progress: (progress.prepared / progress.files) * 100,
    };
  }
  if (item.status === 'checking') {
    return { step: photos ? 'le grupăm pe persoane' : 'verificăm datele', progress: null };
  }
  if (item.status === 'sorting' && !photos) return { step: 'le sortăm', progress: null };
  if (progress && progress.scans > 0) {
    const total = photos
      ? roCount(progress.scans, 'fotografie', 'fotografii')
      : roCount(progress.scans, 'scanare', 'scanări');
    return {
      step: `${progress.scansRead} din ${total} citite`,
      progress: (progress.scansRead / progress.scans) * 100,
    };
  }
  return { step: photos ? 'citim fotografiile' : 'citim documentația', progress: null };
}

// The member's own, as the ready notice: an import someone else started is theirs to finish.
export function openImportsOf(items: ImportItem[], userId: string): OpenImports {
  const groups: OpenImports = { ready: [], running: [], failed: [] };
  for (const item of items) {
    if (item.createdBy?.id !== userId) continue;
    const base = { id: item.id, kind: item.kind, name: nameOf(item), link: linkOf(item) };
    if (item.status === 'ready') {
      const toCheck = item.people?.toCheck;
      groups.ready.push({
        ...base,
        detail:
          item.kind === 'employees'
            ? toCheck === undefined
              ? 'Persoanele te așteaptă la verificare'
              : `${roCount(toCheck, 'persoană', 'persoane')} de verificat`
            : 'Propunerea e gata de verificat',
        progress: null,
        action: item.kind === 'employees' ? 'Verifică persoanele' : 'Verifică propunerea',
      });
    } else if (item.status === 'failed') {
      groups.failed.push({
        ...base,
        detail: item.failureReason ?? 'Importul s-a oprit din cauza unei erori.',
        progress: null,
        action: 'Vezi importul',
      });
    } else if (isRunning(item.status)) {
      const { step, progress } = runningStep(item);
      groups.running.push({
        ...base,
        detail: `${kindLabel(item)}: ${step}`,
        progress,
        action: null,
      });
    }
  }
  return groups;
}

export const openCount = (groups: OpenImports) =>
  groups.ready.length + groups.running.length + groups.failed.length;

const readingLabel = (count: number) => (count === 1 ? '1 se citește' : `${count} se citesc`);
const stoppedLabel = (count: number) => (count === 1 ? '1 oprit' : `${count} oprite`);

export function headline(groups: OpenImports) {
  if (groups.ready.length > 0) return `${groups.ready.length} de verificat`;
  if (groups.running.length > 0) return readingLabel(groups.running.length);
  return stoppedLabel(groups.failed.length);
}

export function accessibleName(groups: OpenImports) {
  const parts = [
    groups.ready.length > 0 ? `${groups.ready.length} de verificat` : null,
    groups.running.length > 0 ? readingLabel(groups.running.length) : null,
    groups.failed.length > 0 ? stoppedLabel(groups.failed.length) : null,
  ].filter(Boolean);
  return `Importuri: ${parts.join(', ')}`;
}
