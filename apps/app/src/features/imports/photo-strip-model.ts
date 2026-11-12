import type { ReactNode } from 'react';

export type StripPhoto = {
  key: string;
  label: string;
  caption: string;
  thumb: (className: string) => ReactNode;
};

// Underlining most of the strip says nothing about where to look, so a section citing many
// photos underlines none.
export function sectionUnderlines(section: readonly string[], total: number): ReadonlySet<string> {
  return section.length > 0 && section.length <= 5 && section.length < total * 0.4
    ? new Set(section)
    : new Set();
}
