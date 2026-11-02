import {
  instructionBlockSchema,
  instructionCategorySchema,
  instructionDomainSchema,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { InstructionsProposal } from './instructions-proposal';
import { citationSections } from './instructions-request';

const numberingScope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('main') }),
  z.object({ kind: z.literal('own'), number: z.number() }),
  z.object({ kind: z.literal('apart'), file: z.string() }),
]);

const undecidedReason = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number_twice'), scope: numberingScope, number: z.number() }),
  z.object({ kind: z.literal('cuts_instruction'), instruction: z.string() }),
  z.object({ kind: z.literal('number_shared'), number: z.number() }),
  z.object({ kind: z.literal('missing_reference'), reference: z.string() }),
  z.object({ kind: z.literal('unread_citation'), citation: z.string() }),
]);

const resolvedPosition = z.object({
  key: z.string(),
  post: z.string(),
  variant: z.string(),
  clientPost: z.string().nullable(),
  citations: z.array(
    z.object({
      section: z.enum(citationSections),
      citation: z.string(),
      file: z.string(),
      quote: z.string(),
    })
  ),
  resolution: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('resolved'), instructions: z.array(z.string()) }),
    z.object({ kind: z.literal('undecided'), reasons: z.array(undecidedReason) }),
  ]),
  missing: z.array(z.string()),
});

const instructionFlag = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('no_numbering') }),
  z.object({ kind: z.literal('no_articles') }),
  z.object({ kind: z.literal('text_before_first_article') }),
  z.object({ kind: z.literal('table_row'), article: z.number() }),
  z.object({ kind: z.literal('empty_article'), number: z.number() }),
  z.object({ kind: z.literal('end_not_found') }),
  z.object({ kind: z.literal('end_extended') }),
  z.object({ kind: z.literal('client_name'), name: z.string() }),
]);

const wordChange = z.object({ text: z.string(), change: z.enum(['same', 'added', 'removed']) });

const articleDifference = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('added'), article: z.number() }),
  z.object({ kind: z.literal('removed'), libraryArticle: z.number() }),
  z.object({
    kind: z.literal('changed'),
    article: z.number(),
    libraryArticle: z.number(),
    words: z.array(wordChange),
  }),
]);

const libraryMatch = z.object({
  moduleId: z.string(),
  title: z.string(),
  similarity: z.number(),
  decidedBy: z.enum(['hash', 'overlap', 'model']),
  differences: z.array(articleDifference),
});

const sourceLocation = z.object({
  file: z.string(),
  start: z.number(),
  end: z.number(),
  firstParagraph: z.number(),
  lastParagraph: z.number(),
});

export const instructionsProposalSchema = z
  .object({
    domain: instructionDomainSchema,
    instructions: z.array(
      z.object({
        key: z.string(),
        file: z.string(),
        number: z.string(),
        writtenTitle: z.string(),
        title: z.string(),
        category: instructionCategorySchema,
        body: z.object({ blocks: z.array(instructionBlockSchema) }),
        articleCount: z.number(),
        sourceNumbers: z.array(z.number().nullable()),
        location: sourceLocation,
        status: z.enum(['identical', 'similar', 'new']),
        match: libraryMatch.nullable(),
        choice: z.enum(['use_existing', 'add_new']).nullable(),
        posts: z.array(z.string()),
        flags: z.array(instructionFlag),
        sameAs: z.array(z.string()),
      })
    ),
    unread: z.array(
      z.object({
        key: z.string(),
        file: z.string(),
        number: z.string(),
        title: z.string(),
        category: instructionCategorySchema,
        reason: z.enum(['file_not_found', 'start_not_found', 'no_articles', 'too_long']),
      })
    ),
    positions: z.array(resolvedPosition),
  })
  .meta({ id: 'InstructionsProposal' });

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const proposalMatches: Same<
  z.infer<typeof instructionsProposalSchema>,
  InstructionsProposal
> = true;
void proposalMatches;
