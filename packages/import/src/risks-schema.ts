import {
  preventionMeasureKindSchema,
  riskEvaluationKindSchema,
  workSystemComponentSchema,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { RisksProposal } from './risks-proposal';

const planField = z.enum(['actions', 'deadline', 'responsiblePerson', 'observations']);
const workSystemText = z.enum(['meansOfProduction', 'workEnvironment', 'exposure']);

const factorFlag = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('level_mismatch'), printed: z.number(), grid: z.number() }),
  z.object({
    kind: z.literal('consequence_mismatch'),
    consequence: z.string(),
    consequenceClass: z.number(),
  }),
  z.object({
    kind: z.literal('class_missing'),
    field: z.enum(['gravity', 'probability']),
    written: z.string(),
  }),
  z.object({ kind: z.literal('unknown_component'), written: z.string() }),
  z.object({ kind: z.literal('missing_group') }),
  z.object({ kind: z.literal('row_shape'), cells: z.number(), expected: z.number() }),
  z.object({ kind: z.literal('retyped') }),
  z.object({ kind: z.literal('quote_not_found') }),
  z.object({ kind: z.literal('person_named'), field: planField, text: z.string() }),
  z.object({ kind: z.literal('measure_kind_guessed') }),
  z.object({ kind: z.literal('measures_cut'), count: z.number() }),
]);

const sheetFlag = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quote_not_found'), field: workSystemText }),
  z.object({ kind: z.literal('text_cut'), field: workSystemText }),
  z.object({ kind: z.literal('file_not_found') }),
  z.object({ kind: z.literal('rows_not_found') }),
  z.object({ kind: z.literal('no_factors') }),
  z.object({ kind: z.literal('classes_swapped') }),
]);

const existingChoice = z.enum(['append', 'replace', 'keep']);

const factor = z.object({
  key: z.string(),
  row: z.string().nullable(),
  source: z.object({ file: z.string(), start: z.number(), end: z.number() }).nullable(),
  component: workSystemComponentSchema.nullable(),
  writtenComponent: z.string(),
  group: z.string(),
  description: z.string(),
  code: z.string().nullable(),
  consequence: z.string(),
  gravityClass: z.number().nullable(),
  probabilityClass: z.number().nullable(),
  printedLevel: z.number().nullable(),
  measures: z.array(z.object({ kind: preventionMeasureKindSchema, description: z.string() })),
  measuresFrom: z.enum(['plan', 'sheet']).nullable(),
  actions: z.string().nullable(),
  deadline: z.string().nullable(),
  responsiblePerson: z.string().nullable(),
  observations: z.string().nullable(),
  flags: z.array(factorFlag),
  included: z.boolean(),
  level: z.number().nullable(),
});

const match = z.object({
  evaluationId: z.string(),
  name: z.string(),
  share: z.number(),
  pairs: z.array(
    z.object({
      factor: z.string(),
      libraryFactor: z.string(),
      similarity: z.number(),
      otherClasses: z.boolean(),
      otherMeasures: z.boolean(),
    })
  ),
  onlyInPack: z.array(z.string()),
  onlyInLibrary: z.array(z.string()),
});

const looseRow = z.object({ row: z.string(), file: z.string(), text: z.string() });

export const risksProposalSchema = z
  .object({
    sheets: z.array(
      z.object({
        key: z.string(),
        file: z.string(),
        heading: z.string(),
        kind: riskEvaluationKindSchema,
        name: z.string(),
        rows: z.object({ first: z.string(), last: z.string() }).nullable(),
        meansOfProduction: z.string().nullable(),
        workEnvironment: z.string().nullable(),
        exposure: z.string().nullable(),
        flags: z.array(sheetFlag),
        posts: z.array(
          z.object({
            name: z.string(),
            existingFactors: z.number(),
            choice: existingChoice.nullable(),
          })
        ),
        undecided: z.boolean(),
        existing: z.object({ factors: z.number(), choice: existingChoice.nullable() }).nullable(),
        libraryName: z.string(),
        status: z.enum(['identical', 'similar', 'new']).nullable(),
        match: match.nullable(),
        choice: z.enum(['add', 'use_existing', 'add_new', 'skip']).nullable(),
        sameAs: z.array(z.string()),
        copyOf: z.string().nullable(),
        factors: z.array(factor),
      })
    ),
    unplacedRows: z.array(looseRow),
    unmatchedPlanRows: z.array(looseRow.extend({ post: z.string(), risk: z.string() })),
    unmatchedMeasureRows: z.array(looseRow),
  })
  .meta({ id: 'RisksProposal' });

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const proposalMatches: Same<z.infer<typeof risksProposalSchema>, RisksProposal> = true;
void proposalMatches;
