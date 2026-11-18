import {
  type DocumentSet,
  fireSafetyDocumentTitles,
  occupationalSafetyDocumentTitles,
} from '@ssm-usor/contracts';

import type {
  ApiErrorResponse,
  DocumentsBehindResponseItemsItem,
  DocumentsBehindResponseItemsItemClientsItem,
  RegenerationJobResponseJob,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { instructionChangeText } from '@/features/documents/behind-labels';

import { countOf } from './legislation-labels';

export type BehindType = DocumentsBehindResponseItemsItem;
export type BehindClient = DocumentsBehindResponseItemsItemClientsItem;
export type RegenerationJob = RegenerationJobResponseJob;

export const setName = { occupational_safety: 'SSM', fire_safety: 'SU' } as const;

const knownTitles: Record<string, string> = {
  ...occupationalSafetyDocumentTitles,
  ...fireSafetyDocumentTitles,
};

export const titleOf = (typeKey: string, titles: Record<string, string> = {}) =>
  titles[typeKey] ?? knownTitles[typeKey] ?? typeKey;

export const regenerable = (type: BehindType) =>
  type.clients.filter((client) => !client.editedDraft);

export const behindTemplate = (type: BehindType) =>
  type.clients.some((client) => client.behindTemplate);

export const behindInstructions = (type: BehindType) =>
  type.clients.some((client) => client.instructionChanges.length > 0);

const distinctClients = (pairs: { clientId: string }[]) =>
  new Set(pairs.map((pair) => pair.clientId)).size;

export function documentsSummary(types: readonly BehindType[]) {
  const pairs = types.flatMap((type) => type.clients);
  return `${countOf(pairs.length, 'document', 'documente')} la ${countOf(distinctClients(pairs), 'client', 'clienți')}`;
}

export function instructionsSummary(type: BehindType) {
  const texts = new Set(
    type.clients.flatMap((client) => client.instructionChanges.map(instructionChangeText))
  );
  return [...texts].join(' ');
}

type Pair = { type: BehindType; client: BehindClient };

export type ConfirmLine = { lead: string; rest: string };

export interface ConfirmCopy {
  title: string;
  lead: string;
  lines: ConfirmLine[];
  confirm: string;
  regenerated: number;
}

function sourceOf(types: readonly BehindType[]) {
  const template = types.some(behindTemplate);
  const instructions = types.some(behindInstructions);
  if (template && instructions) return 'pe versiunea nouă a șablonului și a instrucțiunilor';
  if (template) return 'pe versiunea nouă a șablonului';
  return 'cu instrucțiunile de acum';
}

function editedLine(edited: Pair[], one: boolean): ConfirmLine | null {
  if (edited.length === 0) return null;
  if (edited.length === 1) {
    const { type, client } = edited[0]!;
    return {
      lead: 'Ciorna editată de mână',
      rest: one
        ? ` de la ${client.clientName} rămâne neatinsă, ca să nu pierzi ce ai scris în ea.`
        : ` a documentului „${type.title}”, la ${client.clientName}, rămâne neatinsă, ca să nu pierzi ce ai scris în ea.`,
    };
  }
  const where = edited
    .map(({ type, client }) =>
      one ? client.clientName : `„${type.title}”, la ${client.clientName}`
    )
    .join('; ');
  return {
    lead: countOf(edited.length, 'ciornă editată de mână', 'ciorne editate de mână'),
    rest: ` rămân neatinse, ca să nu pierzi ce ai scris în ele: ${where}.`,
  };
}

function issuedLine(issued: Pair[], one: boolean): ConfirmLine | null {
  if (issued.length === 0) return null;
  if (issued.length === 1) {
    const { type, client } = issued[0]!;
    return {
      lead: '1 document emis',
      rest: one
        ? `, la ${client.clientName}, rămâne în vigoare. Primește o ciornă nouă, pe care o emiți de pe pagina clientului.`
        : `, „${type.title}” la ${client.clientName}, rămâne în vigoare. Primește o ciornă nouă, pe care o emiți de pe pagina clientului.`,
    };
  }
  return {
    lead: countOf(issued.length, 'document emis', 'documente emise'),
    rest: ' rămân în vigoare. Fiecare primește o ciornă nouă, pe care o emiți de pe pagina clientului.',
  };
}

function draftLine(drafts: Pair[]): ConfirmLine | null {
  if (drafts.length === 0) return null;
  return drafts.length === 1
    ? { lead: '1 ciornă', rest: ' se înlocuiește cu o ciornă nouă.' }
    : { lead: countOf(drafts.length, 'ciornă', 'ciorne'), rest: ' se înlocuiesc cu ciorne noi.' };
}

function linesOf(types: readonly BehindType[], one: boolean) {
  const pairs = types.flatMap((type) => type.clients.map((client) => ({ type, client })));
  const edited = pairs.filter(({ client }) => client.editedDraft);
  const kept = pairs.filter(({ client }) => !client.editedDraft);
  return {
    kept,
    lines: [
      issuedLine(
        kept.filter(({ client }) => client.status === 'issued'),
        one
      ),
      draftLine(kept.filter(({ client }) => client.status === 'draft')),
      editedLine(edited, one),
    ].filter((line) => line !== null),
  };
}

// No set name when the documents come from both sets, as those of one legal change can.
export function confirmAllCopy(set: DocumentSet | null, types: readonly BehindType[]): ConfirmCopy {
  const { kept, lines } = linesOf(types, false);
  const documents = countOf(kept.length, 'document', 'documente');
  return {
    title: `Regenerezi ${documents}${set ? ` ${setName[set]}` : ''} la ${countOf(distinctClients(kept.map(({ client }) => client)), 'client', 'clienți')}?`,
    lead: 'Le refacem pe versiunea nouă a șabloanelor și a instrucțiunilor, cu datele de azi ale clienților.',
    lines,
    confirm: `Regenerează ${documents}`,
    regenerated: kept.length,
  };
}

export function confirmOneCopy(type: BehindType): ConfirmCopy {
  const { kept, lines } = linesOf([type], true);
  const clients = countOf(kept.length, 'client', 'clienți');
  return {
    title: `Regenerezi ${type.title} la ${clients}?`,
    lead: `${kept.length === 1 ? 'Îl refacem' : 'Le refacem'} ${sourceOf([type])}, cu datele de azi ale ${kept.length === 1 ? 'clientului' : 'clienților'}.`,
    lines,
    confirm: `Regenerează la ${clients}`,
    regenerated: kept.length,
  };
}

export function confirmTypesCopy(types: readonly BehindType[]): ConfirmCopy {
  if (types.length === 1) return confirmOneCopy(types[0]!);
  const sets = new Set(types.map((type) => type.set));
  return confirmAllCopy(sets.size === 1 ? types[0]!.set : null, types);
}

export function regenerationFailure(cause: unknown) {
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  const answered = cause instanceof ApiHttpError && (cause.status === 409 || cause.status === 503);
  return answered && body?.message
    ? body.message
    : 'Regenerarea nu a putut porni. Verifică conexiunea și încearcă din nou.';
}

type Counted = Pick<RegenerationJob, 'total' | 'done' | 'skipped' | 'failed'>;

export function jobCounts(jobs: readonly Counted[]) {
  const sum = (pick: (job: Counted) => number) => jobs.reduce((total, job) => total + pick(job), 0);
  const done = sum((job) => job.done);
  const skipped = sum((job) => job.skipped);
  const failed = sum((job) => job.failed);
  return {
    total: sum((job) => job.total),
    done,
    skipped,
    failed,
    handled: done + skipped + failed,
  };
}

export function progressLine(jobs: readonly Counted[]) {
  const { done, skipped, failed } = jobCounts(jobs);
  return `${[
    countOf(done, 'regenerat', 'regenerate'),
    countOf(skipped, 'sărit', 'sărite'),
    countOf(failed, 'eșuat', 'eșuate'),
  ].join(', ')}.`;
}

export interface FinishedNotice {
  title: string;
  description: string;
  shortfall: string | null;
}

export function finishedNotice(
  scope: 'one' | 'all',
  set: DocumentSet,
  jobs: readonly RegenerationJob[],
  titles: Record<string, string>,
  edited: number
): FinishedNotice {
  const { done, skipped, failed } = jobCounts(jobs);
  const left = skipped + failed;
  const shortfall =
    left === 0
      ? null
      : left === 1
        ? '1 nu s-a putut regenera.'
        : `${countOf(left, 'document', 'documente')} nu s-au putut regenera.`;
  const drafts = countOf(done, 'ciornă nouă de emis', 'ciorne noi de emis');
  if (scope === 'one' && jobs.length === 1) {
    const job = jobs[0]!;
    const keptEdited =
      edited === 0
        ? ''
        : edited === 1
          ? ' Ciorna editată de mână a rămas neatinsă.'
          : ` ${countOf(edited, 'ciornă editată de mână', 'ciorne editate de mână')} au rămas neatinse.`;
    return {
      title: `${titleOf(job.typeKey, titles)}, regenerat la ${countOf(done, 'client', 'clienți')}`,
      description: `${done === 0 ? 'Nicio ciornă nouă de emis.' : `${drafts}.`}${keptEdited}`,
      shortfall,
    };
  }
  const clients = new Set(
    jobs.flatMap((job) =>
      job.items.filter((item) => item.status === 'done').map((item) => item.clientId)
    )
  ).size;
  return {
    title: `${countOf(done, 'document', 'documente')} ${setName[set]} ${done === 1 ? 'regenerat' : 'regenerate'}`,
    description:
      done === 0
        ? 'Nicio ciornă nouă de emis.'
        : `${drafts}, la ${countOf(clients, 'client', 'clienți')}.`,
    shortfall,
  };
}
