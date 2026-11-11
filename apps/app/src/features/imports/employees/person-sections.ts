import type { TrainingDomain } from '@ssm-usor/contracts';
import { useEffect, useState } from 'react';

import {
  type DomainTrainings,
  type FieldName,
  type Person,
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

// The section crossing a line a little above the middle of the screen is the one being read.
export function useSectionOnScreen(sections: PhotoSection[]) {
  const [current, setCurrent] = useState<string | null>(null);
  const keys = sections.map((section) => section.key).join(' ');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const crossing = new Set<string>();
    const order = keys.split(' ');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.photoSection!;
          if (entry.isIntersecting) crossing.add(key);
          else crossing.delete(key);
        }
        const first = order.find((key) => crossing.has(key));
        if (first) setCurrent(first);
      },
      { rootMargin: '-35% 0px -55% 0px' }
    );
    for (const element of document.querySelectorAll<HTMLElement>('[data-photo-section]')) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [keys]);
  return sections.find((section) => section.key === current) ?? sections[0] ?? null;
}
