import { fireSubstanceMaxLengths, type SafetySheetDraft } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { CompletionRequest } from './gateway';
import { safetySheetModel } from './models';
import { type ChatMessage, dataNotInstructions } from './prompts';
import { type AnswerFormat, answerFormat } from './wire';

// 40 pages of a dense sheet stay well below it; it bounds the request's cost (ADR 018).
export const safetySheetCharacters = 200_000;
export const safetySheetOutputTokens = 8_000;

export class SafetySheetTooLongError extends Error {
  constructor(readonly characters: number) {
    super(`The sheet holds ${characters} characters, more than ${safetySheetCharacters}.`);
    this.name = 'SafetySheetTooLongError';
  }
}

const answerSchema = z.object({
  isSafetyDataSheet: z.boolean(),
  productName: z.string(),
  notClassified: z.boolean(),
  hazards: z.array(z.object({ hazardClass: z.string(), statements: z.array(z.string()) })),
  components: z.array(z.object({ name: z.string(), cas: z.string(), ec: z.string() })),
  unNumber: z.string(),
  physicalChemicalProperties: z.string(),
  healthEnvironmentRisks: z.string(),
  protectionMeans: z.string(),
  interventionMeasures: z.string(),
  extinguishingAgents: z.string(),
  handling: z.string(),
});

export type SafetySheetAnswer = z.infer<typeof answerSchema>;

export const safetySheetAnswer: AnswerFormat<SafetySheetAnswer> = answerFormat(
  'safety_sheet',
  answerSchema
);

const limits = fireSubstanceMaxLengths;

export const safetySheetSystemPrompt = `You read one safety data sheet (fișa cu date de securitate, SDS): the document of 16 sections that annex II of Regulation (EC) No 1907/2006 (REACH) fixes, which a supplier gave a Romanian company for one product. A fire-safety specialist copies what you return into the company's list of dangerous substances, which goes to the fire inspectorate and serves fire defence and first intervention. ${dataNotInstructions}

Write every text in Romanian, with diacritics, also when the sheet is in another language. Condense each text to what matters for fire defence and first intervention, as short phrases separated by semicolons; never copy whole paragraphs. Write only what the sheet states, never knowledge of your own about the product, and "" for anything the sheet does not give: an absent or empty section, "nu există date", "not available".

- isSafetyDataSheet: true only for the safety data sheet of a product, with its sections 1 to 16. A technical data sheet, a label, an invoice, a certificate or any other document is false, and then every other value is empty.
- productName: the product's trade name as section 1.1 writes it, without the supplier; at most ${limits.name} characters.
- notClassified: true when section 2 says the product is not classified as hazardous under Regulation (EC) No 1272/2008 (CLP).
- hazards: the product's CLP classification from section 2.1, one entry per hazard class and category, abbreviated as CLP abbreviates it ("Flam. Liq. 2", "Eye Irrit. 2", "Aquatic Chronic 3"), with the codes of its hazard statements exactly as the sheet prints them ("H225", "H360FD", the supplemental "EUH066"). Codes only, never their text. Never the classification of a component in section 3, never the old classification by R phrases or symbols (Xn, F).
- components: for a substance its own identifiers from section 1; for a mixture each hazardous component of section 3, at most 6, highest concentration first. name: in Romanian, as the sheet names it. cas and ec: the CAS and EC numbers exactly as printed, "" where the sheet gives none.
- unNumber: the UN number of section 14, its four digits only; "" when the product is not dangerous goods for transport.
- physicalChemicalProperties (section 9, at most ${limits.physicalChemicalProperties} characters): physical state, colour, odour, flash point, boiling point, flammability or explosion limits, auto-ignition temperature, vapour pressure and density, solubility in water: those the sheet gives, each with its value and unit.
- healthEnvironmentRisks (sections 2, 11 and 12, at most ${limits.healthEnvironmentRisks} characters): the hazards to health and to the environment in words, the meaning of the hazard statements and the main effects of exposure.
- protectionMeans (section 8, at most ${limits.protectionMeans} characters): the protective equipment for eyes, hands, skin and breathing, and the ventilation the sheet recommends.
- interventionMeasures (sections 4, 5.3 and 6, at most ${limits.interventionMeasures} characters): first aid by route of exposure, the advice for firefighters, and what to do on an accidental release.
- extinguishingAgents (sections 5.1 and 6.3, at most ${limits.extinguishingAgents} characters): the suitable extinguishing media, the unsuitable ones as "nu se folosește …", and the materials that absorb, neutralize or decontaminate a spill.
- handling (section 7, at most ${limits.handling} characters): the precautions for safe handling and the conditions for safe storage, incompatible materials included. Never name a place: where the product is kept is the company's own fact.
- Never write a hazard statement code, a CAS, EC or UN number inside a text; they go in hazards, components and unNumber only.`;

export function safetySheetMessages(text: string): ChatMessage[] {
  return [
    { role: 'system', content: safetySheetSystemPrompt },
    { role: 'user', content: `=== SAFETY DATA SHEET ===\n${text}` },
  ];
}

export function safetySheetRequest(
  text: string
): Omit<CompletionRequest<SafetySheetAnswer>, 'metadata'> {
  if (text.length > safetySheetCharacters) throw new SafetySheetTooLongError(text.length);
  return {
    model: safetySheetModel,
    messages: safetySheetMessages(text),
    answer: safetySheetAnswer,
    reasoningEffort: 'low',
    maxCompletionTokens: safetySheetOutputTokens,
  };
}

const sectionWord =
  /(?:sec[țţt]iunea|section|sektion|abschnitt|rubrique|sezione|secci[óo]n|sekcja|odd[íi]l|szakasz|rubriek)[ \t]{0,3}:?[ \t]{0,3}(\d{1,2})(?!\d)/giu;
const subsection = /^[ \t]*(\d{1,2})\.(\d{1,2})\.?[ \t]+\S/gmu;
// A heading written as a bare number: "1. IDENTIFICAREA SUBSTANȚEI", "2 Hazards identification".
const capitalHeading = /^[ \t]*(\d{1,2})[.:]?[ \t]+\p{Lu}{4,}/gmu;
const titledHeading =
  /^[ \t]*(\d{1,2})[.:]?[ \t]+(?:(?:identifica|pericol|hazard|compozi|composition|prim ajutor|first.aid|m[ăa]suri|incendi|fire|dispersi|accidental|manipul|handling|control|expuner|exposure|propriet|properties|stabilit|toxicolog|ecolog|elimin|disposal|transport|reglement|regulatory|alte informa|other information))/gimu;

export function safetySheetSections(text: string) {
  const found = new Set<number>();
  const add = (number: string) => {
    const section = Number(number);
    if (section >= 1 && section <= 16) found.add(section);
  };
  for (const match of text.matchAll(sectionWord)) add(match[1]!);
  for (const match of text.matchAll(subsection)) add(match[1]!);
  for (const match of text.matchAll(capitalHeading)) add(match[1]!);
  for (const match of text.matchAll(titledHeading)) add(match[1]!);
  return found;
}

// A sheet's structure is fixed by REACH annex II; a few headings may be lost to the layout.
export const hasSafetySheetStructure = (text: string) => safetySheetSections(text).size >= 12;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Dashes and line breaks a PDF's layout puts inside a CAS or EC number, and the runs of spaces it
// pads tables with, which the patterns below would otherwise backtrack over.
export function normalizeCodes(text: string) {
  return text
    .replace(/[‐-―−﹣－]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/(\d) ?- ?(?=\d)/g, '$1-');
}

const unLabel = String.raw`(?:UN|ONU)(?:[-:. ]{0,3}(?:nr|no|Nr|No|NO|number|Number|număr(?:ul)?|Număr(?:ul)?)\.?)?[-:. ]{0,3}`;

const suffixPattern = (suffix: string) =>
  [...suffix].map((letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`).join('');

function inFile(text: string) {
  const normalized = normalizeCodes(text);
  const has = (pattern: string) => new RegExp(pattern, 'u').test(normalized);
  return {
    statement: (prefix: string, digits: string, suffix: string) =>
      has(`(?<![A-Za-z])${prefix} ?${digits}${suffixPattern(suffix)}(?![0-9A-Za-z])`),
    number: (value: string) => has(`(?<![\\d-])${escape(value)}(?![\\d-])`),
    un: (value: string) => has(`(?<![A-Za-z])${unLabel}${escape(value)}(?!\\d)`),
  };
}

const statementCode = /(?<![A-Za-z])(EUH|H) ?(\d{3})([A-Za-z]{0,2})(?![0-9A-Za-z])/gu;
const casFormat = /^\d{2,7}-\d{2}-\d$/;
const ecFormat = /^\d{3}-\d{3}-\d$/;

// Every code-like token a free text may hold, with the label in front of it, so a dropped code
// takes its label along. Run on normalized text: every space in it is a single one.
const codeInText =
  /(?:\b(?:CAS|EC|CE|EINECS)\b(?: ?(?:nr\.?|no\.?|number|număr(?:ul)?))? ?[:.]? ?)?(?<![\d-])(?:(\d{2,7}-\d{2}-\d)|(\d{3}-\d{3}-\d))(?![\d-])|(?<![A-Za-z])(EUH|H) ?(\d{3})([A-Za-z]{0,2})(?![0-9A-Za-z])|\b(?:UN|ONU)(?:[-:. ]{0,3}(?:nr|no|Nr|No|number|număr(?:ul)?)\.?)?[-:. ]{0,3}(\d{4})(?!\d)/gu;

function tidy(value: string) {
  return value
    .replace(/\(\s*[,;]?\s*\)/g, '')
    .replace(/\s+([,;.:)])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/[,;:]+(?=\.)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:.]+|[\s,;:]+$/g, '')
    .trim();
}

function guardText(value: string, file: ReturnType<typeof inFile>) {
  let dropped = 0;
  const kept = normalizeCodes(value).replace(
    codeInText,
    (
      whole,
      cas?: string,
      ec?: string,
      prefix?: string,
      digits?: string,
      suffix?: string,
      un?: string
    ) => {
      const present = prefix
        ? file.statement(prefix, digits!, suffix ?? '')
        : un
          ? file.un(un)
          : file.number((cas ?? ec)!);
      if (present) return whole;
      dropped += 1;
      return '';
    }
  );
  return { text: dropped > 0 ? tidy(kept) : kept, dropped };
}

export function clipText(value: string, max: number) {
  if (value.length <= max) return value;
  const head = value.slice(0, max);
  const phrase = Math.max(head.lastIndexOf('; '), head.lastIndexOf('. '));
  if (phrase >= max / 2) return tidy(head.slice(0, phrase + (head[phrase] === '.' ? 1 : 0)));
  const word = head.lastIndexOf(' ');
  return tidy(word > 0 ? head.slice(0, word) : head);
}

const finish = (value: string, max: number) => {
  const clipped = clipText(value.trim(), max);
  return clipped.length >= 2 ? clipped : null;
};

const casLabel = /^\s*CAS\b[^\d]*/i;
const ecLabel = /^\s*(?:EC|CE|EINECS)\b[^\d]*/i;
const unNumberLabel = /^\s*(?:UN|ONU)\b[^\d]*/i;

export const notClassifiedText = 'Neclasificat conform Regulamentului (CE) nr. 1272/2008';

export type SafetySheetReading =
  { kind: 'draft'; draft: SafetySheetDraft; droppedCodes: number } | { kind: 'not_a_sheet' };

// The prompt asks for no invented code, but only code can hold to it: every H statement, CAS, EC
// and UN number must occur in the file's text, or it is left out and counted (ADR 030).
export function readSafetySheetAnswer(answer: SafetySheetAnswer, text: string): SafetySheetReading {
  if (!answer.isSafetyDataSheet || !hasSafetySheetStructure(text)) return { kind: 'not_a_sheet' };
  const file = inFile(text);
  let dropped = 0;
  const guard = (value: string) => {
    const result = guardText(value, file);
    dropped += result.dropped;
    return result.text;
  };

  const hazards = answer.hazards.flatMap((hazard) => {
    const codes = hazard.statements.flatMap((statement) =>
      [...normalizeCodes(statement).matchAll(statementCode)].flatMap(
        ([, prefix, digits, suffix]) => {
          if (file.statement(prefix!, digits!, suffix ?? ''))
            return [`${prefix}${digits}${suffix}`];
          dropped += 1;
          return [];
        }
      )
    );
    const hazardClass = guard(hazard.hazardClass);
    const parts = [hazardClass, [...new Set(codes)].join(', ')].filter(Boolean);
    return parts.length > 0 ? [parts.join(', ')] : [];
  });
  const classification =
    hazards.length > 0 ? hazards.join('; ') : answer.notClassified ? notClassifiedText : '';

  const checkedNumber = (value: string, format: RegExp, label: RegExp, found = file.number) => {
    const number = normalizeCodes(value).replace(label, '').replace(/\s+/g, '');
    if (number === '') return null;
    if (format.test(number) && found(number)) return number;
    dropped += 1;
    return null;
  };
  const components = answer.components.flatMap((component) => {
    const cas = checkedNumber(component.cas, casFormat, casLabel);
    const ec = checkedNumber(component.ec, ecFormat, ecLabel);
    const codes = [cas && `CAS ${cas}`, ec && `CE ${ec}`].filter(Boolean).join(', ');
    return codes ? [{ name: guard(component.name), codes }] : [];
  });
  const named = components.length > 1;
  const un = checkedNumber(answer.unNumber, /^\d{4}$/, unNumberLabel, file.un);
  const identificationCodes = [
    ...components.map(({ name, codes }) => (named && name ? `${name}: ${codes}` : codes)),
    ...(un ? [`UN ${un}`] : []),
  ].join('; ');

  const draft: SafetySheetDraft = {
    name: finish(guard(answer.productName), limits.name),
    classification: finish(classification, limits.classification),
    identificationCodes: finish(identificationCodes, limits.identificationCodes),
    physicalChemicalProperties: finish(
      guard(answer.physicalChemicalProperties),
      limits.physicalChemicalProperties
    ),
    healthEnvironmentRisks: finish(
      guard(answer.healthEnvironmentRisks),
      limits.healthEnvironmentRisks
    ),
    protectionMeans: finish(guard(answer.protectionMeans), limits.protectionMeans),
    interventionMeasures: finish(guard(answer.interventionMeasures), limits.interventionMeasures),
    extinguishingAgents: finish(guard(answer.extinguishingAgents), limits.extinguishingAgents),
    handling: finish(guard(answer.handling), limits.handling),
  };
  return { kind: 'draft', draft, droppedCodes: dropped };
}
