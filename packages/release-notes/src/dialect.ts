import type { ItemCounts, UpdateSections } from './types.js';

export type SectionKey = keyof UpdateSections;

export const sectionTitles: Record<SectionKey, string> = {
  features: 'Ce e nou',
  improvements: 'Îmbunătățiri',
  fixes: 'Remedieri',
};

export const blockTitle = 'Actualizări';
export const whereLabel = 'Unde o găsești:';
export const iconLabel = 'Pictogramă:';

export type Token =
  | { kind: 'blank' }
  | { kind: 'rule' }
  | { kind: 'fence' }
  | { kind: 'fenced' }
  | { kind: 'heading'; level: number; title: string }
  | { kind: 'item'; text: string }
  | { kind: 'text'; text: string };

export interface Line {
  number: number;
  raw: string;
  token: Token;
}

const headingPattern = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const rulePattern = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const itemPattern = /^ {0,3}[-*](?:[ \t]+(.*))?$/;
const fenceOpenPattern = /^ {0,3}(`{3,}|~{3,})/;
const fenceClosePattern = /^ {0,3}(`{3,}|~{3,})$/;

export function toLines(body: string): Line[] {
  let fence: string | null = null;
  return body
    .normalize('NFC')
    .split(/\r\n?|\n/)
    .map((raw, index) => {
      const text = raw.trimEnd();
      let token: Token;
      if (fence !== null) {
        const close = fenceClosePattern.exec(text)?.[1];
        if (close && close[0] === fence[0] && close.length >= fence.length) fence = null;
        token = { kind: 'fenced' };
      } else {
        const open = fenceOpenPattern.exec(text)?.[1];
        if (open) {
          fence = open;
          token = { kind: 'fence' };
        } else {
          token = classify(text);
        }
      }
      return { number: index + 1, raw, token };
    });
}

function classify(text: string): Token {
  if (text.trim() === '') return { kind: 'blank' };
  if (rulePattern.test(text)) return { kind: 'rule' };
  const heading = headingPattern.exec(text);
  if (heading) {
    return { kind: 'heading', level: heading[1]!.length, title: clean(heading[2] ?? '') };
  }
  const item = itemPattern.exec(text);
  if (item) return { kind: 'item', text: clean(item[1] ?? '') };
  return { kind: 'text', text: clean(text) };
}

export function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Some Romanian keyboard layouts still type the cedilla ş and ţ in place of the comma-below ș
// and ț; a heading or label typed with them means the same.
export function foldKey(text: string): string {
  return text.replace(/[şţŞŢ]/g, (letter) => ({ ş: 'ș', ţ: 'ț', Ş: 'Ș', Ţ: 'Ț' })[letter]!);
}

export function sectionOf(title: string): SectionKey | null {
  const key = foldKey(title);
  const section = (Object.keys(sectionTitles) as SectionKey[]).find(
    (name) => sectionTitles[name] === key
  );
  return section ?? null;
}

export function emptySections(): UpdateSections {
  return { features: [], improvements: [], fixes: [] };
}

export function countItems(sections: UpdateSections): ItemCounts {
  return {
    features: sections.features.length,
    improvements: sections.improvements.length,
    fixes: sections.fixes.length,
  };
}

export function hasItems(sections: UpdateSections): boolean {
  return sections.features.length + sections.improvements.length + sections.fixes.length > 0;
}
