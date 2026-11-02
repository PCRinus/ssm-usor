import { describe, expect, it } from 'vitest';

import {
  addSection,
  articleBlock,
  articleNumbers,
  clientPatterns,
  clientsNamedIn,
  type DraftBlock,
  draftBody,
  draftSections,
  headingBlock,
  insertHeadingAfter,
  moveSection,
  printedIds,
  removeSection,
  restoreBlock,
  restoreBlocks,
  templateBlocks,
  withExample,
} from './instruction-draft';

const texts = (blocks: readonly DraftBlock[]) =>
  blocks.map((block) => (block.kind === 'heading' ? `# ${block.text}` : block.text));

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

describe('sections', () => {
  const ladder = () => [
    articleBlock('fără secțiune'),
    headingBlock('A'),
    articleBlock('a1'),
    articleBlock('a2'),
    headingBlock('B'),
    articleBlock('b1'),
    headingBlock('C'),
  ];

  it('groups the blocks under their headings, the articles before the first one apart', () => {
    expect(
      draftSections(ladder()).map(({ heading, articles }) => [
        heading?.text ?? null,
        articles.map((article) => article.text),
      ])
    ).toEqual([
      [null, ['fără secțiune']],
      ['A', ['a1', 'a2']],
      ['B', ['b1']],
      ['C', []],
    ]);
  });

  it('moves a section with its articles, never above the articles without one', () => {
    const blocks = ladder();
    expect(texts(moveSection(blocks, blocks[4]!.id, -1))).toEqual([
      'fără secțiune',
      '# B',
      'b1',
      '# A',
      'a1',
      'a2',
      '# C',
    ]);
    expect(texts(moveSection(blocks, blocks[1]!.id, -1))).toEqual(texts(blocks));
    expect(texts(moveSection(blocks, blocks[6]!.id, 1))).toEqual(texts(blocks));
  });

  it('removes a section with its articles and puts it back where it was', () => {
    const blocks = ladder();
    const { blocks: rest, removed, neighbours } = removeSection(blocks, blocks[1]!.id);
    expect(texts(rest)).toEqual(['fără secțiune', '# B', 'b1', '# C']);
    expect(texts(removed)).toEqual(['# A', 'a1', 'a2']);
    expect(texts(restoreBlocks(rest, removed, neighbours))).toEqual(texts(blocks));
  });

  it('starts a section after an article with the articles below it, or with an empty one', () => {
    const blocks = ladder();
    const heading = headingBlock();
    expect(texts(insertHeadingAfter(blocks, blocks[2]!.id, heading))).toEqual([
      'fără secțiune',
      '# A',
      'a1',
      '# ',
      'a2',
      '# B',
      'b1',
      '# C',
    ]);
    const last = insertHeadingAfter(blocks, blocks[5]!.id, headingBlock('Nouă'));
    expect(texts(last.slice(5, 8))).toEqual(['b1', '# Nouă', '']);
  });

  it('adds a section below another, after its articles, or at the end', () => {
    const blocks = ladder();
    expect(texts(addSection(blocks, blocks[1]!.id, headingBlock('Nouă')))).toEqual([
      'fără secțiune',
      '# A',
      'a1',
      'a2',
      '# Nouă',
      '',
      '# B',
      'b1',
      '# C',
    ]);
    expect(texts(addSection(blocks, null, headingBlock('La sfârșit')).slice(-2))).toEqual([
      '# La sfârșit',
      '',
    ]);
  });

  it('prints a heading the member wrote over another, not one from the template left empty', () => {
    const chapter = headingBlock('CAPITOLUL I');
    const [heading, article] = templateBlocks('protective_equipment');
    const printed = printedIds([
      chapter,
      heading!,
      article!,
      headingBlock('Note'),
      articleBlock('x'),
    ]);
    expect(printed.has(chapter.id)).toBe(true);
    expect(printed.has(heading!.id)).toBe(false);
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
