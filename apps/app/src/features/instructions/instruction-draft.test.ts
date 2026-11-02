import { describe, expect, it } from 'vitest';

import {
  articleBlock,
  articleNumbers,
  clientPatterns,
  clientsNamedIn,
  draftBody,
  headingBlock,
  restoreBlock,
  templateBlocks,
  withExample,
} from './instruction-draft';

describe('draftBody', () => {
  it('drops empty articles and the sections left empty, and keeps a chapter over its sections', () => {
    const blocks = templateBlocks('protective_equipment');
    blocks[3] = { ...blocks[3]!, text: 'Casca se poartă în toate zonele marcate.\n\n' };
    const chapter = headingBlock('CAPITOLUL I');
    const body = draftBody([chapter, ...blocks, headingBlock('Note'), articleBlock('  ')]);
    expect(body).toEqual({
      blocks: [
        { kind: 'heading', text: 'CAPITOLUL I' },
        { kind: 'heading', text: 'Când se poartă' },
        { kind: 'article', paragraphs: ['Casca se poartă în toate zonele marcate.'] },
      ],
    });
  });

  it('numbers only the articles that hold text', () => {
    const blocks = [headingBlock('A'), articleBlock(), articleBlock('x'), articleBlock('y')];
    expect([...articleNumbers(blocks).values()]).toEqual([1, 2]);
    expect(articleNumbers(blocks).has(blocks[1]!.id)).toBe(false);
  });

  it("puts a section's example in its empty article, or after its last article", () => {
    const blocks = templateBlocks('work_equipment');
    const filled = withExample(blocks, blocks[0]!.id);
    expect(filled[1]).toMatchObject({ kind: 'article', text: expect.stringMatching(/^Prezenta/) });
    const again = withExample(filled, blocks[0]!.id);
    expect(again).toHaveLength(blocks.length + 1);
    expect(again[2]).toMatchObject({ kind: 'article', text: filled[1]!.text });
  });
});

describe('restoreBlock', () => {
  it('puts a deleted block back where it was and keeps what changed since', () => {
    const [first, deleted, last] = [articleBlock('a'), articleBlock('b'), articleBlock('c')];
    const added = articleBlock('d');
    const now = [{ ...first!, text: 'a, schimbat' }, last!, added];
    expect(
      restoreBlock(now, deleted!, { before: first!.id, after: last!.id }).map((b) => b.text)
    ).toEqual(['a, schimbat', 'b', 'c', 'd']);
  });

  it('goes after the block before it when the one after it is gone too', () => {
    const [first, deleted, last] = [headingBlock('A'), articleBlock('b'), articleBlock('c')];
    expect(
      restoreBlock([first!], deleted!, { before: first!.id, after: last!.id }).map((b) => b.text)
    ).toEqual(['A', 'b']);
  });

  it('takes the place of the empty box left when it was the only block', () => {
    const deleted = articleBlock('singurul articol');
    expect(restoreBlock([articleBlock()], deleted, { before: null, after: null })).toEqual([
      deleted,
    ]);
  });
});

describe('client names', () => {
  const patterns = clientPatterns([
    { id: '1', legalName: 'S.C. ROYAL HOTEL S.R.L.' },
    { id: '2', legalName: 'BIROU SRL' },
    { id: '3', legalName: 'Construcții Montaj Iași SA' },
  ]);

  it('finds a name without its company form, in any case and without diacritics', () => {
    expect(clientsNamedIn('Recepția hotelului Royal Hotel se închide.', patterns)).toEqual([
      { id: '1', legalName: 'S.C. ROYAL HOTEL S.R.L.' },
    ]);
    expect(clientsNamedIn('Utilajele CONSTRUCTII MONTAJ IASI.', patterns)).toEqual([
      { id: '3', legalName: 'Construcții Montaj Iași SA' },
    ]);
  });

  it('needs the company form for a name of one word', () => {
    expect(clientsNamedIn('Munca de birou se face așezat.', patterns)).toEqual([]);
    expect(clientsNamedIn('Angajații Birou S.R.L. poartă ecuson.', patterns)).toEqual([
      { id: '2', legalName: 'BIROU SRL' },
    ]);
  });
});
