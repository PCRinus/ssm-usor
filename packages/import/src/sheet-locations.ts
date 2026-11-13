import { z } from 'zod';

import type { CompletionRequest } from './gateway';
import { locatingModel } from './models';
import type { ChatMessage } from './prompts';
import type { SheetPage } from './sheet-page';
import type { AnswerFormat } from './wire';

type RowValue = 'heldOn' | 'durationMinutes' | 'trainerName' | 'material';

/**
 * A value of a sheet page's reading, named by its place in `SheetPage`; the app spotlights by
 * these names. `person.name` is the family and given names together. `trainings[i]` is the whole
 * row (a table's row, or a first page's training block), and `i` indexes `SheetPage.trainings`,
 * as it does the page's proposed rows; `handovers[i]` indexes `SheetPage.handovers`.
 */
export type SheetLocationTarget =
  | 'person.name'
  | 'person.cnp'
  | 'person.employeeNumber'
  | `fields.${keyof SheetPage['fields']}`
  | 'admission.admittedOn'
  | 'admission.admittedByName'
  | `trainings[${number}]`
  | `trainings[${number}].${RowValue}`
  | `handovers[${number}]`;

export interface LocatingTarget {
  id: SheetLocationTarget;
  label: string;
  value: string;
  kind?: 'row';
}

// In thousandths of the page image's height (top, bottom) and width (left, right), from its
// top-left corner.
export interface SheetLocation {
  target: SheetLocationTarget;
  top: number;
  left: number;
  bottom: number;
  right: number;
}

const fieldLabels: Record<keyof SheetPage['fields'], string> = {
  birthDate: 'data nașterii',
  birthPlace: 'locul nașterii',
  homeAddress: 'domiciliul',
  education: 'studii',
  qualification: 'calificarea',
  bloodGroup: 'grupa sanguină',
  rhFactor: 'Rh',
  jobTitle: 'funcția',
  hiredAt: 'data angajării / admiterii',
  leftOn: 'data plecării',
  workplace: 'locul de muncă',
  commuteRoute: 'traseul',
  commuteMinutes: 'durata deplasării (minute)',
};

export function locatingTargets(page: SheetPage): LocatingTarget[] {
  const targets: LocatingTarget[] = [];
  const name = [page.person.lastName, page.person.firstName].filter(Boolean).join(' ');
  if (name)
    targets.push({ id: 'person.name', label: 'numele și prenumele persoanei', value: name });
  if (page.person.cnp) targets.push({ id: 'person.cnp', label: 'CNP', value: page.person.cnp });
  if (page.person.employeeNumber) {
    targets.push({
      id: 'person.employeeNumber',
      label: 'marca',
      value: page.person.employeeNumber,
    });
  }
  for (const key of Object.keys(fieldLabels) as (keyof SheetPage['fields'])[]) {
    const value = page.fields[key];
    if (value !== null && value !== '') {
      targets.push({ id: `fields.${key}`, label: fieldLabels[key], value: String(value) });
    }
  }
  const { admittedOn, admittedByName } = page.admission;
  if (admittedOn) {
    targets.push({
      id: 'admission.admittedOn',
      label: 'data admiterii la lucru',
      value: admittedOn,
    });
  }
  if (admittedByName) {
    targets.push({
      id: 'admission.admittedByName',
      label: 'cine a admis la lucru',
      value: admittedByName,
    });
  }
  page.trainings.forEach((row, i) => {
    const n = i + 1;
    const what = `${row.domain.toUpperCase()} ${row.phase}${row.annualTest ? ' + testare anuală' : ''}`;
    targets.push({
      id: `trainings[${i}]`,
      label: `instruirea ${n} (${what}): tot rândul / blocul`,
      value: [row.heldOn, row.material].filter(Boolean).join(' · '),
      kind: 'row',
    });
    if (row.heldOn) {
      targets.push({
        id: `trainings[${i}].heldOn`,
        label: `data instruirii ${n}`,
        value: row.heldOn,
      });
    }
    if (row.durationMinutes !== null) {
      targets.push({
        id: `trainings[${i}].durationMinutes`,
        label: `durata instruirii ${n} (minute; pe foaie de obicei în ore)`,
        value: String(row.durationMinutes),
      });
    }
    if (row.trainerName) {
      targets.push({
        id: `trainings[${i}].trainerName`,
        label: `instructorul la instruirea ${n}`,
        value: row.trainerName,
      });
    }
    if (row.material) {
      targets.push({
        id: `trainings[${i}].material`,
        label: `materialul instruirii ${n}`,
        value: row.material,
      });
    }
  });
  page.handovers.forEach((handover, i) => {
    targets.push({ id: `handovers[${i}]`, label: 'linia de preluare', value: handover.text });
  });
  return targets;
}

export const locatingSystemPrompt = `You get ONE photo of a page from a Romanian paper training sheet ("fișă de instruire individuală") and a list of values that were already read from it. For each value, find where it is written on the photo and return its bounding box.

- Box the handwriting (or the typed value) itself, not the printed label in front of it, and box all of it: a value written over two lines gets one box around both lines.
- A target of kind "row" is a whole training: on a table page, the full table row across every column, signatures included; on a sheet's first page, the training's block from its numbered title to its signatures.
- The values were normalised after reading: dates are YYYY-MM-DD (on paper e.g. "01.06.2021", "07.03.22" or a month alone), durations are in minutes (on paper usually hours: 240 is written "4"), names are in Title Case and may be written in capitals or without diacritics, and long material may be abbreviated on paper.
- Handwriting in a periodic table's narrow columns is often written sideways: box it as it lies on the photo.
- box_2d is [ymin, xmin, ymax, xmax], integers from 0 to 1000, relative to the photo's height (y) and width (x), origin top-left.
- found is false, with box_2d [0, 0, 0, 0], when the value is not written on this photo. Never guess a place.
- Return every target id once, in the order given.`;

const targetLines = (targets: LocatingTarget[]) =>
  targets
    .map(
      (target) =>
        `- id: ${target.id}${target.kind ? ` (kind: ${target.kind})` : ''}; ${target.label}; value: ${JSON.stringify(target.value)}`
    )
    .join('\n');

export function locatingMessages(imageUrl: string, targets: LocatingTarget[]): ChatMessage[] {
  return [
    { role: 'system', content: locatingSystemPrompt },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: `Targets:\n${targetLines(targets)}` },
      ],
    },
  ];
}

const locatingSchema = z.object({
  locations: z.array(z.object({ id: z.string(), found: z.boolean(), box_2d: z.array(z.number()) })),
});

export type LocatingAnswer = z.infer<typeof locatingSchema>;

// Written out rather than derived through `answerFormat`, whose wire form turns numbers into
// strings: this is the schema the evaluation of 2026-11-13 measured.
export const locatingAnswer: AnswerFormat<LocatingAnswer> = {
  name: 'locations',
  jsonSchema: {
    type: 'object',
    properties: {
      locations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            found: { type: 'boolean' },
            box_2d: { type: 'array', items: { type: 'integer' } },
          },
          required: ['id', 'found', 'box_2d'],
          additionalProperties: false,
        },
      },
    },
    required: ['locations'],
    additionalProperties: false,
  },
  parse: (answer) => locatingSchema.parse(answer),
};

export const locatingOutputTokens = 32_000;

export function locatingRequest(
  imageUrl: string,
  targets: LocatingTarget[]
): Omit<CompletionRequest<LocatingAnswer>, 'metadata'> {
  return {
    model: locatingModel,
    messages: locatingMessages(imageUrl, targets),
    answer: locatingAnswer,
    maxCompletionTokens: locatingOutputTokens,
  };
}

// A box narrower or lower than this marks a point, not a value.
const smallestSide = 3;

const scale = (value: number) => Math.min(1000, Math.max(0, Math.round(value)));

// The model may echo more of its target line after the id: "trainings[0] (kind: row)".
const bareId = (id: string) => /^\s*(?:id:\s*)?([\w.[\]]+)/.exec(id)?.[1] ?? '';

export function sheetLocations(answer: LocatingAnswer, targets: LocatingTarget[]): SheetLocation[] {
  const boxes = new Map<string, Omit<SheetLocation, 'target'>>();
  for (const location of answer.locations) {
    const id = bareId(location.id);
    if (!location.found || boxes.has(id) || location.box_2d.length !== 4) continue;
    if (!location.box_2d.every(Number.isFinite)) continue;
    const [y1, x1, y2, x2] = location.box_2d.map(scale) as [number, number, number, number];
    const box = {
      top: Math.min(y1, y2),
      left: Math.min(x1, x2),
      bottom: Math.max(y1, y2),
      right: Math.max(x1, x2),
    };
    if (box.bottom - box.top < smallestSide || box.right - box.left < smallestSide) continue;
    boxes.set(id, box);
  }
  return targets.flatMap((target) => {
    const box = boxes.get(target.id);
    return box ? [{ target: target.id, ...box }] : [];
  });
}
