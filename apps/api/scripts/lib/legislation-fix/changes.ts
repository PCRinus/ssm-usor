import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../src/database.types';

export type FixDatabase = SupabaseClient<Database>;

const amendingActSchema = z.object({
  name: z.string(),
  portalId: z.number().nullable().catch(null),
});

const amendedUnitSchema = z.object({ unit: z.string() });

export const passageSchema = z.object({
  manifest: z.string(),
  template_file: z.string(),
  paragraph: z.number(),
  citation_form: z.enum(['quote', 'reference']),
  locator: z.string().nullable(),
  unit_label: z.string(),
  status: z.enum(['changed', 'added', 'repealed', 'missing', 'uncompared']),
  old_text: z.string().nullable(),
  new_text: z.string().nullable(),
});

export type ChangePassage = z.infer<typeof passageSchema>;

const changeRowSchema = z.object({
  id: z.uuid(),
  act_id: z.string(),
  consolidated_on: z.iso.date(),
  compared_with: z.iso.date().nullable(),
  amending_act: z.string().nullable(),
  outcome: z.enum(['quote_differs', 'needs_review']),
  amending_acts: z.array(amendingActSchema).nullable().catch(null),
  amended_units: z.array(amendedUnitSchema).nullable().catch(null),
  review: z.array(z.string()).nullable().catch(null),
  act: z.object({ id: z.string(), name: z.string(), portal_id: z.number().nullable() }),
  passages: z.array(passageSchema),
});

export interface OpenChange {
  id: string;
  act: { id: string; name: string; portalId: number | null };
  consolidatedOn: string;
  comparedWith: string | null;
  outcome: 'quote_differs' | 'needs_review';
  amendingActs: { name: string; portalId: number | null }[];
  amendedUnits: string[];
  review: string[];
  passages: ChangePassage[];
}

export function toOpenChange(row: unknown): OpenChange {
  const parsed = changeRowSchema.parse(row);
  return {
    id: parsed.id,
    act: { id: parsed.act.id, name: parsed.act.name, portalId: parsed.act.portal_id },
    consolidatedOn: parsed.consolidated_on,
    comparedWith: parsed.compared_with,
    outcome: parsed.outcome,
    amendingActs:
      parsed.amending_acts ??
      (parsed.amending_act ? [{ name: parsed.amending_act, portalId: null }] : []),
    amendedUnits: [...new Set((parsed.amended_units ?? []).map((unit) => unit.unit))],
    review: parsed.review ?? [],
    passages: [...parsed.passages].sort(
      (a, b) => a.template_file.localeCompare(b.template_file) || a.paragraph - b.paragraph
    ),
  };
}

export async function readOpenChanges(db: FixDatabase): Promise<OpenChange[]> {
  const { data, error } = await db
    .from('legal_changes')
    .select(
      'id, act_id, consolidated_on, compared_with, amending_act, outcome, amending_acts, amended_units, review, act:legal_acts(id, name, portal_id), passages:legal_change_passages(manifest, template_file, paragraph, citation_form, locator, unit_label, status, old_text, new_text)'
    )
    .eq('resolution', 'open')
    .in('outcome', ['quote_differs', 'needs_review'])
    .order('consolidated_on', { ascending: true });
  if (error) throw new Error(`Could not read the open legal changes: ${error.message}`);
  return data.map(toOpenChange);
}

export interface RunsSeen {
  lastSucceededStart: string | null;
  latest: { status: string; startedAt: string } | null;
}

export async function readRuns(db: FixDatabase): Promise<RunsSeen> {
  const [succeeded, latest] = await Promise.all([
    db
      .from('legal_check_runs')
      .select('started_at')
      .eq('status', 'succeeded')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('legal_check_runs')
      .select('status, started_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (succeeded.error || latest.error) {
    throw new Error(
      `Could not read the legislation check runs: ${(succeeded.error ?? latest.error)!.message}`
    );
  }
  return {
    lastSucceededStart: succeeded.data?.started_at ?? null,
    latest: latest.data ? { status: latest.data.status, startedAt: latest.data.started_at } : null,
  };
}

/** `oug-195-2002`, or one form of it: `oug-195-2002-2026-11-06`, `oug-195-2002:2026-11-06`. */
export function changeFilter(value: string | undefined) {
  const given = value?.trim();
  if (!given) return () => true;
  const match = /^(.+?)(?:[-:@/](\d{4}-\d{2}-\d{2}))?$/.exec(given)!;
  const [, act, on] = match;
  return (change: Pick<OpenChange, 'act' | 'consolidatedOn'>) =>
    change.act.id === act && (on === undefined || change.consolidatedOn === on);
}

export interface Answer {
  change: OpenChange;
  /** The act's older open forms, which the answer resolves as well. */
  older: OpenChange[];
}

/**
 * The open changes to answer. Of an act with several open forms only the newest whose quote
 * differs gets a pull request: the check compared it with the verified form, so its law diff
 * covers the older forms, which its manifest change resolves with it. A newer form that needs
 * review still gets its own issue.
 */
export function answersOf(changes: OpenChange[]): Answer[] {
  const byAct = new Map<string, OpenChange[]>();
  for (const change of changes) {
    byAct.set(change.act.id, [...(byAct.get(change.act.id) ?? []), change]);
  }
  return [...byAct.values()].flatMap((forms) => {
    const ordered = [...forms].sort((a, b) => a.consolidatedOn.localeCompare(b.consolidatedOn));
    const lead = [...ordered].reverse().find((change) => change.outcome === 'quote_differs');
    if (!lead) return ordered.map((change) => ({ change, older: [] }));
    return [
      {
        change: lead,
        older: ordered.filter((change) => change.consolidatedOn < lead.consolidatedOn),
      },
      ...ordered
        .filter((change) => change.consolidatedOn > lead.consolidatedOn)
        .map((change) => ({ change, older: [] })),
    ];
  });
}

export const changeKey = (change: Pick<OpenChange, 'act' | 'consolidatedOn'>) =>
  `${change.act.id}-${change.consolidatedOn}`;

export const branchOf = (change: Pick<OpenChange, 'act' | 'consolidatedOn'>) =>
  `legislation/${changeKey(change)}`;
