import { clip, codeBlock, diffBlock, type DiscordMessage, noPreview } from '@ssm-usor/discord';

import { changeKey, type ChangePassage, type OpenChange } from './changes';
import type { Reading } from './model';

export interface LineChange {
  kind: 'changed' | 'added' | 'removed';
  paragraph: number;
  before: string | null;
  after: string | null;
}

export interface AppliedQuote {
  file: string;
  locator: string;
  changes: LineChange[];
  notes: string[];
  copies: string[];
  markdown: string;
}

export interface Problem {
  file: string;
  locator: string;
  reasons: string[];
}

const portalPage = (portalId: number) =>
  `https://legislatie.just.ro/Public/DetaliiDocument/${portalId}`;

export const markerOf = (change: OpenChange) => `<!-- legislation-change: ${changeKey(change)} -->`;

const formOf = (change: OpenChange) => `${change.act.name}, form of ${change.consolidatedOn}`;

const linked = (name: string, portalId: number | null) =>
  portalId === null ? name : `[${name}](${portalPage(portalId)})`;

const readable = (label: string) =>
  (label.charAt(0).toLowerCase() + label.slice(1)).replaceAll('Art.', 'art.');

const ourDiff = (quote: AppliedQuote) =>
  diffBlock(quote.changes.map((line) => ({ before: line.before ?? '', after: line.after ?? '' })));

const lawDiff = (passages: ChangePassage[]) =>
  diffBlock(
    [...new Map(passages.map((passage) => [passage.unit_label, passage])).values()].map(
      (passage) => ({ before: passage.old_text ?? '', after: passage.new_text ?? '' })
    )
  );

function lawSection(change: OpenChange, title: string | null) {
  const changed = change.passages.filter((passage) => passage.status !== 'missing');
  return [
    "## The law's change",
    '',
    `- Act: ${linked(change.act.name, change.act.portalId)}${title ? `, ${title}` : ''}`,
    `- Consolidated form of ${change.consolidatedOn}, compared with ${change.comparedWith ?? 'no verified form'}`,
    `- Amending ${change.amendingActs.length > 1 ? 'acts' : 'act'}: ${
      change.amendingActs.map((act) => linked(act.name, act.portalId)).join(', ') ||
      'not named by the portal'
    }`,
    `- Amended units: ${change.amendedUnits.join(', ') || 'none named'}`,
    ...(changed.length ? ['', lawDiff(changed)] : []),
  ];
}

export function pullTitle(change: OpenChange) {
  return `fix(templates): quote ${change.act.name} in its form of ${change.consolidatedOn}`;
}

export function updateItem(change: OpenChange, documents: string[], units: string[]) {
  const where = documents.map((title) => `„${title}”`);
  const named = where.length > 1 ? `${where.slice(0, -1).join(', ')} și ${where.at(-1)}` : where[0];
  const cited = units.map(readable);
  const unitText =
    cited.length > 1 ? `${cited.slice(0, -1).join(', ')} și ${cited.at(-1)}` : cited[0];
  const by = change.amendingActs.length
    ? `, modificată prin ${change.amendingActs.map((act) => act.name).join(', ')}`
    : '';
  return `În ${named}, ${unitText} din ${change.act.name} ${cited.length > 1 ? 'sunt citate' : 'este citat'} în forma în vigoare${by}.`;
}

export function pullBody({
  change,
  title,
  quotes,
  reading,
  documents,
}: {
  change: OpenChange;
  title: string | null;
  quotes: AppliedQuote[];
  reading: Reading;
  documents: string[];
}) {
  const units = [
    ...new Set(
      change.passages
        .filter((passage) => passage.citation_form === 'quote')
        .map((passage) => passage.unit_label)
    ),
  ];
  const references = change.passages.filter((passage) => passage.citation_form === 'reference');
  const toRead = [
    ...change.review,
    ...quotes.flatMap((quote) => quote.notes.map((note) => `${quote.file}: ${note}`)),
  ];
  const edits = reading.edits.map(
    (edit) =>
      `- **${edit.file}** ¶${edit.paragraph}\n  - now: ${edit.current}\n  - proposed: ${edit.proposed}\n  - why: ${edit.reason}`
  );
  return [
    markerOf(change),
    `Answers the legal change of **${formOf(change)}**, found by the daily legislation check and applied by \`legislation-fix.yml\` (ADR 017).`,
    '',
    ...lawSection(change, title),
    '',
    '## Our text',
    '',
    ...quotes.flatMap((quote) => [quote.markdown, '', ourDiff(quote), '']),
    '## The note for members',
    '',
    `> ${reading.note}`,
    '',
    'Written as the manifest change of every template above; members read it on the Legislație page.',
    '',
    '## Sentences of ours that restate the rule',
    '',
    reading.model === null
      ? 'No model was asked: AI_GATEWAY_URL and AI_GATEWAY_TOKEN are not set. Read the templates around the quote by hand.'
      : edits.length
        ? `Proposed by ${reading.model}, **not applied**. Apply by hand on this branch the ones that are right:\n\n${edits.join('\n')}`
        : `${reading.model} found no sentence of the templates' own that restates the changed rule.`,
    '',
    ...(toRead.length || references.length
      ? [
          '## Also to read before merging',
          '',
          ...toRead.map((reason) => `- ${reason}`),
          ...references.map(
            (passage) =>
              `- ${passage.template_file} ¶${passage.paragraph} refers to ${passage.unit_label}, which was ${passage.status}.`
          ),
          '',
        ]
      : []),
    '## Sign-off',
    '',
    "Merging is the sign-off on legal content: it says the quote is the law in force and the note is right. The deploy after the merge registers the new template versions, which resolves the change in each environment and moves the act's verified form to this one.",
    '',
    '## Actualizări',
    '',
    '## Îmbunătățiri',
    '',
    `- ${updateItem(change, documents, units)}`,
    '',
  ].join('\n');
}

export function issueTitle(change: OpenChange) {
  return `Legislation: ${formOf(change)} needs a person`;
}

export function issueBody({
  change,
  title,
  problems,
}: {
  change: OpenChange;
  title: string | null;
  problems: Problem[];
}) {
  const why = [
    ...problems.flatMap((problem) =>
      problem.reasons.map((reason) => `- ${problem.file}, ${problem.locator}: ${reason}`)
    ),
    ...change.review.map((reason) => `- ${reason}`),
  ];
  const passages = change.passages.map(
    (passage) =>
      `- ${passage.template_file} ¶${passage.paragraph}, ${passage.citation_form} ${passage.locator ?? passage.unit_label}: ${passage.unit_label} ${passage.status}`
  );
  return [
    markerOf(change),
    `The legal change of **${formOf(change)}** was not answered by a pull request: ${
      change.outcome === 'needs_review'
        ? 'the templates refer to an amended unit without quoting it, or cite one that is gone.'
        : "the law's old words are not in our passage as they are in the law, so the tool changed nothing."
    }`,
    '',
    '## Why',
    '',
    ...(why.length ? why : ['- No reason was recorded.']),
    '',
    ...lawSection(change, title),
    '',
    '## Passages',
    '',
    ...(passages.length ? passages : ['- None stored.']),
    '',
    '## What to do',
    '',
    `- If our text must change, change the templates by hand (\`pnpm --filter @ssm-usor/document-engine replace-quote\` takes the law's change or the whole passage) with the manifest change \`{ "kind": "legal", "note": "…", "resolves": { "act": "${change.act.id}", "consolidatedOn": "${change.consolidatedOn}" } }\`, and say \`Closes\` this issue in the pull request.`,
    "- If nothing of ours changes, resolve the change as no impact on the admin area's Legislație page and close this issue.",
    '',
  ].join('\n');
}

const listed = 5;

function capped(lines: string[]) {
  return lines.length > listed
    ? [...lines.slice(0, listed), `and ${lines.length - listed} more`]
    : lines;
}

const header = (mark: string, what: string, change: OpenChange, environment: string) =>
  `${mark} **${what}** · ${environment}: ${change.act.portalId === null ? change.act.name : `[${change.act.name}](${noPreview(portalPage(change.act.portalId))})`}, form of ${change.consolidatedOn}`;

export function pullMessage({
  change,
  quotes,
  reading,
  url,
  environment,
}: {
  change: OpenChange;
  quotes: AppliedQuote[];
  reading: Reading;
  url: string | null;
  environment: string;
}): DiscordMessage {
  const edits = reading.edits.map(
    (edit) =>
      `- ${edit.file} ¶${edit.paragraph}: ${clip(edit.proposed, 200)} (${clip(edit.reason, 120)})`
  );
  return {
    content: [
      header('🛠️', 'Legislation fix', change, environment),
      url ? `Pull request: ${noPreview(url)}` : 'Dry run: no pull request opened.',
      ...quotes.flatMap((quote) => [
        `**${quote.file}** · ${quote.locator}${quote.copies.length ? ` (and its copy in ${quote.copies.join(', ')})` : ''}`,
        ourDiff(quote),
      ]),
      `**Note:** ${reading.note}`,
      reading.model === null
        ? '**Sentences of ours:** not read, no model configured.'
        : edits.length
          ? ['**Sentences of ours to change** (proposed, not applied):', ...capped(edits)].join(
              '\n'
            )
          : '**Sentences of ours:** none restates the rule.',
    ].join('\n'),
  };
}

export function issueMessage({
  change,
  problems,
  url,
  environment,
}: {
  change: OpenChange;
  problems: Problem[];
  url: string | null;
  environment: string;
}): DiscordMessage {
  const reasons = [
    ...problems.flatMap((problem) =>
      problem.reasons.map((reason) => `- ${problem.file}, ${problem.locator}: ${reason}`)
    ),
    ...change.review.map((reason) => `- ${reason}`),
  ];
  const changed = change.passages.filter(
    (passage) => passage.citation_form === 'quote' && passage.status !== 'missing'
  );
  return {
    content: [
      header('🟠', 'Legislation change needs a person', change, environment),
      url ? `Issue: ${noPreview(url)}` : 'Dry run: no issue opened.',
      ...capped(reasons),
      ...(changed.length ? ["**The law's change**", lawDiff(changed)] : []),
    ].join('\n'),
  };
}

export function failedMessage(
  change: OpenChange,
  reason: string,
  environment: string
): DiscordMessage {
  return {
    content: [
      header('🟡', 'Legislation fix failed', change, environment),
      codeBlock(clip(reason, 1_500)),
    ].join('\n'),
  };
}
