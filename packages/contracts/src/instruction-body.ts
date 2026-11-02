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

// The hints and examples are help text written for the form, never a shipped instruction: the
// library starts empty (ADR 034).
export const guidedTemplates: Record<InstructionCategory, readonly GuidedSection[]> = {
  work_activity: [
    {
      key: 'scope',
      heading: 'Domeniul de aplicare',
      hint: 'Ce activitate acoperă instrucțiunea, unde se desfășoară și cui i se aplică.',
      example:
        'Prezenta instrucțiune se aplică lucrătorilor care desfășoară activități de birou: lucrul la calculator, întocmirea și arhivarea documentelor și folosirea echipamentelor de birou.',
    },
    {
      key: 'qualification',
      heading: 'Calificarea necesară',
      hint: 'Ce pregătire, autorizare sau aviz medical îi trebuie lucrătorului ca să înceapă activitatea.',
      example:
        'Activitatea poate fi desfășurată numai de lucrători apți din punct de vedere medical, instruiți în domeniul securității și sănătății în muncă și care cunosc prezenta instrucțiune.',
    },
    {
      key: 'before_work',
      heading: 'Înainte de începerea lucrului',
      hint: 'Ce verifică și pregătește lucrătorul la începutul programului: locul de muncă, echipamentele, materialele.',
      example:
        'La începerea programului, lucrătorul verifică dacă locul de muncă este curat, ordonat și bine iluminat și dacă au rămas libere căile de acces.',
    },
    {
      key: 'during_work',
      heading: 'În timpul lucrului',
      hint: 'Regulile de lucru în siguranță pe durata activității, în ordinea în care se lucrează.',
      example:
        'Lucrătorul păstrează căile de circulație libere și nu lasă cabluri, cutii sau alte obiecte pe unde se trece.',
    },
    {
      key: 'after_work',
      heading: 'La terminarea lucrului',
      hint: 'Ce face lucrătorul la sfârșitul programului: oprirea echipamentelor, ordinea, predarea locului de muncă.',
      example:
        'La terminarea lucrului, lucrătorul oprește echipamentele care nu trebuie să rămână pornite și lasă locul de muncă în ordine.',
    },
    {
      key: 'protective_equipment',
      heading: 'Echipament de protecție necesar',
      hint: 'Echipamentul individual de protecție pe care îl poartă lucrătorul și în ce momente.',
      example:
        'Pe durata activității, lucrătorul poartă echipamentul individual de protecție primit pentru postul său și îl folosește potrivit instruirii.',
    },
    {
      key: 'forbidden',
      heading: 'Acțiuni interzise',
      hint: 'Ce nu are voie să facă lucrătorul: câte o interdicție într-un articol, sau o listă într-un articol.',
      example:
        'Este interzis ca lucrătorul să repare singur echipamentele electrice defecte; defecțiunile se anunță conducătorului locului de muncă.',
    },
    {
      key: 'emergencies',
      heading: 'Situații de urgență',
      hint: 'Ce face lucrătorul la un accident, la un incendiu sau la altă situație de urgență și pe cine anunță.',
      example:
        'În caz de accident, lucrătorul anunță imediat conducătorul locului de muncă, acordă primul ajutor dacă a fost instruit pentru aceasta și apelează numărul unic de urgență 112 când este nevoie.',
    },
  ],
  work_equipment: [
    {
      key: 'scope',
      heading: 'Domeniul de aplicare',
      hint: 'Ce echipament de muncă acoperă instrucțiunea (tipul, eventual modelul) și la ce lucrări se folosește.',
      example:
        'Prezenta instrucțiune se aplică la utilizarea polizorului unghiular portabil pentru tăierea și șlefuirea pieselor metalice.',
    },
    {
      key: 'who_may_use',
      heading: 'Cine îl poate folosi',
      hint: 'Cine are voie să folosească echipamentul: instruirea, calificarea sau autorizarea cerută.',
      example:
        'Echipamentul poate fi folosit numai de lucrătorii instruiți pentru utilizarea lui, care cunosc instrucțiunile producătorului și prezenta instrucțiune.',
    },
    {
      key: 'checks_before_start',
      heading: 'Verificări înainte de pornire',
      hint: 'Ce verifică lucrătorul la echipament înainte de fiecare pornire.',
      example:
        'Înainte de pornire, lucrătorul verifică starea cablului de alimentare, a ștecherului și a carcasei și nu folosește echipamentul dacă observă fisuri, izolație deteriorată sau piese lipsă.',
    },
    {
      key: 'during_use',
      heading: 'În timpul utilizării',
      hint: 'Cum se lucrează în siguranță cu echipamentul: poziția, prinderea piesei, distanțele, ce se urmărește.',
      example:
        'În timpul utilizării, lucrătorul ține echipamentul cu ambele mâini, de mânerele prevăzute, și își păstrează o poziție stabilă.',
    },
    {
      key: 'stop_clean_maintain',
      heading: 'Oprire, curățare și întreținere',
      hint: 'Cum se oprește echipamentul, cum se curăță și cine face întreținerea.',
      example:
        'Curățarea, reglarea și schimbarea accesoriilor se fac numai cu echipamentul oprit și deconectat de la sursa de energie.',
    },
    {
      key: 'on_fault',
      heading: 'Ce faci la o defecțiune',
      hint: 'Ce face lucrătorul când echipamentul nu funcționează normal: îl oprește, îl semnalizează, anunță.',
      example:
        'La orice defecțiune sau funcționare anormală, lucrătorul oprește echipamentul, îl deconectează, nu îl mai folosește și anunță conducătorul locului de muncă.',
    },
    {
      key: 'protective_equipment',
      heading: 'Echipament de protecție necesar',
      hint: 'Echipamentul individual de protecție obligatoriu la lucrul cu acest echipament.',
      example:
        'La lucrul cu echipamentul, lucrătorul poartă ochelari de protecție, mănuși de protecție și antifoane.',
    },
    {
      key: 'forbidden',
      heading: 'Acțiuni interzise',
      hint: 'Ce este interzis la folosirea echipamentului.',
      example:
        'Este interzisă îndepărtarea sau blocarea apărătorilor și a dispozitivelor de protecție ale echipamentului.',
    },
    {
      key: 'emergencies',
      heading: 'Situații de urgență',
      hint: 'Ce face lucrătorul la un accident sau la un incendiu în care este implicat echipamentul.',
      example:
        'În caz de accidentare, lucrătorul oprește imediat echipamentul, acordă sau cere primul ajutor și anunță conducătorul locului de muncă.',
    },
  ],
  protective_equipment: [
    {
      key: 'scope',
      heading: 'Domeniul de aplicare',
      hint: 'Ce echipament individual de protecție acoperă instrucțiunea și împotriva căror riscuri protejează.',
      example:
        'Prezenta instrucțiune se aplică la utilizarea căștii de protecție, care protejează capul împotriva loviturilor și a obiectelor care cad.',
    },
    {
      key: 'when_worn',
      heading: 'Când se poartă',
      hint: 'În ce zone, la ce lucrări sau în ce situații este obligatorie purtarea lui.',
      example:
        'Casca de protecție se poartă pe toată durata lucrului în zonele marcate cu indicatorul de purtare obligatorie a căștii.',
    },
    {
      key: 'check_before_use',
      heading: 'Verificarea înainte de folosire',
      hint: 'Ce verifică lucrătorul la echipament înainte de fiecare folosire.',
      example:
        'Înainte de folosire, lucrătorul verifică dacă echipamentul este întreg și curat, fără fisuri, deformări sau piese lipsă.',
    },
    {
      key: 'wearing_fitting',
      heading: 'Purtare și reglare',
      hint: 'Cum se pune, se reglează și se poartă corect echipamentul.',
      example:
        'Lucrătorul reglează echipamentul pe măsura lui, astfel încât să stea fix și să nu-l stânjenească în timpul lucrului.',
    },
    {
      key: 'storage_maintenance',
      heading: 'Păstrare, întreținere și înlocuire',
      hint: 'Unde și cum se păstrează echipamentul, cum se curăță și când se înlocuiește.',
      example:
        'Echipamentul deteriorat sau cu durata de utilizare depășită se predă și se înlocuiește; lucrătorul nu îl repară singur.',
    },
    {
      key: 'forbidden',
      heading: 'Acțiuni interzise',
      hint: 'Ce este interzis în legătură cu echipamentul.',
      example:
        'Este interzisă modificarea echipamentului individual de protecție sau folosirea lui în alt scop decât cel pentru care a fost primit.',
    },
  ],
  premises_activity: [
    {
      key: 'scope',
      heading: 'Domeniul de aplicare',
      hint: 'Ce spații sau ce activitate acoperă instrucțiunea și cui i se aplică.',
      example:
        'Prezenta instrucțiune se aplică în spațiile de birouri și tuturor persoanelor care lucrează în ele.',
    },
    {
      key: 'ignition_sources',
      heading: 'Surse de aprindere și materiale combustibile',
      hint: 'Ce surse de aprindere și ce materiale combustibile sunt în spațiu și cum se țin sub control.',
      example:
        'Materialele combustibile, cum sunt hârtia, cartoanele și ambalajele, se păstrează departe de radiatoare, de aparatele electrice și de alte surse de căldură.',
    },
    {
      key: 'during_work',
      heading: 'Reguli în timpul lucrului',
      hint: 'Regulile de prevenire a incendiilor pe durata lucrului.',
      example: 'Fumatul este permis numai în locurile amenajate și marcate în acest scop.',
    },
    {
      key: 'end_of_day',
      heading: 'La terminarea programului',
      hint: 'Ce se verifică și ce se oprește la sfârșitul programului.',
      example:
        'La terminarea programului, ultimul lucrător care părăsește spațiul verifică dacă aparatele electrice sunt oprite și dacă nu a rămas nicio sursă de foc nesupravegheată.',
    },
    {
      key: 'on_fire',
      heading: 'Dacă izbucnește un incendiu',
      hint: 'Ce face lucrătorul când observă un incendiu: alarma, anunțarea, primele măsuri.',
      example:
        'Lucrătorul care observă un incendiu anunță imediat persoanele din jur și conducătorul locului de muncă și apelează numărul unic de urgență 112.',
    },
    {
      key: 'extinguishing_evacuation',
      heading: 'Mijloacele de stingere și evacuarea',
      hint: 'Unde sunt mijloacele de stingere, cine le folosește și pe unde se face evacuarea.',
      example:
        'Căile de evacuare și ieșirile de urgență se păstrează libere în permanență; este interzisă blocarea lor cu mobilier sau cu materiale.',
    },
  ],
  installation_equipment: [
    {
      key: 'scope',
      heading: 'Domeniul de aplicare',
      hint: 'Ce instalație sau ce echipament acoperă instrucțiunea și unde se află.',
      example:
        'Prezenta instrucțiune se aplică la exploatarea instalației electrice de iluminat și prize a clădirii.',
    },
    {
      key: 'who_may_operate',
      heading: 'Cine le poate exploata',
      hint: 'Cine are voie să exploateze, să regleze sau să repare instalația și ce autorizare îi trebuie.',
      example: 'Intervențiile la instalația electrică se fac numai de electricieni autorizați.',
    },
    {
      key: 'operating_rules',
      heading: 'Reguli de exploatare',
      hint: 'Regulile de folosire în siguranță, din punctul de vedere al incendiilor.',
      example:
        'Nu se conectează la o priză, prin prelungitoare sau prize multiple, consumatori cu o putere totală mai mare decât cea admisă.',
    },
    {
      key: 'checks_maintenance',
      heading: 'Verificări și întreținere',
      hint: 'Ce se verifică, cât de des și cine ține evidența verificărilor.',
      example:
        'Instalația se verifică periodic, la termenele stabilite de producător și de normele tehnice, iar verificările se consemnează.',
    },
    {
      key: 'forbidden',
      heading: 'Acțiuni interzise',
      hint: 'Ce este interzis la exploatarea instalației.',
      example:
        'Este interzisă folosirea siguranțelor improvizate sau supradimensionate și a conductorilor cu izolația deteriorată.',
    },
    {
      key: 'on_fire',
      heading: 'Dacă izbucnește un incendiu',
      hint: 'Ce se face dacă instalația ia foc: oprirea alimentării, stingerea, anunțarea.',
      example:
        'La un început de incendiu la instalația electrică se întrerupe alimentarea cu energie electrică, iar stingerea se face cu stingătoare cu pulbere sau cu dioxid de carbon, niciodată cu apă.',
    },
  ],
  hazardous_work: [
    {
      key: 'scope',
      heading: 'Domeniul de aplicare',
      hint: 'Ce lucrare periculoasă acoperă instrucțiunea (sudură, tăiere, lucru cu foc deschis) și unde se execută.',
      example:
        'Prezenta instrucțiune se aplică lucrărilor cu foc deschis, cum sunt sudura, tăierea și lipirea, executate în afara locurilor amenajate pentru ele.',
    },
    {
      key: 'before_work',
      heading: 'Înainte de începerea lucrării',
      hint: 'Ce se pregătește înainte: permisul de lucru cu foc, îndepărtarea materialelor combustibile, mijloacele de stingere.',
      example:
        'Lucrările cu foc deschis încep numai după emiterea permisului de lucru cu foc și după îndepărtarea sau protejarea materialelor combustibile din zonă.',
    },
    {
      key: 'during_work',
      heading: 'În timpul lucrării',
      hint: 'Regulile pe durata lucrării: supravegherea, mijloacele de stingere la îndemână, zona de lucru.',
      example:
        'Pe durata lucrării, la locul de muncă se află mijloace de stingere pregătite pentru intervenție și o persoană care supraveghează zona.',
    },
    {
      key: 'after_work',
      heading: 'După terminarea lucrării',
      hint: 'Ce se verifică după terminarea lucrării și cât timp se supraveghează zona.',
      example:
        'După terminarea lucrării, zona de lucru și spațiile vecine se verifică pentru a se stinge orice focar și se supraveghează cât prevede permisul de lucru cu foc.',
    },
    {
      key: 'forbidden',
      heading: 'Acțiuni interzise',
      hint: 'Ce este interzis la executarea lucrării.',
      example:
        'Este interzisă executarea lucrărilor cu foc deschis fără permis de lucru cu foc sau în apropierea materialelor și substanțelor inflamabile.',
    },
    {
      key: 'on_fire',
      heading: 'Dacă izbucnește un incendiu',
      hint: 'Ce se face dacă izbucnește un incendiu în timpul lucrării.',
      example:
        'La izbucnirea unui incendiu, lucrarea se oprește imediat, se anunță persoanele din zonă și se intervine cu mijloacele de stingere din dotare; dacă focul nu poate fi stăpânit, se apelează numărul unic de urgență 112.',
    },
  ],
};
