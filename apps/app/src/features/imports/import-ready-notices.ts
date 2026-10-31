import type { ImportListResponseItemsItem } from '@/api/generated/api';
import { roCount } from '@/features/employees/employee-format';

import { isRunning } from './import-format';

type ImportItem = ImportListResponseItemsItem;

export type ImportLink =
  | { to: '/clients/import/$importId'; params: { importId: string } }
  | {
      to: '/clients/$clientId/employees/import/$importId';
      params: { clientId: string; importId: string };
    };

export type ImportReadyNotice = {
  importId: string;
  tone: 'success' | 'error';
  title: string;
  description: string | null;
  action: string;
  link: ImportLink;
};

export const isMineRunning = (items: ImportItem[], userId: string) =>
  items.some((item) => item.createdBy?.id === userId && isRunning(item.status));

export function linkOf(item: ImportItem): ImportLink {
  if (item.kind === 'employees' && item.client) {
    return {
      to: '/clients/$clientId/employees/import/$importId',
      params: { clientId: item.client.id, importId: item.id },
    };
  }
  return { to: '/clients/import/$importId', params: { importId: item.id } };
}

function noticeOf(item: ImportItem): ImportReadyNotice | null {
  const name = item.client?.legalName ?? item.companyName;
  const base = { importId: item.id, link: linkOf(item) };
  if (item.status === 'failed') {
    return {
      ...base,
      tone: 'error',
      title: name ? `Importul pentru ${name} s-a oprit.` : 'Importul din documente s-a oprit.',
      description: item.failureReason,
      action: 'Vezi importul',
    };
  }
  if (item.status !== 'ready') return null;
  if (item.kind === 'employees') {
    const toCheck = item.people?.toCheck;
    return {
      ...base,
      tone: 'success',
      title: `Fișele de la ${name ?? 'client'} sunt citite.`,
      description:
        toCheck === undefined
          ? null
          : `${roCount(toCheck, 'persoană', 'persoane')} te așteaptă la verificare.`,
      action: 'Verifică persoanele',
    };
  }
  return {
    ...base,
    tone: 'success',
    title: name ? `Propunerea pentru ${name} e gata.` : 'Propunerea din documente e gata.',
    description: item.client
      ? 'Verifică datele înainte să completezi clientul.'
      : 'Verifică datele înainte să creezi clientul.',
    action: 'Verifică propunerea',
  };
}

// Only a change this tab saw happen: an import first seen already ready or failed finished while
// the app was closed, and stays on the client's page or the Clienți list.
export function importReadyNotices({
  previous,
  items,
  userId,
  watching,
  announced,
}: {
  previous: ReadonlyMap<string, string>;
  items: ImportItem[];
  userId: string;
  watching: string | null;
  announced: (importId: string) => boolean;
}) {
  const shown: ImportReadyNotice[] = [];
  const quiet: string[] = [];
  for (const item of items) {
    const was = previous.get(item.id);
    if (!was || !isRunning(was) || item.createdBy?.id !== userId) continue;
    const notice = noticeOf(item);
    if (!notice || announced(item.id)) continue;
    if (item.id === watching) quiet.push(item.id);
    else shown.push(notice);
  }
  return { shown, quiet };
}
