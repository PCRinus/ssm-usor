import type { InstructionBlock, InstructionBody, InstructionCategory } from '@ssm-usor/contracts';
import { type InstructionsProposal, proposeInstructions } from '@ssm-usor/import';

import { moduleFixture } from './support';

// An invented bakery's pack: its own instructions as the reading would have cut them.

export const bakery = {
  legalName: 'BRUTĂRIA SPICUL AURIU S.R.L.',
  name: 'Brutăria Spicul Auriu',
  cui: '1590082',
  posts: ['Brutar', 'Șofer livrări', 'Vânzător'],
};

const article = (...paragraphs: string[]): InstructionBlock => ({ kind: 'article', paragraphs });
const heading = (text: string): InstructionBlock => ({ kind: 'heading', text });

export const officeWork: InstructionBody = {
  blocks: [
    heading('Domeniul de aplicare'),
    article(
      'Prezenta instrucțiune se aplică lucrătorilor care desfășoară activități de birou și lucrează la calculator.'
    ),
    heading('În timpul lucrului'),
    article('Monitorul se așază la nivelul ochilor, la o distanță de 50–70 cm.'),
    article('Lucrătorul face o pauză de 10 minute după fiecare oră de lucru la calculator.'),
    article('Cablurile se trec pe după mobilier, ca să nu se calce pe ele.'),
  ],
};

const oven: InstructionBody = {
  blocks: [
    heading('Domeniul de aplicare'),
    article(
      `Prezenta instrucțiune se aplică brutarilor care folosesc cuptorul de patiserie al ${bakery.legalName} în atelierul de producție.`
    ),
    heading('Verificări înainte de pornire'),
    article(
      'Brutarul verifică:',
      'a) garnitura ușii cuptorului;',
      'b) funcționarea ventilației;',
      'c) curățenia vetrei.'
    ),
    heading('În timpul utilizării'),
    article('Tăvile se scot numai cu mănuși termoizolante.'),
    article('Ușa cuptorului nu se lasă deschisă în timpul coacerii.'),
    heading('Acțiuni interzise'),
    article('Este interzisă așezarea recipientelor cu ulei lângă ușa cuptorului.'),
  ],
};

const position = (
  key: string,
  post: string,
  clientPost: string,
  resolution: InstructionsProposal['positions'][number]['resolution'],
  citation: string
): InstructionsProposal['positions'][number] => ({
  key,
  post,
  variant: '',
  clientPost,
  citations: [
    {
      section: 'workplace',
      citation,
      file: 'Dosar/Tematica SSM.docx',
      quote: `${post} – ${citation}`,
    },
  ],
  resolution,
  missing: [],
});

const cut = (
  key: string,
  number: string,
  title: string,
  category: InstructionCategory,
  body: InstructionBody,
  firstArticle: number
) => {
  const articles = body.blocks
    .filter((block) => block.kind === 'article')
    .map((_, index) => ({ sourceNumber: firstArticle + index }));
  return {
    key,
    file: 'Dosar/3.2 IPSSM.docx',
    number,
    title,
    category,
    location: {
      file: 'Dosar/3.2 IPSSM.docx',
      start: 0,
      end: 1,
      firstParagraph: 0,
      lastParagraph: 1,
    },
    body,
    articles,
    flags: [],
  };
};

export async function bakeryProposal(library: { ladders: string; office: string }) {
  const ladders = (await moduleFixture('ssm')).body;
  const packLadders: InstructionBody = {
    blocks: ladders.blocks.map((block, index) =>
      index === 1 && block.kind === 'article'
        ? article(block.paragraphs[0]!.replace('3 metri', '2 metri, în brutărie și în depozit'))
        : block
    ),
  };
  return proposeInstructions({
    read: {
      domain: 'ssm',
      instructions: [
        cut(
          'instruction-1',
          'XIII.II',
          'Instrucțiuni proprii în domeniul securității și sănătății în muncă privind utilizarea cuptorului de patiserie',
          'work_equipment',
          oven,
          297
        ),
        cut('instruction-2', 'XIII.III', 'Scări metalice', 'work_equipment', packLadders, 304),
        cut(
          'instruction-3',
          'XIII.I',
          'Instrucțiuni proprii în domeniul securității și sănătății în muncă privind activitățile de birou',
          'work_activity',
          officeWork,
          288
        ),
      ],
      unread: [],
      positions: [
        position(
          'theme-1',
          'BRUTAR',
          'Brutar',
          { kind: 'resolved', instructions: ['instruction-1', 'instruction-3'] },
          'IPSSM Art. 1 – 287 ; 288 – 303'
        ),
        position(
          'theme-2',
          'ȘOFER LIVRĂRI',
          'Șofer livrări',
          { kind: 'resolved', instructions: ['instruction-2'] },
          'IPSSM Art. 1 – 287 ; 304 – 315'
        ),
        position(
          'theme-3',
          'VÂNZĂTOR',
          'Vânzător',
          {
            kind: 'undecided',
            reasons: [{ kind: 'cuts_instruction', instruction: 'instruction-1' }],
          },
          'IPSSM Art. 1 – 299'
        ),
      ],
    },
    library: [
      {
        id: library.ladders,
        title: 'Scări metalice',
        category: 'work_equipment',
        domain: 'ssm',
        body: ladders,
      },
      {
        id: library.office,
        title: 'Activități de birou',
        category: 'work_activity',
        domain: 'ssm',
        body: officeWork,
      },
    ],
    client: { name: bakery.name, legalName: bakery.legalName },
  });
}
