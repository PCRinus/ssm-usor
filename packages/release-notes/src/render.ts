import { clean, emptySections, hasItems, iconLabel, sectionTitles, whereLabel } from './dialect.js';
import type { Update, UpdateFeature, UpdateSections } from './types.js';

export interface ReleaseBodyInput {
  headline?: string | null;
  lead?: string | null;
  blocks: UpdateSections[];
  trailer?: string;
}

export function renderUpdate(update: Update): string {
  const lead = update.lead === null ? '' : clean(update.lead);
  const parts = [
    lead === '' ? `# ${clean(update.headline)}` : `# ${clean(update.headline)}\n${lead}`,
  ];
  if (update.features.length > 0) {
    parts.push(`## ${sectionTitles.features}\n${update.features.map(renderFeature).join('\n\n')}`);
  }
  if (update.improvements.length > 0) {
    parts.push(`## ${sectionTitles.improvements}\n${renderList(update.improvements)}`);
  }
  if (update.fixes.length > 0) {
    parts.push(`## ${sectionTitles.fixes}\n${renderList(update.fixes)}`);
  }
  return parts.join('\n\n');
}

function renderFeature(feature: UpdateFeature): string {
  const lines = [`### ${clean(feature.title)}`, clean(feature.text)];
  if (feature.where !== null) lines.push(`${whereLabel} ${clean(feature.where)}`);
  if (feature.icon !== null) lines.push(`${iconLabel} ${feature.icon.trim()}`);
  return lines.join('\n');
}

function renderList(items: string[]): string {
  return items.map((item) => `- ${clean(item)}`).join('\n');
}

export function assembleReleaseBody(input: ReleaseBodyInput): string {
  const sections = mergeSections(input.blocks);
  const trailer = input.trailer?.trim() ?? '';
  const rule = trailer === '' ? '' : `---\n\n${trailer}`;
  if (!hasItems(sections)) return rule;

  const update: Update = {
    headline: clean(input.headline ?? '') || fallbackHeadline(sections),
    lead: clean(input.lead ?? '') || null,
    ...sections,
  };
  const text = renderUpdate(update);
  return rule === '' ? text : `${text}\n\n${rule}`;
}

function mergeSections(blocks: UpdateSections[]): UpdateSections {
  const merged = emptySections();
  for (const block of blocks) {
    merged.features.push(...block.features);
    merged.improvements.push(...block.improvements);
    merged.fixes.push(...block.fixes);
  }
  return merged;
}

function fallbackHeadline(sections: UpdateSections): string {
  return clean(sections.features[0]?.title ?? sections.improvements[0] ?? sections.fixes[0] ?? '');
}
