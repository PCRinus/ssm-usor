import { type DiscordMessage, discordPayloads } from '@ssm-usor/discord';
import type { ModelClient } from '@ssm-usor/import';
import { isStale, staleMessage } from '@ssm-usor/legislation-check';

import { candidateParagraphs } from './candidates';
import { branchOf, changeKey, type OpenChange, type RunsSeen } from './changes';
import type { GitHub } from './github';
import {
  type AppliedQuote,
  failedMessage,
  issueBody,
  issueMessage,
  issueTitle,
  markerOf,
  type Problem,
  pullBody,
  pullMessage,
  pullTitle,
} from './messages';
import { readChange, type Reading } from './model';
import type { Git, IndexedQuote, PatchInput, QuoteTool, Templates } from './workspace';

export interface FixDependencies {
  changes: () => Promise<OpenChange[]>;
  runs: () => Promise<RunsSeen>;
  templates: Templates;
  tool: QuoteTool;
  git: Git;
  // Null in a dry run without a token: nothing is looked up, so nothing is skipped.
  github: GitHub | null;
  model: ModelClient | null;
  discord: { send(message: DiscordMessage): Promise<boolean> } | null;
  actTitle: (actId: string) => string | null;
  log: (text: string) => void;
  now: () => number;
}

export interface FixOptions {
  dryRun: boolean;
  environment: string;
  only: (change: OpenChange) => boolean;
}

export type ChangeResult =
  | { key: string; action: 'pull'; url: string | null; reading: Reading }
  | { key: string; action: 'issue'; url: string | null }
  | { key: string; action: 'skipped'; reason: string }
  | { key: string; action: 'failed'; reason: string };

export interface FixReport {
  results: ChangeResult[];
  stale: boolean;
  // In USD, the model's calls together.
  cost: number;
}

// The Worker posts the same warning when its own run fails; a failed run in the last day has
// been told already, so only silence (no run, or one left running) is told here.
const toldWithin = 26 * 60 * 60 * 1000;

export function deadManDue(runs: RunsSeen, now: number) {
  if (!isStale(runs.lastSucceededStart, now)) return false;
  return !(
    runs.latest?.status === 'failed' && now - Date.parse(runs.latest.startedAt) < toldWithin
  );
}

interface CitedPassages {
  citation: IndexedQuote | null;
  passages: OpenChange['passages'];
}

function citedPassages(change: OpenChange, citations: IndexedQuote[]): CitedPassages[] {
  const groups = new Map<string, CitedPassages>();
  for (const passage of change.passages) {
    if (passage.citation_form !== 'quote') continue;
    const key = `${passage.template_file}\u0000${passage.paragraph}`;
    if (!groups.has(key)) {
      const quotes = citations.filter(
        (each) =>
          each.form === 'quote' && each.act === change.act.id && each.file === passage.template_file
      );
      const citation =
        quotes.find((each) => each.paragraph === passage.paragraph) ??
        (passage.locator
          ? quotes.filter((each) => each.locator === passage.locator).length === 1
            ? quotes.find((each) => each.locator === passage.locator)!
            : null
          : null);
      groups.set(key, { citation, passages: [] });
    }
    groups.get(key)!.passages.push(passage);
  }
  return [...groups.values()];
}

const inputOf = (
  citation: IndexedQuote,
  passages: OpenChange['passages'],
  change?: PatchInput['change']
): PatchInput => ({
  citation: {
    file: citation.file,
    paragraph: citation.paragraph,
    act: citation.act,
    locator: citation.locator,
    text: citation.text,
  },
  changes: passages.map((passage) => ({ old: passage.old_text, new: passage.new_text })),
  ...(change ? { change } : {}),
});

type Probe = { applied: AppliedQuote[]; problems: Problem[] };

function probe(change: OpenChange, groups: CitedPassages[], tool: QuoteTool): Probe {
  const applied: AppliedQuote[] = [];
  const problems: Problem[] = [];
  for (const { citation, passages } of groups) {
    const first = passages[0]!;
    const where = { file: first.template_file, locator: first.locator ?? first.unit_label };
    if (!citation) {
      problems.push({
        ...where,
        reasons: [`the citation index no longer lists this quote at ¶${first.paragraph}`],
      });
      continue;
    }
    const missing = passages.filter((passage) => passage.status === 'missing');
    if (missing.length) {
      problems.push({
        ...where,
        reasons: missing.map((passage) => `${passage.unit_label} is in neither form of the act`),
      });
      continue;
    }
    const result = tool(inputOf(citation, passages));
    if (result.status === 'needs-review') {
      problems.push({
        ...where,
        reasons: result.problems.map(
          (problem) => `${problem.alineat ? `(${problem.alineat}) ` : ''}${problem.reason}`
        ),
      });
    } else {
      applied.push({
        file: result.summary.file,
        locator: result.summary.locator,
        changes: result.summary.changes,
        notes: result.summary.notes,
        copies: result.copies,
        markdown: result.markdown,
      });
    }
  }
  if (!groups.length) {
    problems.push({
      file: '—',
      locator: change.act.name,
      reasons: ['the change has no stored quote to apply'],
    });
  }
  return { applied, problems };
}

export async function runLegislationFix(
  deps: FixDependencies,
  options: FixOptions
): Promise<FixReport> {
  const { git, github, log } = deps;
  const results: ChangeResult[] = [];
  let cost = 0;

  const post = async (message: DiscordMessage) => {
    if (options.dryRun) {
      log(`\n--- Discord payload ---\n${JSON.stringify(discordPayloads(message), null, 2)}`);
      return;
    }
    await deps.discord?.send(message);
  };

  const runs = await deps.runs();
  const stale = deadManDue(runs, deps.now());
  if (stale) await post(staleMessage(runs.lastSucceededStart, options.environment));

  const changes = (await deps.changes()).filter(options.only);
  if (!changes.length) {
    log('No open legal change needs a pull request or an issue.');
    return { results, stale, cost };
  }
  git.assertClean();
  const base = git.currentBranch();
  if (github && !options.dryRun) await github.ensureLabel();

  async function answered(change: OpenChange) {
    if (deps.templates.resolves(change.act.id, change.consolidatedOn)) {
      return 'a manifest on this branch already resolves it; registration after the next release does';
    }
    if (!github) return null;
    const pull = await github.pullForBranch(branchOf(change));
    if (pull) return `pull request ${pull.url} (${pull.state}) answers it`;
    const issue = await github.issueByMarker(markerOf(change));
    if (issue) return `issue ${issue.url} (${issue.state}) answers it`;
    return null;
  }

  async function openIssue(change: OpenChange, problems: Problem[]) {
    const title = issueTitle(change);
    const body = issueBody({ change, title: deps.actTitle(change.act.id), problems });
    let url: string | null = null;
    if (options.dryRun) {
      log(`\n--- Issue: ${title} ---\n${body}`);
    } else {
      url = (await github!.openIssue({ title, body })).url;
      log(`${changeKey(change)}: opened ${url}.`);
    }
    await post(issueMessage({ change, problems, url, environment: options.environment }));
    results.push({ key: changeKey(change), action: 'issue', url });
  }

  async function openPull(change: OpenChange, groups: CitedPassages[], probed: AppliedQuote[]) {
    const files = [...new Set(probed.flatMap((quote) => [quote.file, ...quote.copies]))];
    const quotes = deps.templates.citations().filter((each) => each.form === 'quote');
    const changedUnits = groups.flatMap(({ passages }) =>
      passages.map((passage) => ({
        label: passage.unit_label,
        old: passage.old_text,
        new: passage.new_text,
      }))
    );
    const units = [...new Map(changedUnits.map((unit) => [unit.label, unit])).values()];
    const candidates = files.flatMap((file) =>
      candidateParagraphs(file, deps.templates.read(file), units, quotes)
    );
    const documents = files.map((file) => deps.templates.titleOf(file));
    const reading = await readChange(deps.model, {
      key: changeKey(change),
      act: { name: change.act.name, title: deps.actTitle(change.act.id) },
      consolidatedOn: change.consolidatedOn,
      amendingActs: change.amendingActs.map((act) => act.name),
      units,
      documents,
      candidates,
      documentOf: (file) => deps.templates.titleOf(file),
    });
    cost += reading.cost ?? 0;

    git.restore();
    const resolves = { act: change.act.id, consolidatedOn: change.consolidatedOn };
    const applied: AppliedQuote[] = [];
    const written = new Set<string>();
    for (const { citation, passages } of groups) {
      const result = deps.tool(inputOf(citation!, passages, { note: reading.note, resolves }));
      if (result.status !== 'applied') {
        throw new Error(`${citation!.file}: applied on the first pass and not on the second.`);
      }
      for (const file of result.written) written.add(file);
      applied.push({
        file: result.summary.file,
        locator: result.summary.locator,
        changes: result.summary.changes,
        notes: result.summary.notes,
        copies: result.copies,
        markdown: result.markdown,
      });
    }

    const title = pullTitle(change);
    const body = pullBody({
      change,
      title: deps.actTitle(change.act.id),
      quotes: applied,
      reading,
      documents: [...new Set(applied.map((quote) => deps.templates.titleOf(quote.file)))],
    });
    let url: string | null = null;
    if (options.dryRun) {
      log(`\n--- Pull request: ${title} ---\nFiles: ${[...written].join(', ')}\n\n${body}`);
      git.restore();
    } else {
      const branch = branchOf(change);
      try {
        git.commit(branch, [...written], title);
        git.push(branch);
      } finally {
        git.restore();
        git.switchTo(base);
      }
      url = (await github!.openPull({ title, branch, base, body })).url;
      log(`${changeKey(change)}: opened ${url}.`);
    }
    await post(
      pullMessage({ change, quotes: applied, reading, url, environment: options.environment })
    );
    results.push({ key: changeKey(change), action: 'pull', url, reading });
  }

  for (const change of changes) {
    const key = changeKey(change);
    try {
      const skip = await answered(change);
      if (skip) {
        log(`${key}: skipped, ${skip}.`);
        results.push({ key, action: 'skipped', reason: skip });
        continue;
      }
      if (change.outcome === 'needs_review') {
        await openIssue(change, []);
        continue;
      }
      const groups = citedPassages(change, deps.templates.citations());
      let probed: Probe;
      try {
        probed = probe(change, groups, deps.tool);
      } finally {
        git.restore();
      }
      if (probed.problems.length) {
        await openIssue(change, probed.problems);
        continue;
      }
      await openPull(change, groups, probed.applied);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log(`${key}: failed, ${reason}`);
      results.push({ key, action: 'failed', reason });
      git.restore();
      await post(failedMessage(change, reason, options.environment));
    }
  }
  return { results, stale, cost };
}
