import { z } from 'zod';

import { foldText } from './fold-text';
import type { InstructionDomain } from './instruction-modules';

export const instructionCategoriesByDomain = {
  ssm: ['work_activity', 'work_equipment', 'protective_equipment'],
  psi: ['premises_activity', 'installation_equipment', 'hazardous_work'],
} as const satisfies Record<InstructionDomain, readonly string[]>;

export const instructionCategories = [
  ...instructionCategoriesByDomain.ssm,
  ...instructionCategoriesByDomain.psi,
] as const;

export const instructionCategorySchema = z.enum(instructionCategories);

export type InstructionCategory = z.infer<typeof instructionCategorySchema>;

export const instructionCategoryLabels: Record<InstructionCategory, string> = {
  work_activity: 'Activități',
  work_equipment: 'Echipamente de muncă',
  protective_equipment: 'Echipament de protecție',
  premises_activity: 'Spații și activități',
  installation_equipment: 'Instalații și echipamente',
  hazardous_work: 'Lucrări periculoase',
};

export function categoryDomain(category: InstructionCategory): InstructionDomain {
  return (instructionCategoriesByDomain.ssm as readonly string[]).includes(category)
    ? 'ssm'
    : 'psi';
}

export function categoryFitsDomain(category: InstructionCategory, domain: InstructionDomain) {
  return categoryDomain(category) === domain;
}

export const maxInstructionArticles = 400;
export const maxInstructionCharacters = 200_000;

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !/[\r\n]/.test(text), 'Un rând, fără treceri la rând nou.');

export const instructionHeadingSchema = z.object({
  kind: z.literal('heading'),
  text: oneLine(300),
});

export type InstructionHeading = z.infer<typeof instructionHeadingSchema>;

// A paragraph after the first that opens with a marker ("a)", "1.", "–", "•") keeps it as
// typed; the engine hangs the paragraph from it.
export const instructionArticleSchema = z.object({
  kind: z.literal('article'),
  paragraphs: z.array(oneLine(20_000)).min(1),
});

export type InstructionArticle = z.infer<typeof instructionArticleSchema>;

export const instructionBlockSchema = z.discriminatedUnion('kind', [
  instructionHeadingSchema,
  instructionArticleSchema,
]);

export type InstructionBlock = z.infer<typeof instructionBlockSchema>;

export const instructionBodySchema = z
  .object({ blocks: z.array(instructionBlockSchema) })
  .superRefine((body, context) => {
    const articles = articleCount(body);
    if (articles === 0) {
      context.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'Instrucțiunea are cel puțin un articol.',
      });
    }
    if (articles > maxInstructionArticles) {
      context.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: `Instrucțiunea are cel mult ${maxInstructionArticles} de articole.`,
      });
    }
    if (bodyCharacters(body) > maxInstructionCharacters) {
      context.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: `Textul instrucțiunii are cel mult ${maxInstructionCharacters.toLocaleString('ro-RO')} de caractere.`,
      });
    }
  });

export type InstructionBody = z.infer<typeof instructionBodySchema>;

type BodyLike = { blocks: readonly InstructionBlock[] };

export function articleCount(body: BodyLike) {
  return body.blocks.filter((block) => block.kind === 'article').length;
}

export function bodyCharacters(body: BodyLike) {
  let total = 0;
  for (const block of body.blocks) {
    if (block.kind === 'heading') total += block.text.length;
    else for (const paragraph of block.paragraphs) total += paragraph.length;
  }
  return total;
}

// Folded, so a save that only moved whitespace, case or punctuation hashes the same; the kinds
// and the paragraph breaks stay in, since they change the articles the themes cite.
export function foldedBody(body: BodyLike) {
  return body.blocks
    .map((block) =>
      block.kind === 'heading'
        ? `heading\n${foldText(block.text)}`
        : `article\n${block.paragraphs.map(foldText).join('\n')}`
    )
    .join('\n\n');
}

export async function textHash(body: BodyLike): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(foldedBody(body)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// No act prescribes these headings: the member may rename, move or delete any of them.
export interface GuidedSection {
  key: string;
  heading: string;
  hint?: string;
  example?: string;
}

export const guidedTemplates: Record<InstructionCategory, readonly GuidedSection[]> = {
  work_activity: [
    { key: 'scope', heading: 'Domeniul de aplicare' },
    { key: 'qualification', heading: 'Calificarea necesară' },
    { key: 'before_work', heading: 'Înainte de începerea lucrului' },
    { key: 'during_work', heading: 'În timpul lucrului' },
    { key: 'after_work', heading: 'La terminarea lucrului' },
    { key: 'protective_equipment', heading: 'Echipament de protecție necesar' },
    { key: 'forbidden', heading: 'Acțiuni interzise' },
    { key: 'emergencies', heading: 'Situații de urgență' },
  ],
  work_equipment: [
    { key: 'scope', heading: 'Domeniul de aplicare' },
    { key: 'who_may_use', heading: 'Cine îl poate folosi' },
    { key: 'checks_before_start', heading: 'Verificări înainte de pornire' },
    { key: 'during_use', heading: 'În timpul utilizării' },
    { key: 'stop_clean_maintain', heading: 'Oprire, curățare și întreținere' },
    { key: 'on_fault', heading: 'Ce faci la o defecțiune' },
    { key: 'protective_equipment', heading: 'Echipament de protecție necesar' },
    { key: 'forbidden', heading: 'Acțiuni interzise' },
    { key: 'emergencies', heading: 'Situații de urgență' },
  ],
  protective_equipment: [
    { key: 'scope', heading: 'Domeniul de aplicare' },
    { key: 'when_worn', heading: 'Când se poartă' },
    { key: 'check_before_use', heading: 'Verificarea înainte de folosire' },
    { key: 'wearing_fitting', heading: 'Purtare și reglare' },
    { key: 'storage_maintenance', heading: 'Păstrare, întreținere și înlocuire' },
    { key: 'forbidden', heading: 'Acțiuni interzise' },
  ],
  premises_activity: [
    { key: 'scope', heading: 'Domeniul de aplicare' },
    { key: 'ignition_sources', heading: 'Surse de aprindere și materiale combustibile' },
    { key: 'during_work', heading: 'Reguli în timpul lucrului' },
    { key: 'end_of_day', heading: 'La terminarea programului' },
    { key: 'on_fire', heading: 'Dacă izbucnește un incendiu' },
    { key: 'extinguishing_evacuation', heading: 'Mijloacele de stingere și evacuarea' },
  ],
  installation_equipment: [
    { key: 'scope', heading: 'Domeniul de aplicare' },
    { key: 'who_may_operate', heading: 'Cine le poate exploata' },
    { key: 'operating_rules', heading: 'Reguli de exploatare' },
    { key: 'checks_maintenance', heading: 'Verificări și întreținere' },
    { key: 'forbidden', heading: 'Acțiuni interzise' },
    { key: 'on_fire', heading: 'Dacă izbucnește un incendiu' },
  ],
  hazardous_work: [
    { key: 'scope', heading: 'Domeniul de aplicare' },
    { key: 'before_work', heading: 'Înainte de începerea lucrării' },
    { key: 'during_work', heading: 'În timpul lucrării' },
    { key: 'after_work', heading: 'După terminarea lucrării' },
    { key: 'forbidden', heading: 'Acțiuni interzise' },
    { key: 'on_fire', heading: 'Dacă izbucnește un incendiu' },
  ],
};
