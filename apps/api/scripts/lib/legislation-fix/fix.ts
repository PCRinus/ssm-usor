import { type DiscordMessage, discordPayloads } from '@ssm-usor/discord';
import type { ModelClient } from '@ssm-usor/import';
import { isStale, staleMessage } from '@ssm-usor/legislation-check';

import { candidateParagraphs } from './candidates';
import {
  type Answer,
  answersOf,
  branchOf,
  changeKey,
  type OpenChange,
  type RunsSeen,
} from './changes';
import type { Found, GitHub } from './github';
import {
  type AppliedQuote,
  failedMessage,
  issueBody,
  issueMessage,
  issueTitle,
  type LeftOpen,
  leftOpenMessage,
  markerOf,
  type Problem,
  pullBody,
  pullMessage,
  pullTitle,
  resolvesOf,
} from './messages';
import { readChange, type Reading } from './model';
import {
  type Git,
  type IndexedQuote,
  type PatchInput,
  PendingChangeError,
  type QuoteTool,
  type Templates,
  type ToolResult,
} from './workspace';

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
  // A change named by hand is answered again when its pull request or issue was closed.
  redo: boolean;
}

export type ChangeResult =
  | { key: string; action: 'pull'; url: string | null; reading: Reading }
  | { key: string; action: 'issue'; url: string | null }
  | { key: string; action: 'skipped'; reason: string; closed?: LeftOpen['closed'] }
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

const monday = 1;

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
  changes: passages.map((passage) => ({
    old: passage.old_text,
    new: passage.new_text,
    unit: passage.unit_label,
  })),
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
    const uncompared = passages.filter((passage) => passage.status === 'uncompared');
    if (uncompared.length) {
      problems.push({
        ...where,
        reasons: uncompared.map(
          (passage) => `the check could not compare ${passage.unit_label} between the two forms`
        ),
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
    } else if (result.status === 'nothing-to-apply') {
      problems.push({
        ...where,
        reasons: result.notes.length
          ? result.notes.map((note) => `nothing to apply: ${note}`)
          : ['nothing to apply: the quote holds none of what changed'],
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

  const answers = answersOf(await deps.changes()).filter((answer) =>
    [answer.change, ...answer.older].some(options.only)
  );
  if (!answers.length) {
    log('No open legal change needs a pull request or an issue.');
    return { results, stale, cost };
  }
  git.assertClean();
  const base = git.currentBranch();
  if (github && !options.dryRun) await github.ensureLabel();
  const leftOpen: LeftOpen[] = [];

  type Decision =
    { kind: 'skip'; reason: string; closed?: Found } | { kind: 'answer'; branch: string };

  const named = (found: Found) => (found.kind === 'pull' ? 'pull request' : 'issue');

  async function unusedBranch(change: OpenChange) {
    for (let suffix = 2; suffix <= 20; suffix++) {
      const branch = `${branchOf(change)}-${suffix}`;
      if (git.remoteHead(branch) === null && !(await github!.pullForBranch(branch))) return branch;
    }
    throw new Error(`${branchOf(change)}-2 to -20 are all taken; delete the old branches.`);
  }

  async function decide(change: OpenChange): Promise<Decision> {
    if (deps.templates.resolves(change.act.id, change.consolidatedOn)) {
      return {
        kind: 'skip',
        reason:
          'a manifest on this branch already resolves it; registration after the next release does',
      };
    }
    if (!github) return { kind: 'answer', branch: branchOf(change) };
    const pull = await github.pullForBranch(branchOf(change));
    const found = [...(pull ? [pull] : []), ...(await github.answersByMarker(markerOf(change)))];
    const live = found.find((each) => each.state !== 'closed');
    if (live) {
      return { kind: 'skip', reason: `${named(live)} ${live.url} (${live.state}) answers it` };
    }
    const closed = found[0];
    if (closed && !options.redo) {
      return {
        kind: 'skip',
        reason: `${named(closed)} ${closed.url} was closed; name the change to answer it again`,
        closed,
      };
    }
    return {
      kind: 'answer',
      branch: found.some((each) => each.kind === 'pull')
        ? await unusedBranch(change)
        : branchOf(change),
    };
  }

  async function openIssue({ change, older }: Answer, problems: Problem[]) {
    const title = issueTitle(change);
    const body = issueBody({ change, older, title: deps.actTitle(change.act.id), problems });
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

  async function openPull(
    answer: Answer,
    branch: string,
    groups: CitedPassages[],
    probed: AppliedQuote[]
  ) {
    const { change, older } = answer;
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
    const resolves = resolvesOf(change, older);
    const applied: AppliedQuote[] = [];
    const written = new Set<string>();
    for (const { citation, passages } of groups) {
      let result: ToolResult;
      try {
        result = deps.tool(
          inputOf(citation!, passages, {
            note: reading.note,
            resolves: resolves.length > 1 ? resolves : resolves[0]!,
          })
        );
      } catch (error) {
        if (!(error instanceof PendingChangeError)) throw error;
        git.restore();
        await openIssue(answer, [
          {
            file: citation!.file,
            locator: citation!.locator ?? passages[0]!.unit_label,
            reasons: [
              `the template's change pending since the last release cannot take this note as well: ${error.message}`,
            ],
          },
        ]);
        return;
      }
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
      older,
      title: deps.actTitle(change.act.id),
      quotes: applied,
      reading,
      documents: [...new Set(applied.map((quote) => deps.templates.titleOf(quote.file)))],
    });
    let url: string | null = null;
    if (options.dryRun) {
      log(
        `\n--- Pull request: ${title} ---\nBranch: ${branch}\nFiles: ${[...written].join(', ')}\n\n${body}`
      );
      git.restore();
    } else {
      const expected = git.remoteHead(branch);
      try {
        git.commit(branch, [...written], title);
        git.push(branch, expected);
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

  for (const answer of answers) {
    const { change, older } = answer;
    const key = changeKey(change);
    try {
      const decision = await decide(change);
      if (decision.kind === 'skip') {
        log(`${key}: skipped, ${decision.reason}.`);
        results.push({
          key,
          action: 'skipped',
          reason: decision.reason,
          ...(decision.closed && {
            closed: { kind: decision.closed.kind, url: decision.closed.url },
          }),
        });
        if (decision.closed) {
          leftOpen.push({
            change,
            closed: { kind: decision.closed.kind, url: decision.closed.url },
          });
        }
      } else if (change.outcome === 'needs_review') {
        await openIssue(answer, []);
      } else {
        const groups = citedPassages(change, deps.templates.citations());
        let probed: Probe;
        try {
          probed = probe(change, groups, deps.tool);
        } finally {
          git.restore();
        }
        if (probed.problems.length) await openIssue(answer, probed.problems);
        else await openPull(answer, decision.branch, groups, probed.applied);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log(`${key}: failed, ${reason}`);
      results.push({ key, action: 'failed', reason });
      git.restore();
      await post(failedMessage(change, reason, options.environment));
    }
    for (const each of older) {
      const reason = `the answer to the form of ${change.consolidatedOn} resolves it too`;
      log(`${changeKey(each)}: ${reason}.`);
      results.push({ key: changeKey(each), action: 'skipped', reason });
    }
  }

  if (leftOpen.length && new Date(deps.now()).getUTCDay() === monday) {
    await post(leftOpenMessage(leftOpen, options.environment));
  }
  return { results, stale, cost };
}
