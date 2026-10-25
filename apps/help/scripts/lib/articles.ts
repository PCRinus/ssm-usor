import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import GithubSlugger, { slug } from 'github-slugger';
import { parse } from 'yaml';

export const topicIdPattern = /^[a-z0-9-]+\.[a-z0-9-]+$/;

export interface ArticleTopic {
  id: string;
  heading: string;
}

export interface Article {
  /** Relative to the docs directory, with forward slashes. */
  file: string;
  /** The page's address on the help site, with a trailing slash. */
  path: string;
  topics: ArticleTopic[];
  sources: string[];
  headings: { text: string; anchor: string }[];
}

export interface HelpTopicTarget {
  path: string;
  anchor: string;
}

export class ArticleError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ArticleError';
  }
}

function splitFrontMatter(source: string): { data: unknown; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  return { data: parse(match[1] ?? '') ?? {}, body: source.slice(match[0].length) };
}

function plainText(inline: string): string {
  return inline
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!~|<>])/g, '$1')
    .trim();
}

// Astro's Markdown pipeline gives each heading github-slugger's slug of its text, one slugger per
// page, so a repeated heading gets a numbered anchor. Page titles are not part of the body.
export function headingsOf(body: string): { text: string; anchor: string }[] {
  const slugger = new GithubSlugger();
  const headings: { text: string; anchor: string }[] = [];
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? '';
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (!heading) continue;
    const text = plainText(heading[1] ?? '');
    headings.push({ text, anchor: slugger.slug(text) });
  }
  return headings;
}

function pagePath(file: string, data: Record<string, unknown>): string {
  const slugPath =
    typeof data.slug === 'string'
      ? data.slug
      : file
          .replace(/\.mdx?$/, '')
          .split('/')
          .map((segment) => slug(segment))
          .join('/')
          .replace(/(^|\/)index$/, '');
  return slugPath ? `/${slugPath}/` : '/';
}

function stringList(value: unknown, field: string, file: string, problems: string[]): unknown[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  problems.push(`${file}: \`${field}\` must be a list.`);
  return [];
}

export function parseArticle(file: string, source: string): Article {
  const problems: string[] = [];
  const { data: rawData, body } = splitFrontMatter(source);
  const data = (rawData && typeof rawData === 'object' ? rawData : {}) as Record<string, unknown>;

  const topics: ArticleTopic[] = [];
  for (const entry of stringList(data.topics, 'topics', file, problems)) {
    const topic = entry as Partial<Record<keyof ArticleTopic, unknown>> | null;
    if (typeof topic?.id !== 'string' || typeof topic.heading !== 'string') {
      problems.push(`${file}: every topic needs an \`id\` and a \`heading\`.`);
      continue;
    }
    topics.push({ id: topic.id, heading: topic.heading });
  }

  const sources: string[] = [];
  for (const entry of stringList(data.sources, 'sources', file, problems)) {
    if (typeof entry === 'string') sources.push(entry);
    else problems.push(`${file}: every source must be a path or a glob.`);
  }

  if (problems.length) throw new ArticleError(problems);
  return { file, path: pagePath(file, data), topics, sources, headings: headingsOf(body) };
}

export function readArticles(docsDirectory: string): Article[] {
  const articles: Article[] = [];
  const problems: string[] = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
        const file = relative(docsDirectory, full).split(sep).join('/');
        try {
          articles.push(parseArticle(file, readFileSync(full, 'utf8')));
        } catch (error) {
          if (error instanceof ArticleError) problems.push(...error.problems);
          else throw error;
        }
      }
    }
  }
  visit(docsDirectory);
  if (problems.length) throw new ArticleError(problems);
  return articles.sort((a, b) => a.file.localeCompare(b.file));
}

export function collectTopics(articles: Article[]): Record<string, HelpTopicTarget> {
  const problems: string[] = [];
  const topics = new Map<string, HelpTopicTarget & { file: string }>();
  for (const article of articles) {
    for (const topic of article.topics) {
      if (!topicIdPattern.test(topic.id)) {
        problems.push(
          `${article.file}: topic id "${topic.id}" does not match area.slug (lowercase letters, digits and hyphens).`
        );
        continue;
      }
      const existing = topics.get(topic.id);
      if (existing) {
        problems.push(
          `${article.file}: topic id "${topic.id}" is already listed by ${existing.file}.`
        );
        continue;
      }
      const heading = article.headings.find((candidate) => candidate.text === topic.heading.trim());
      if (!heading) {
        problems.push(
          `${article.file}: topic "${topic.id}" names the heading "${topic.heading}", which the article does not have.`
        );
        continue;
      }
      topics.set(topic.id, { path: article.path, anchor: heading.anchor, file: article.file });
    }
  }
  if (problems.length) throw new ArticleError(problems);
  return Object.fromEntries(
    [...topics.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, { path, anchor }]) => [id, { path, anchor }])
  );
}

export function renderTopicsModule(topics: Record<string, HelpTopicTarget>): string {
  const entries = Object.entries(topics)
    .map(
      ([id, { path, anchor }]) =>
        `  ${JSON.stringify(id)}: { path: ${JSON.stringify(path)}, anchor: ${JSON.stringify(anchor)} },\n`
    )
    .join('');
  return [
    '// Generated by `pnpm generate:help-topics` from the front matter of the help articles. Do not edit.',
    '',
    `export const helpTopics = {${entries ? `\n${entries}` : ''}} as const;`,
    '',
    'export type HelpTopic = keyof typeof helpTopics;',
    '',
  ].join('\n');
}
