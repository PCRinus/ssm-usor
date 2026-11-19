import { foldText, type InstructionImportChanges } from '@ssm-usor/contracts';
import type { InstructionsProposal, ProposedInstruction } from '@ssm-usor/import';

import { storedProposal } from './import-queries';

export function positionPostsOf(proposal: InstructionsProposal, row: { proposal: unknown }) {
  const stored = storedProposal(row.proposal);
  const byName = new Map(
    (stored?.proposal.jobPositions ?? []).map((position) => [foldText(position.name), position.id])
  );
  return Object.fromEntries(
    proposal.positions.map((position) => [
      position.key,
      position.clientPost ? (byName.get(foldText(position.clientPost)) ?? null) : null,
    ])
  );
}

const defaultPosts = (
  instruction: ProposedInstruction,
  positionPosts: Record<string, string | null>
) => [
  ...new Set(instruction.posts.flatMap((key) => (positionPosts[key] ? [positionPosts[key]] : []))),
];

export function reviewedInstructions(
  proposal: InstructionsProposal,
  changes: InstructionImportChanges | null,
  positionPosts: Record<string, string | null>
) {
  return proposal.instructions.flatMap((instruction) => {
    const change = changes?.instructions[instruction.key] ?? {};
    if (change.included === false) return [];
    return [
      {
        instruction,
        references: change.posts ?? defaultPosts(instruction, positionPosts),
        choice: change.choice ?? instruction.choice,
        title: (change.title ?? instruction.title).trim(),
        category: change.category ?? instruction.category,
        body: change.body ?? instruction.body,
      },
    ];
  });
}
