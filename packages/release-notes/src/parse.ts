import { blockTitle, foldKey, hasItems, type Line, sectionOf, toLines } from './dialect.js';
import { SectionCollector } from './sections.js';
import type { ParseError, PullRequestBlockResult, ReleaseBodyResult } from './types.js';

const knownSections = '## Ce e nou, ## Îmbunătățiri and ## Remedieri';

export function parseReleaseBody(body: string): ReleaseBodyResult {
  const lines = toLines(body);
  // The developer list of pull requests follows the rule and is never parsed.
  const ruleIndex = lines.findIndex((line) => line.token.kind === 'rule');
  const region = ruleIndex === -1 ? lines : lines.slice(0, ruleIndex);

  const collector = new SectionCollector();
  const errors: ParseError[] = [];
  let headline: { line: number; text: string } | null = null;
  let firstSection: number | null = null;
  const lead: string[] = [];

  for (const line of region) {
    const { token } = line;
    if (token.kind === 'heading' && token.level === 1) {
      if (headline !== null) {
        errors.push({ line: line.number, message: 'A second # headline; a release has one.' });
      } else {
        if (token.title === '')
          errors.push({ line: line.number, message: 'The headline is empty.' });
        if (collector.started) {
          errors.push({
            line: line.number,
            message: 'The # headline must come before the sections.',
          });
        }
        headline = { line: line.number, text: token.title };
      }
      continue;
    }
    if (token.kind === 'heading' && token.level === 2) {
      const section = sectionOf(token.title);
      if (section === null) {
        errors.push({
          line: line.number,
          message: `Unknown section "## ${token.title}"; the sections are ${knownSections}.`,
        });
        collector.openUnknown();
      } else {
        firstSection ??= line.number;
        collector.open(section, line.number);
      }
      continue;
    }
    if (collector.started) {
      collector.accept(line);
    } else if (headline === null) {
      if (token.kind !== 'blank') {
        errors.push({ line: line.number, message: 'Text before the # headline.' });
      }
    } else {
      acceptLeadLine(line, lead, errors);
    }
  }
  collector.finish();

  if (headline === null && firstSection === null) return { kind: 'silent' };

  errors.push(...collector.errors);
  if (headline === null) {
    errors.push({
      line: firstSection!,
      message: 'A release needs a headline: a # line before the sections.',
    });
  } else if (!hasItems(collector.sections) && collector.errors.length === 0) {
    errors.push({
      line: headline.line,
      message: `The release has a headline but no items under ${knownSections}.`,
    });
  }
  if (errors.length > 0 || headline === null) return invalid(errors);

  const source = region
    .map((line) => line.raw)
    .join('\n')
    .trim();
  return {
    kind: 'update',
    update: {
      headline: headline.text,
      lead: lead.length > 0 ? lead.join(' ') : null,
      ...collector.sections,
    },
    source,
  };
}

function acceptLeadLine(line: Line, lead: string[], errors: ParseError[]): void {
  const { token } = line;
  switch (token.kind) {
    case 'text':
      lead.push(token.text);
      return;
    case 'item':
      errors.push({
        line: line.number,
        message: 'The lead is a paragraph; list items go under ## Îmbunătățiri or ## Remedieri.',
      });
      return;
    case 'heading':
      errors.push({ line: line.number, message: 'A feature goes under ## Ce e nou.' });
      return;
    case 'fence':
      errors.push({ line: line.number, message: 'A code block is not part of an update.' });
      return;
  }
}

export function parsePullRequestBlock(prBody: string): PullRequestBlockResult {
  const lines = toLines(prBody);
  const starts = lines.filter(isBlockHeading);
  const start = starts[0];
  if (start === undefined) return { kind: 'none' };

  const collector = new SectionCollector();
  const errors: ParseError[] = [];
  let reportedReleaseText = false;
  let end = lines.length;

  for (let index = start.number; index < lines.length; index++) {
    const line = lines[index]!;
    const { token } = line;
    if (token.kind === 'rule') {
      end = index;
      break;
    }
    if (token.kind === 'heading' && token.level === 2) {
      const section = sectionOf(token.title);
      if (section === null) {
        end = index;
        break;
      }
      collector.open(section, line.number);
      continue;
    }
    const isReleaseText =
      (token.kind === 'heading' && token.level === 1) ||
      (!collector.started && token.kind !== 'blank');
    if (isReleaseText) {
      if (!reportedReleaseText) {
        errors.push({
          line: line.number,
          message: `The headline and the lead belong to the release; a pull request's block holds only ${knownSections}.`,
        });
        reportedReleaseText = true;
      }
      continue;
    }
    collector.accept(line);
  }
  collector.finish();

  errors.push(...collector.errors);
  const second = starts.find((line) => line.number > end);
  if (second !== undefined) {
    errors.push({
      line: second.number,
      message: `A second ## ${blockTitle}; the first is on line ${start.number}.`,
    });
  }
  if (!hasItems(collector.sections) && errors.length === 0) {
    errors.push({ line: start.number, message: `The ## ${blockTitle} block has no items.` });
  }
  if (errors.length > 0) return invalid(errors);
  return { kind: 'block', sections: collector.sections };
}

function isBlockHeading(line: Line): boolean {
  return (
    line.token.kind === 'heading' &&
    line.token.level === 2 &&
    foldKey(line.token.title) === blockTitle
  );
}

function invalid(errors: ParseError[]): { kind: 'invalid'; errors: ParseError[] } {
  return { kind: 'invalid', errors: [...errors].sort((a, b) => a.line - b.line) };
}
