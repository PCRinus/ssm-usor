import type { TrainingDomain } from '@ssm-usor/contracts';
import { useEffect, useState } from 'react';

import {
  type Decision,
  type DomainTrainings,
  type FieldName,
  type Person,
  type Proposal,
  resolveField,
  type ReviewContext,
  type SheetPage,
} from './employee-review-model';
import { dateFields } from './person-values';
import { dateLabel, pageFileName, pageKindLabel } from './review-format';

export const pageIndex = (pages: SheetPage[], pageId: string) =>
  pages.findIndex((page) => page.id === pageId);

export const photoLabel = (pages: SheetPage[], page: SheetPage) =>
  `Fotografia ${pages.indexOf(page) + 1} din ${pages.length}, ${pageKindLabel(page)}`;

export const viewerDetail = (pages: SheetPage[], page: SheetPage) =>
  `${photoLabel(pages, page)}, ${pageFileName(page)}`;

export const orderedPhotos = (pages: SheetPage[], pageIds: Iterable<string>) =>
  [...new Set(pageIds)]
    .filter((pageId) => pageIndex(pages, pageId) !== -1)
    .sort((a, b) => pageIndex(pages, a) - pageIndex(pages, b));

export const showChoice = (name: FieldName, value: string | number) =>
  dateFields.has(name) ? (dateLabel(String(value)) ?? String(value)) : String(value);

export const fieldOfDecision = (key: string) =>
  key === 'birthDate'
    ? 'birthDate'
    : (/^(?:missing|invalid|duplicate)-(.+)$/.exec(key)?.[1] ?? null);

export const groupPhotos = (context: ReviewContext, person: Person) =>
  (Object.keys(person.fields) as FieldName[]).flatMap((name) => {
    const field = resolveField(context, person, name);
    if (field.choice) return [];
    return field.options.find((option) => option.value === field.value)?.pageIds.slice(0, 1) ?? [];
  });

export const decisionTarget = (key: string) => {
  const row = /^row-(.+)$/.exec(key)?.[1];
  if (row) return `row-${row}`;
  const test = /^test-(?:date-)?(.+)$/.exec(key)?.[1];
  return test ? `test-${test}` : null;
};

export const trainingSectionId = (domain: TrainingDomain) => `trainings-${domain}`;

export const domainPhotos = (domain: DomainTrainings) => domain.pages.map((page) => page.id);

export type PhotoSection = { key: string; photos: string[] };

export function sectionOnScreen(
  order: string[],
  crossing: ReadonlySet<string>,
  atBottom: boolean
): string | null {
  if (atBottom) return order.at(-1) ?? null;
  return order.find((key) => crossing.has(key)) ?? null;
}

const atPageBottom = () =>
  window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;

export function useSectionOnScreen(sections: PhotoSection[]) {
  const [current, setCurrent] = useState<string | null>(null);
  const keys = sections.map((section) => section.key).join(' ');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const crossing = new Set<string>();
    const order = keys.split(' ');
    const update = () => {
      const key = sectionOnScreen(order, crossing, atPageBottom());
      if (key) setCurrent(key);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.photoSection!;
          if (entry.isIntersecting) crossing.add(key);
          else crossing.delete(key);
        }
        update();
      },
      { rootMargin: '-35% 0px -55% 0px' }
    );
    for (const element of document.querySelectorAll<HTMLElement>('[data-photo-section]')) {
      observer.observe(element);
    }
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update);
    };
  }, [keys]);
  return sections.find((section) => section.key === current) ?? sections[0] ?? null;
}

export type DecisionStop = { key: string; element: HTMLElement };

export function decisionStops(
  decisions: Decision[],
  elementOf: (decision: Decision) => HTMLElement | null
): DecisionStop[] {
  return decisions
    .flatMap((decision) => {
      const element = elementOf(decision);
      return element ? [{ key: decision.key, element }] : [];
    })
    .sort((a, b) =>
      a.element === b.element
        ? 0
        : a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1
    );
}

export function nextStop(stops: DecisionStop[], last: string | null) {
  if (stops.length === 0) return null;
  const at = last === null ? -1 : stops.findIndex((stop) => stop.key === last);
  return stops[(at + 1) % stops.length]!;
}

export const ownedPages = (
  proposal: Proposal,
  moved: Record<string, { personId: string | null }>,
  personId: string
) =>
  proposal.pages.filter(
    (page) => (moved[page.id] === undefined ? page.personId : moved[page.id]!.personId) === personId
  );
