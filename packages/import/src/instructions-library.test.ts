import { type InstructionBlock, textHash } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  articleDifferences,
  compareWithLibrary,
  judgements,
  type LibraryModule,
  namesClient,
  type PackInstruction,
  similarityPairs,
  similarityRequest,
} from './instructions-library';

const body = (...articles: string[]) => ({
  blocks: articles.map((text): InstructionBlock => ({ kind: 'article', paragraphs: [text] })),
});

const ladderArticles = [
  'Scara metalică se verifică înainte de fiecare folosire, treaptă cu treaptă, de cel care urcă.',
  'Scara se sprijină numai pe o suprafață plană, curată și uscată, cu ambele picioare la sol.',
  'Pe scară urcă o singură persoană, cu fața spre scară și cu mâinile libere de unelte.',
  'Lucrătorul păstrează trei puncte de sprijin pe scară în tot timpul lucrului la înălțime.',
  'Scara defectă se scoate din folosință și se semnalează imediat conducătorului locului de muncă.',
];

const officeArticles = [
  'Lucrătorul de birou își reglează scaunul astfel încât picioarele să stea sprijinite pe podea.',
  'Ecranul se așază la distanța unui braț, cu marginea de sus la nivelul ochilor lucrătorului.',
  'După fiecare oră de lucru la calculator lucrătorul face o pauză scurtă de cinci minute.',
  'Cablurile prelungitoarelor nu se trec peste căile de circulație dintre birouri și ușă.',
];

const module = (
  id: string,
  title: string,
  articles: string[],
  domain: 'ssm' | 'psi' = 'ssm'
): LibraryModule => ({
  id,
  title,
  category: domain === 'ssm' ? 'work_equipment' : 'premises_activity',
  domain,
  body: body(...articles),
});

const packed = (key: string, title: string, articles: string[]): PackInstruction => ({
  key,
  title,
  body: body(...articles),
});

const ladders = module('m-ladders', 'Utilizarea scărilor metalice', ladderArticles);
const office = module('m-office', 'Activități desfășurate în birouri', officeArticles);

const compare = (
  instructions: PackInstruction[],
  library: LibraryModule[],
  judged?: Map<string, boolean>
) =>
  compareWithLibrary({
    domain: 'ssm',
    instructions,
    library,
    clientName: 'Brutăria Fictivă',
    judged,
  });

describe('compareWithLibrary', () => {
  it('finds an identical module whatever the case, diacritics and punctuation', async () => {
    const plain = ladderArticles.map((text) =>
      text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/,/g, '')
    );

    const [result] = await compare([packed('ssm-1', 'Scări', plain)], [office, ladders]);

    expect(result).toMatchObject({
      status: 'identical',
      choice: null,
      match: { moduleId: 'm-ladders', similarity: 1, decidedBy: 'hash', differences: [] },
    });
  });

  it('takes the hash the library stored for its module', async () => {
    const pack = packed('ssm-1', 'Scări', ladderArticles);
    const stored = { ...office, textHash: await textHash(pack.body) };

    const [result] = await compare([pack], [stored]);

    expect(result!.match).toMatchObject({ moduleId: 'm-office', decidedBy: 'hash' });
  });

  it('proposes using a similar module, with the changed words marked', async () => {
    const edited = [...ladderArticles];
    edited[1] =
      'Scara se sprijină numai pe o suprafață plană, curată și uscată, cu ambele tălpi la sol.';

    const [result] = await compare(
      [packed('ssm-1', 'Utilizarea scărilor metalice', edited)],
      [ladders]
    );

    expect(result!.status).toBe('similar');
    expect(result!.choice).toBe('use_existing');
    expect(result!.match!.decidedBy).toBe('overlap');
    expect(result!.match!.differences).toEqual([
      {
        kind: 'changed',
        article: 2,
        libraryArticle: 2,
        words: [
          {
            text: 'Scara se sprijină numai pe o suprafață plană, curată și uscată, cu ambele',
            change: 'same',
          },
          { text: 'tălpi', change: 'added' },
          { text: 'picioare', change: 'removed' },
          { text: 'la sol.', change: 'same' },
        ],
      },
    ]);
  });

  it('proposes adding as new a similar instruction that has articles the module lacks', async () => {
    const receptionist = [
      'Recepționerul comunică calm cu oaspeții și cheamă la nevoie șeful direct sau numărul 112.',
      ...officeArticles,
    ];

    const [result] = await compare(
      [packed('ssm-1', 'Recepționeri de hotel', receptionist)],
      [office]
    );

    expect(result!.status).toBe('similar');
    expect(result!.choice).toBe('add_new');
    expect(result!.match!.differences).toEqual([{ kind: 'added', article: 1 }]);
  });

  it('keeps using the module when the pack only lacks some of its articles', async () => {
    const [result] = await compare(
      [packed('ssm-1', 'Utilizarea scărilor metalice', ladderArticles.slice(0, 4))],
      [ladders]
    );

    expect(result!.choice).toBe('use_existing');
    expect(result!.match!.differences).toEqual([{ kind: 'removed', libraryArticle: 5 }]);
  });

  it('asks the model about a pair between the thresholds and follows its answer', async () => {
    const mixed = [
      ...ladderArticles.slice(0, 2),
      ...officeArticles.slice(0, 2),
      'Text propriu nou.',
    ];
    const instructions = [packed('ssm-1', 'Lucrul în depozit', mixed)];

    const pairs = await similarityPairs({
      domain: 'ssm',
      instructions,
      library: [ladders, office],
    });

    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.similarity).toBeGreaterThanOrEqual(0.25);
    expect(pairs[0]!.similarity).toBeLessThan(0.5);
    const yes = await compare(instructions, [ladders, office], new Map([[pairs[0]!.id, true]]));
    const no = await compare(instructions, [ladders, office], new Map([[pairs[0]!.id, false]]));
    expect(yes[0]!.status).toBe('similar');
    expect(yes[0]!.match!.decidedBy).toBe('model');
    expect(no[0]!.status).toBe('new');
  });

  it('proposes as new an instruction like no module, with no question to the model', async () => {
    const instructions = [
      packed('ssm-1', 'Utilizarea feliatorului', ['Feliatorul se curăță numai oprit.']),
    ];

    expect(await similarityPairs({ domain: 'ssm', instructions, library: [ladders] })).toEqual([]);
    expect((await compare(instructions, [ladders]))[0]).toMatchObject({
      status: 'new',
      match: null,
    });
  });

  it('compares only with the modules of the instruction’s domain', async () => {
    const psiLadders = module('m-psi', 'Scări', ladderArticles, 'psi');

    const [result] = await compare([packed('ssm-1', 'Scări', ladderArticles)], [psiLadders]);

    expect(result!.status).toBe('new');
  });

  it('puts the client’s name after a title the library already has', async () => {
    const [result] = await compare(
      [
        packed('ssm-1', 'Utilizarea scărilor metalice', [
          'Alt text, cu totul diferit de modulul bibliotecii.',
        ]),
      ],
      [ladders]
    );

    expect(result!.title).toBe('Utilizarea scărilor metalice (Brutăria Fictivă)');
  });

  it('folds an instruction the pack holds twice into one', async () => {
    const result = await compare(
      [
        packed('ssm-1', 'Scări', ladderArticles),
        packed('ssm-2', 'Scări din depozit', ladderArticles),
      ],
      []
    );

    expect(result.map((item) => [item.key, item.sameAs])).toEqual([['ssm-1', ['ssm-2']]]);
  });
});

describe('articleDifferences', () => {
  it('lists articles added, removed and changed in the order of the pack', () => {
    const library = body(
      'Unu doi trei patru cinci.',
      'Șase șapte opt nouă zece.',
      'Text scos din pachet.'
    );
    const pack = body(
      'Text nou la început.',
      'Unu doi trei patru cinci.',
      'Șase șapte opt nouă unsprezece.'
    );

    expect(articleDifferences(pack, library)).toEqual([
      { kind: 'added', article: 1 },
      {
        kind: 'changed',
        article: 3,
        libraryArticle: 2,
        words: [
          { text: 'Șase șapte opt nouă', change: 'same' },
          { text: 'unsprezece.', change: 'added' },
          { text: 'zece.', change: 'removed' },
        ],
      },
      { kind: 'removed', libraryArticle: 3 },
    ]);
  });
});

describe('namesClient', () => {
  it('finds the client’s legal name in a body, without its company form', () => {
    expect(
      namesClient(
        body('Lucrătorii S.C. BRUTĂRIA FICTIVĂ S.R.L. poartă halat.'),
        'Brutăria Fictivă SRL'
      )
    ).toBe(true);
    expect(namesClient(body('Lucrătorii brutăriei poartă halat.'), 'Brutăria Fictivă SRL')).toBe(
      false
    );
  });
});

describe('similarityRequest', () => {
  it('sends each pair’s beginnings to GPT-6 Luna in one request and reads its answer by pair', () => {
    const instructions = [packed('ssm-1', 'Lucrul în depozit', ['x'.repeat(5_000)])];
    const request = similarityRequest(
      [{ id: 'ssm:ssm-1:m-office', key: 'ssm-1', moduleId: 'm-office', similarity: 0.3 }],
      instructions,
      [office]
    );

    expect(request.model).toBe('gpt-6-luna');
    expect(request.messages).toHaveLength(2);
    const content = request.messages[1]!.content as string;
    expect(content).toContain('=== PAIR ssm:ssm-1:m-office ===');
    expect(content).toContain('--- B: Activități desfășurate în birouri ---');
    expect(content.length).toBeLessThan(5_000);
    expect(
      judgements(request.answer.parse({ pairs: [{ id: 'ssm:ssm-1:m-office', same: true }] }))
    ).toEqual(new Map([['ssm:ssm-1:m-office', true]]));
  });
});
