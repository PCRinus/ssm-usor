import {
  foldText,
  type GuidedSection,
  guidedTemplates,
  type InstructionBlock,
  type InstructionCategory,
} from '@ssm-usor/contracts';

export type DraftHeading = {
  id: string;
  kind: 'heading';
  text: string;
  // The guided template's section it opens, whose hint and example the form shows.
  section: GuidedSection | null;
};

// One paragraph a line.
export type DraftArticle = { id: string; kind: 'article'; text: string };

export type DraftBlock = DraftHeading | DraftArticle;

export type DraftBody = { blocks: InstructionBlock[] };

let lastId = 0;
const nextId = () => {
  lastId += 1;
  return `block-${lastId}`;
};

export const headingBlock = (text = '', section: GuidedSection | null = null): DraftHeading => ({
  id: nextId(),
  kind: 'heading',
  text,
  section,
});

export const articleBlock = (text = ''): DraftArticle => ({ id: nextId(), kind: 'article', text });

export function templateBlocks(category: InstructionCategory): DraftBlock[] {
  return guidedTemplates[category].flatMap((section) => [
    headingBlock(section.heading, section),
    articleBlock(),
  ]);
}

// A saved body keeps no section, so a heading that reads as one of the category's gets its hint
// and example back.
function sectionOf(text: string, category: InstructionCategory) {
  const folded = foldText(text);
  return guidedTemplates[category].find((section) => foldText(section.heading) === folded) ?? null;
}

export function blocksFromBody(
  body: { blocks: readonly InstructionBlock[] },
  category: InstructionCategory
): DraftBlock[] {
  return body.blocks.map((block) =>
    block.kind === 'heading'
      ? headingBlock(block.text, sectionOf(block.text, category))
      : articleBlock(block.paragraphs.join('\n'))
  );
}

export function articleParagraphs(text: string) {
  return text
    .split(/\r\n|[\r\n]/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter((line) => line !== '');
}

export const isEmptyArticle = (block: DraftBlock) =>
  block.kind === 'article' && articleParagraphs(block.text).length === 0;

function keptBlocks(blocks: readonly DraftBlock[]) {
  const filled: { id: string; block: InstructionBlock; fromTemplate: boolean }[] = [];
  for (const block of blocks) {
    if (block.kind === 'heading') {
      const text = block.text.replace(/\s+/gu, ' ').trim();
      if (text !== '') {
        filled.push({
          id: block.id,
          block: { kind: 'heading', text },
          fromTemplate: block.section !== null,
        });
      }
      continue;
    }
    const paragraphs = articleParagraphs(block.text);
    if (paragraphs.length > 0) {
      filled.push({ id: block.id, block: { kind: 'article', paragraphs }, fromTemplate: false });
    }
  }
  const kept: { id: string; block: InstructionBlock }[] = [];
  for (let index = filled.length - 1; index >= 0; index -= 1) {
    const { id, block, fromTemplate } = filled[index]!;
    const next = kept[0]?.block;
    const empty = block.kind === 'heading' && next?.kind !== 'article';
    if (empty && (fromTemplate || next === undefined)) continue;
    kept.unshift({ id, block });
  }
  return kept;
}

/**
 * What is saved: empty articles go, and so does a heading with no article under it, unless the
 * member wrote it above another heading, as a chapter over its sections.
 */
export function draftBody(blocks: readonly DraftBlock[]): DraftBody {
  return { blocks: keptBlocks(blocks).map(({ block }) => block) };
}

export const printedIds = (blocks: readonly DraftBlock[]) =>
  new Set(keptBlocks(blocks).map(({ id }) => id));

export const sameBody = (left: DraftBody, right: DraftBody) =>
  JSON.stringify(left) === JSON.stringify(right);

/** "Art. N" by place among the articles that hold text; an empty box is not counted. */
export function articleNumbers(blocks: readonly DraftBlock[]) {
  const numbers = new Map<string, number>();
  for (const block of blocks) {
    if (block.kind === 'article' && !isEmptyArticle(block)) {
      numbers.set(block.id, numbers.size + 1);
    }
  }
  return numbers;
}

export function sectionStart(blocks: readonly DraftBlock[], index: number) {
  for (let at = index; at >= 0; at -= 1) {
    if (blocks[at]!.kind === 'heading') return at;
  }
  return -1;
}

export function withExample(blocks: readonly DraftBlock[], headingId: string): DraftBlock[] {
  const at = blocks.findIndex((block) => block.id === headingId);
  const heading = blocks[at];
  if (!heading || heading.kind !== 'heading' || !heading.section?.example) return [...blocks];
  let end = at + 1;
  while (end < blocks.length && blocks[end]!.kind !== 'heading') end += 1;
  const example = heading.section.example;
  const emptyAt = blocks.slice(at + 1, end).findIndex(isEmptyArticle);
  if (emptyAt >= 0) {
    return blocks.map((block, index) =>
      index === at + 1 + emptyAt ? { ...block, text: example } : block
    );
  }
  return [...blocks.slice(0, end), articleBlock(example), ...blocks.slice(end)];
}

export function moveBlock(blocks: readonly DraftBlock[], id: string, by: -1 | 1) {
  const at = blocks.findIndex((block) => block.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= blocks.length) return [...blocks];
  const next = [...blocks];
  [next[at], next[to]] = [next[to]!, next[at]!];
  return next;
}

export type Neighbours = { before: string | null; after: string | null };

export function restoreBlocks(
  blocks: readonly DraftBlock[],
  removed: readonly DraftBlock[],
  neighbours: Neighbours
): DraftBlock[] {
  const missing = removed.filter((block) => !blocks.some((each) => each.id === block.id));
  if (missing.length === 0) return [...blocks];
  const alone = neighbours.before === null && neighbours.after === null;
  // The empty box that stood in for the list the deletion left with nothing.
  if (alone && blocks.length === 1 && isEmptyArticle(blocks[0]!)) return missing;
  const after = blocks.findIndex((each) => each.id === neighbours.after);
  if (after >= 0) return [...blocks.slice(0, after), ...missing, ...blocks.slice(after)];
  const before = blocks.findIndex((each) => each.id === neighbours.before);
  if (before >= 0) return insertAfter(blocks, blocks[before]!.id, missing);
  return neighbours.before === null ? [...missing, ...blocks] : [...blocks, ...missing];
}

export const restoreBlock = (
  blocks: readonly DraftBlock[],
  block: DraftBlock,
  neighbours: Neighbours
) => restoreBlocks(blocks, [block], neighbours);

export function insertAfter(blocks: readonly DraftBlock[], id: string, added: DraftBlock[]) {
  const at = blocks.findIndex((block) => block.id === id);
  return [...blocks.slice(0, at + 1), ...added, ...blocks.slice(at + 1)];
}

export type DraftSection = {
  // Null for the articles before the first heading.
  heading: DraftHeading | null;
  articles: DraftArticle[];
};

export function draftSections(blocks: readonly DraftBlock[]): DraftSection[] {
  const sections: DraftSection[] = [];
  for (const block of blocks) {
    if (block.kind === 'heading') sections.push({ heading: block, articles: [] });
    else if (sections.length === 0) sections.push({ heading: null, articles: [block] });
    else sections.at(-1)!.articles.push(block);
  }
  return sections;
}

const sectionBlocks = (sections: readonly DraftSection[]): DraftBlock[] =>
  sections.flatMap(({ heading, articles }) => (heading ? [heading, ...articles] : articles));

export function moveSection(blocks: readonly DraftBlock[], headingId: string, by: -1 | 1) {
  const sections = draftSections(blocks);
  const at = sections.findIndex(({ heading }) => heading?.id === headingId);
  const to = at + by;
  if (at < 0 || to < 0 || to >= sections.length || sections[to]!.heading === null) {
    return [...blocks];
  }
  [sections[at], sections[to]] = [sections[to]!, sections[at]!];
  return sectionBlocks(sections);
}

export function removeSection(blocks: readonly DraftBlock[], headingId: string) {
  const at = blocks.findIndex((block) => block.id === headingId);
  if (at < 0) {
    return {
      blocks: [...blocks],
      removed: [] as DraftBlock[],
      neighbours: { before: null, after: null },
    };
  }
  let end = at + 1;
  while (end < blocks.length && blocks[end]!.kind !== 'heading') end += 1;
  return {
    blocks: [...blocks.slice(0, at), ...blocks.slice(end)],
    removed: blocks.slice(at, end),
    neighbours: { before: blocks[at - 1]?.id ?? null, after: blocks[end]?.id ?? null },
  };
}

export function addSection(
  blocks: readonly DraftBlock[],
  headingId: string | null,
  heading: DraftHeading
) {
  const at = headingId === null ? -1 : blocks.findIndex((block) => block.id === headingId);
  let end = at < 0 ? blocks.length : at + 1;
  while (end < blocks.length && blocks[end]!.kind !== 'heading') end += 1;
  return [...blocks.slice(0, end), heading, articleBlock(), ...blocks.slice(end)];
}

// A heading stands for a section of the guide when it came from it, even renamed, or when its
// title reads as the section's.
function guidePlace(heading: DraftHeading, guide: readonly GuidedSection[]) {
  const title = foldText(heading.text);
  return guide.findIndex(
    (section) => section.key === heading.section?.key || foldText(section.heading) === title
  );
}

export function missingSections(blocks: readonly DraftBlock[], category: InstructionCategory) {
  const guide = guidedTemplates[category];
  const present = new Set(
    blocks.flatMap((block) => (block.kind === 'heading' ? [guidePlace(block, guide)] : []))
  );
  return guide.filter((_, index) => !present.has(index));
}

export function addGuidedSection(
  blocks: readonly DraftBlock[],
  category: InstructionCategory,
  section: GuidedSection
) {
  const guide = guidedTemplates[category];
  const place = guide.findIndex((each) => each.key === section.key);
  const heading = headingBlock(section.heading, section);
  let before: { id: string; place: number } | null = null;
  let after: { id: string; place: number } | null = null;
  for (const block of blocks) {
    if (block.kind !== 'heading') continue;
    const at = guidePlace(block, guide);
    if (at < 0) continue;
    if (at < place && (before === null || at >= before.place)) before = { id: block.id, place: at };
    if (at > place && (after === null || at < after.place)) after = { id: block.id, place: at };
  }
  if (before || !after) {
    return { blocks: addSection(blocks, before?.id ?? null, heading), headingId: heading.id };
  }
  const at = blocks.findIndex((block) => block.id === after.id);
  return {
    blocks: [...blocks.slice(0, at), heading, articleBlock(), ...blocks.slice(at)],
    headingId: heading.id,
  };
}

export function insertHeadingAfter(
  blocks: readonly DraftBlock[],
  articleId: string,
  heading: DraftHeading
) {
  const at = blocks.findIndex((block) => block.id === articleId);
  if (at < 0) return [...blocks];
  const next = blocks[at + 1];
  const added =
    next === undefined || next.kind === 'heading' ? [heading, articleBlock()] : [heading];
  return insertAfter(blocks, articleId, added);
}

const companyForms =
  /(?:^| )(?:s ?r ?l(?: ?d)?|s ?a|p ?f ?a|i ?i|i ?f|s ?n ?c|s ?c ?s|s ?c ?a|r ?a)$/u;
const companyPrefix = /^s ?c (?=\S)/u;

// "S.R.L." and "SRL" fold apart ("s r l", "srl"); letters standing alone are joined.
const squeeze = (folded: string) =>
  folded.replace(/(?<=^| )\p{L}(?: \p{L})+(?= |$)/gu, (letters) => letters.replaceAll(' ', ''));

export type ClientName = { id: string; legalName: string };

export type ClientPattern = { client: ClientName; folded: string };

// A name of one word ("BIROU SRL") is looked for with its company form, so that the word alone
// in an instruction does not read as the client.
export function clientPatterns(clients: readonly ClientName[]): ClientPattern[] {
  return clients.flatMap((client) => {
    const full = squeeze(foldText(client.legalName));
    let core = full.replace(companyPrefix, '');
    while (companyForms.test(core)) core = core.replace(companyForms, '').trim();
    const folded = core.includes(' ') && core.length >= 5 ? core : full;
    return folded.length >= 4 ? [{ client, folded }] : [];
  });
}

export function clientsNamedIn(text: string, patterns: readonly ClientPattern[]) {
  const folded = ` ${squeeze(foldText(text))} `;
  return patterns
    .filter((pattern) => folded.includes(` ${pattern.folded} `))
    .map((pattern) => pattern.client);
}

export const endSentence = (text: string) => (/[.!?]$/u.test(text) ? text : `${text}.`);
