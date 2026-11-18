import { countNoun, countOf, type DocumentSet } from '@ssm-usor/contracts';

import { keepOpener } from '@/app/opener';

import type { SectionIdOf } from './document-sections';
import { documentsLink } from './document-sets';
import type { DocumentStatus, Pack, PackSection, StatusCounts } from './pack-status';

export const statusOrder: readonly DocumentStatus[] = ['issued', 'update', 'draft', 'missing'];

export const contentsLabel = 'Cuprinsul documentației';

export const archivedHint = 'Clientul este arhivat, așa că nu i se mai generează documente.';

export const documentCountLabel = (count: number) => countOf(count, 'document', 'documente');

export const sectionCountLabel = (count: number) => countOf(count, 'secțiune', 'secțiuni');

const statusNouns: Record<DocumentStatus, [string, string]> = {
  issued: ['emis', 'emise'],
  update: ['de actualizat', 'de actualizat'],
  draft: ['ciornă', 'ciorne'],
  missing: ['negenerat', 'negenerate'],
};

export function statusNoun(status: DocumentStatus, count: number) {
  const [one, many] = statusNouns[status];
  return status === 'update' ? one : countNoun(count, one, many);
}

export const statusCountLabel = (status: DocumentStatus, count: number) =>
  `${count} ${statusNoun(status, count)}`;

export const totalOf = (counts: StatusCounts) =>
  counts.issued + counts.update + counts.draft + counts.missing;

export const isEmptyPack = (pack: Pack) =>
  pack.counts.issued + pack.counts.update + pack.counts.draft === 0;

export const packTotalLabel = (pack: Pack) =>
  `${documentCountLabel(totalOf(pack.counts))} în ${sectionCountLabel(pack.sections.length)}`;

export const legendStatuses = (counts: StatusCounts) =>
  statusOrder.filter((status) => status === 'issued' || status === 'draft' || counts[status] > 0);

export const packBarLabel = (counts: StatusCounts) =>
  `${legendStatuses(counts)
    .map((status) => statusCountLabel(status, counts[status]))
    .join(', ')}, din ${documentCountLabel(totalOf(counts))}`;

export type CaptionPart = { text: string; tone: 'plain' | 'warning' };

const singleStatus: Record<DocumentStatus, CaptionPart> = {
  issued: { text: 'Emis', tone: 'plain' },
  draft: { text: 'Ciornă', tone: 'plain' },
  update: { text: 'De actualizat', tone: 'warning' },
  missing: { text: 'Negenerat', tone: 'plain' },
};

export function sectionCaption(section: PackSection): CaptionPart[] {
  const { counts } = section;
  const total = totalOf(counts);
  if (total === 1) return [singleStatus[statusOrder.find((status) => counts[status] > 0)!]];
  return [
    {
      text: counts.issued === total ? 'Toate emise' : `${counts.issued} din ${total} emise`,
      tone: 'plain' as const,
    },
    counts.update > 0 && { text: statusCountLabel('update', counts.update), tone: 'warning' },
    counts.missing > 0 && { text: statusCountLabel('missing', counts.missing), tone: 'plain' },
  ].filter((part): part is CaptionPart => part !== false);
}

export const emptySectionCaption = (section: PackSection) => {
  const total = totalOf(section.counts);
  return `${documentCountLabel(total)}, ${total === 1 ? 'negenerat' : 'negenerate'}`;
};

export const sectionLabel = (section: Pick<PackSection, 'number' | 'title'>) =>
  section.number === null ? section.title : `${section.number}. ${section.title}`;

export const sectionLink = (set: DocumentSet, clientId: string, section?: PackSection) => ({
  ...documentsLink(set, clientId, section?.id as SectionIdOf<DocumentSet> | undefined),
  state: keepOpener,
});

export function nextSection(pack: Pack, section: PackSection) {
  const index = pack.sections.findIndex((each) => each.id === section.id);
  return index === -1 ? undefined : pack.sections[index + 1];
}

export function shownSection(pack: Pack, sectionId: string | undefined, wide: boolean) {
  const named = pack.sections.find((section) => section.id === sectionId);
  return named ?? (wide ? pack.sections[0] : undefined);
}
