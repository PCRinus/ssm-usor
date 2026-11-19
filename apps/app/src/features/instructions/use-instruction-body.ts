import { articleCount, instructionBodySchema } from '@ssm-usor/contracts';
import { useMemo, useState } from 'react';

import {
  type ClientName,
  clientPatterns,
  clientsNamedIn,
  type DraftBlock,
  draftBody,
  isEmptyArticle,
} from './instruction-draft';
import type { PasteMode } from './paste-text-dialog';

// A guided section's heading comes with the template, so alone it is not the person's text.
const hasOwnText = (blocks: readonly DraftBlock[]) =>
  blocks.some((block) =>
    block.kind === 'article'
      ? !isEmptyArticle(block)
      : block.section === null && block.text.trim() !== ''
  );

export function useInstructionBody({
  initialBlocks,
  clients,
}: {
  initialBlocks: DraftBlock[] | (() => DraftBlock[]);
  // Kept stable by the caller: a new array scans the text again.
  clients: readonly ClientName[];
}) {
  const [blocks, setBlocks] = useState<DraftBlock[]>(initialBlocks);
  const body = useMemo(() => draftBody(blocks), [blocks]);
  const count = articleCount(body);
  const patterns = useMemo(() => clientPatterns(clients), [clients]);
  const { namedClients, named } = useMemo(() => {
    const perBlock = new Map<string, ClientName[]>();
    const all = new Map<string, ClientName>();
    if (patterns.length > 0) {
      for (const block of blocks) {
        const found = clientsNamedIn(block.text, patterns);
        if (found.length === 0) continue;
        perBlock.set(block.id, found);
        for (const client of found) all.set(client.id, client);
      }
    }
    return { namedClients: perBlock, named: [...all.values()] };
  }, [blocks, patterns]);

  function problem(whenEmpty: string) {
    if (count === 0) return whenEmpty;
    const parsed = instructionBodySchema.safeParse(body);
    if (parsed.success) return null;
    const issue = parsed.error.issues[0];
    return issue?.code === 'custom'
      ? issue.message
      : 'Un titlu de secțiune are cel mult 300 de caractere, iar un paragraf cel mult 20.000.';
  }

  function addPasted(added: DraftBlock[], mode: PasteMode) {
    setBlocks((current) =>
      mode === 'replace' ? added : [...current.filter((block) => !isEmptyArticle(block)), ...added]
    );
  }

  return {
    blocks,
    setBlocks,
    body,
    articleCount: count,
    namedClients,
    named,
    hasText: hasOwnText(blocks),
    problem,
    addPasted,
  };
}
