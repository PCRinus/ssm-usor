import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import PizZip from 'pizzip';

import { type PatchProblem, patchQuote, type QuotePatch } from '../src/quote-patch';
import {
  applyQuotePlan,
  type QuoteReplacement,
  type QuoteReplacementSummary,
  replaceQuote,
  summaryMarkdown,
} from '../src/quote-replacement';
import {
  nextTemplateChange,
  type TemplateChange,
  templateChangeProblems,
} from '../src/template-change';
import { decode, paragraphsOf } from '../src/text';
import { buildCitationIndex, serializeIndex, templateSources } from './template-sources';

interface LegalChange {
  /** The manifest entry of every template the change reaches; left as it is without one. */
  change?: { note: string; resolves?: TemplateChange['resolves'] };
}

/** The whole passage in its current wording: the one-time review of the drift. */
export type PassageInput = QuoteReplacement & LegalChange;
/** The law's own change, old words → new words: what the scheduled fix applies. */
export type PatchInput = QuotePatch & LegalChange;
export type LegalQuoteInput = PassageInput | PatchInput;

export type LegalQuoteResult =
  | {
      status: 'applied';
      /** Paths relative to the templates folder. */
      written: string[];
      summary: QuoteReplacementSummary;
      /** The templates the same change reached through copied-passages.json. */
      copies: string[];
      markdown: string;
    }
  | { status: 'needs-review'; problems: PatchProblem[]; markdown: string };

/** A manifest's text at the last release, by its path in the templates folder; null if absent. */
export type ReleasedManifest = (path: string) => string | null;

const releaseTag = /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/;

// Production registers the templates when a release is deployed, tagged 2026.11.12 or
// 2026.11.12.2 (deploy-production.yml): an entry that differs from the last tag's is pending.
export function releasedManifestAt(ref?: string): ReleasedManifest {
  const cwd = fileURLToPath(new URL('../templates/', import.meta.url));
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const tag =
    ref ??
    git('tag', '--list')
      .split('\n')
      .filter((name) => releaseTag.test(name))
      .sort((a, b) => {
        const [x, y] = [a, b].map((name) => name.split('.').map(Number));
        for (let index = 0; index < 4; index += 1) {
          const difference = (x![index] ?? 0) - (y![index] ?? 0);
          if (difference) return difference;
        }
        return 0;
      })
      .at(-1);
  if (!tag) throw new Error('No release tag to compare the manifests with; pass --released.');
  return (path) => {
    try {
      return git('show', `${tag}:./${path}`);
    } catch {
      return null;
    }
  };
}

interface CopiedPassage {
  template: string;
  from: string;
  first: string;
  last: string;
}

const dictionaryUrl = new URL('import/wording.ro.json', import.meta.url);

const documentXml = (source: Uint8Array) =>
  new PizZip(source).file('word/document.xml')?.asText() ?? '';

/**
 * A copied passage's paragraphs, as indices among every `<w:p>`, found the way the import and
 * `copied-passages.test.ts` find them: in the body outside tables, by the raw text of the runs.
 */
export function copiedPassageRange(source: Uint8Array, first: string, last: string) {
  const xml = documentXml(source);
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(
    (table) => [table.index, table.index + table[0].length] as const
  );
  const body = paragraphsOf(xml)
    .map((paragraph, index) => ({ paragraph, index }))
    .filter(
      ({ paragraph }) => !tables.some(([s, e]) => paragraph.offset > s && paragraph.offset < e)
    )
    .map(({ paragraph, index }) => ({
      index,
      text: decode(
        [...paragraph.xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')
      ),
    }));
  const start = body.findIndex(({ text }) => new RegExp(first, 'u').test(text));
  if (start === -1) return null;
  const end = body.findIndex((each, at) => at >= start && new RegExp(last, 'u').test(each.text));
  if (end === -1) return null;
  return { start: body[start]!.index, end: body[end]!.index, texts: body.slice(start, end + 1) };
}

function recordChange(manifestText: string, file: string, change: TemplateChange) {
  const manifest = JSON.parse(manifestText) as { templates: { file: string; change: unknown }[] };
  const entry = manifest.templates.find((each) => each.file === file);
  if (!entry) throw new Error(`No manifest entry for ${file}.`);
  entry.change = change;
  const rewritten = `${JSON.stringify(manifest, null, 2)}\n`;

  // The rest of the manifest keeps its own layout, which Prettier set; only the entry's change
  // is written anew.
  const fileAt = manifestText.indexOf(`"file": ${JSON.stringify(file)}`);
  const key = fileAt === -1 ? -1 : manifestText.indexOf('"change":', fileAt);
  if (key === -1) return rewritten;
  const open = manifestText.indexOf('{', key);
  let depth = 0;
  let inString = false;
  let close = open;
  for (; close < manifestText.length; close += 1) {
    const char = manifestText[close]!;
    if (inString) {
      if (char === '\\') close += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) break;
  }
  const indent = /[^\S\n]*$/.exec(manifestText.slice(0, key))![0];
  const value = JSON.stringify(change, null, 2).replace(/\n/g, `\n${indent}`);
  const text = manifestText.slice(0, open) + value + manifestText.slice(close + 1);
  return JSON.stringify(JSON.parse(text)) === JSON.stringify(manifest) ? text : rewritten;
}

const manifestOf = (file: string) => {
  const slash = file.lastIndexOf('/');
  return { folder: file.slice(0, slash + 1), name: file.slice(slash + 1) };
};

function changeOf(
  manifests: Map<string, string>,
  released: ReleasedManifest,
  path: string,
  change: TemplateChange
) {
  const { folder, name } = manifestOf(path);
  const manifest = `${folder}manifest.json`;
  const entryOf = (text: string | null | undefined) =>
    text
      ? (
          JSON.parse(text) as { templates: { file: string; change: TemplateChange }[] }
        ).templates.find((entry) => entry.file === name)?.change
      : undefined;
  const current = entryOf(manifests.get(manifest));
  if (!current) throw new Error(`No manifest entry for ${path}.`);
  return {
    manifest,
    name,
    change: nextTemplateChange(current, entryOf(released(manifest)), change),
  };
}

export function replaceLegalQuote(
  templates: URL,
  input: LegalQuoteInput,
  released: ReleasedManifest = releasedManifestAt()
): LegalQuoteResult {
  const read = (file: string) => new Uint8Array(readFileSync(new URL(file, templates)));
  const { words: dictionary } = JSON.parse(readFileSync(dictionaryUrl, 'utf8')) as {
    words: Record<string, string>;
  };
  const acts = JSON.parse(readFileSync(new URL('legal-acts.json', templates), 'utf8')) as {
    acts: { id: string; name: string }[];
  };
  const actIds = new Set(acts.acts.map((act) => act.id));
  let change: TemplateChange | undefined;
  if (input.change) {
    const { note, resolves } = input.change;
    change = resolves ? { kind: 'legal', note, resolves } : { kind: 'legal', note };
    const problems = templateChangeProblems(change, actIds);
    if (problems.length) throw new Error(`The change cannot be recorded: ${problems.join('; ')}.`);
  }

  const file = input.citation.file;
  const original = read(file);
  let replaced: ReturnType<typeof replaceQuote>;
  if ('changes' in input) {
    const patched = patchQuote(original, input, { dictionary });
    if (patched.status === 'needs-review') {
      return {
        status: 'needs-review',
        problems: patched.problems,
        markdown: [
          `**${file}**: ${acts.acts.find((act) => act.id === input.citation.act)?.name ?? input.citation.act}, ${input.citation.locator} needs a person:`,
          '',
          ...patched.problems.map(
            (problem) => `- ${problem.alineat ? `(${problem.alineat}) ` : ''}${problem.reason}`
          ),
        ].join('\n'),
      };
    }
    replaced = patched;
  } else {
    replaced = replaceQuote(original, input, { dictionary });
  }
  const outputs = new Map<string, Uint8Array>();
  if (replaced.source !== original) outputs.set(file, replaced.source);

  const { passages } = JSON.parse(
    readFileSync(new URL('copied-passages.json', templates), 'utf8')
  ) as { passages: CopiedPassage[] };
  const quoteStart = replaced.quote.paragraph;
  const quoteEnd = quoteStart + replaced.plan.paragraphs.length - 1;
  for (const passage of outputs.size ? passages : []) {
    if (passage.from !== file && passage.template !== file) continue;
    const other = passage.from === file ? passage.template : passage.from;
    const here = copiedPassageRange(original, passage.first, passage.last);
    if (!here || here.end < quoteStart || here.start > quoteEnd) continue;
    if (here.start > quoteStart || here.end < quoteEnd) {
      throw new Error(
        `${file}: the quote runs past the passage /${passage.first}/ … /${passage.last}/ copied with ${other}; change both by hand.`
      );
    }
    const copy = outputs.get(other) ?? read(other);
    const there = copiedPassageRange(copy, passage.first, passage.last);
    if (!there) throw new Error(`${other} has no passage /${passage.first}/ … /${passage.last}/.`);
    const updated = applyQuotePlan(copy, there.start + (quoteStart - here.start), replaced.plan);
    const after = [
      copiedPassageRange(replaced.source, passage.first, passage.last),
      copiedPassageRange(updated, passage.first, passage.last),
    ];
    if (
      !after[0] ||
      !after[1] ||
      JSON.stringify(after[0].texts.map((each) => each.text)) !==
        JSON.stringify(after[1].texts.map((each) => each.text))
    ) {
      throw new Error(
        `${other}: the copy of /${passage.first}/ … /${passage.last}/ no longer reads as ${file}; update copied-passages.json or both templates by hand.`
      );
    }
    outputs.set(other, updated);
  }

  const manifests = new Map<string, string>();
  for (const path of change ? outputs.keys() : []) {
    const { folder } = manifestOf(path);
    const manifest = `${folder}manifest.json`;
    if (!manifests.has(manifest)) {
      manifests.set(manifest, readFileSync(new URL(manifest, templates), 'utf8'));
    }
    const next = changeOf(manifests, released, path, change!);
    const problems = templateChangeProblems(next.change, actIds);
    if (problems.length) {
      throw new Error(`${path}: the change joined to the pending one: ${problems.join('; ')}.`);
    }
    manifests.set(manifest, recordChange(manifests.get(manifest)!, next.name, next.change));
  }

  for (const [path, bytes] of outputs) writeFileSync(new URL(path, templates), bytes);
  const written = [...outputs.keys()];
  if (written.length) {
    writeFileSync(
      new URL('citations.json', templates),
      serializeIndex(buildCitationIndex(templateSources(templates)))
    );
    written.push('citations.json');
  }
  for (const [manifest, text] of manifests) {
    writeFileSync(new URL(manifest, templates), text);
    written.push(manifest);
  }

  const copies = [...outputs.keys()].filter((path) => path !== file);
  const markdown = [
    summaryMarkdown(replaced.summary),
    ...(copies.length
      ? ['', `The same change in the copy of the passage: ${copies.join(', ')}.`]
      : []),
  ].join('\n');
  return { status: 'applied', written, summary: replaced.summary, copies, markdown };
}
