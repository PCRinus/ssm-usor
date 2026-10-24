import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import type { Article, HelpTopicTarget } from './articles';

function decodeAttribute(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function idsInHtml(html: string): Set<string> {
  return new Set(
    [...html.matchAll(/\sid="([^"]*)"/g)].map((match) => decodeAttribute(match[1] ?? ''))
  );
}

export function missingAnchors(
  topics: Record<string, HelpTopicTarget>,
  readPage: (path: string) => string | undefined
): string[] {
  const problems: string[] = [];
  for (const [id, { path, anchor }] of Object.entries(topics)) {
    const html = readPage(path);
    if (html === undefined) problems.push(`Topic "${id}": the built site has no page at ${path}.`);
    else if (!idsInHtml(html).has(anchor)) {
      problems.push(`Topic "${id}": the page ${path} has no heading with the id "${anchor}".`);
    }
  }
  return problems;
}

// Pagefind writes its index and fragments gzipped.
export function readBuiltText(file: string): string {
  const bytes = readFileSync(file);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzipSync(bytes).toString('utf8');
  return bytes.toString('utf8');
}

export function builtTextFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...builtTextFiles(full));
    else if (/\.(html|js|json|pf_fragment|pf_index|pf_meta)$/.test(entry.name)) files.push(full);
  }
  return files;
}

export function leakedMetadata(
  articles: Article[],
  files: { name: string; text: string }[]
): string[] {
  const values = articles.flatMap((article) => [
    ...article.topics.map((topic) => ({ article: article.file, value: topic.id })),
    ...article.sources.map((source) => ({ article: article.file, value: source })),
  ]);
  const problems: string[] = [];
  for (const { article, value } of values) {
    for (const file of files) {
      if (file.text.includes(value)) {
        problems.push(`${file.name} shows "${value}" from the front matter of ${article}.`);
      }
    }
  }
  return problems;
}
