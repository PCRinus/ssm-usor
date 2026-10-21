import type {
  DocumentsBehindResponseItemsItem,
  DocumentsBehindResponseItemsItemClientsItem,
  DocumentsBehindResponseItemsItemClientsItemInstructionChangesItem,
} from '@/api/generated/api';
import { formatRoDate } from '@/lib/dates';

type BehindClient = DocumentsBehindResponseItemsItemClientsItem;
type InstructionChange = DocumentsBehindResponseItemsItemClientsItemInstructionChangesItem;

const day = (timestamp: string) => formatRoDate(timestamp.slice(0, 10));

export const behindInstructions = (client: BehindClient) => client.instructionChanges.length > 0;

export function instructionChangeText(change: InstructionChange) {
  const name = `Instrucțiunea „${change.title}”`;
  switch (change.code) {
    case 'module_version':
      return `${name} are o versiune nouă${change.newestVersionAt ? ` din ${day(change.newestVersionAt)}` : ''}.`;
    case 'module_added':
      return `${name} este aplicată de un post, dar documentul nu o cuprinde.`;
    case 'module_removed':
      return `${name} nu mai este aplicată de niciun post, dar documentul o cuprinde.`;
  }
}

/** The themes cite the own instructions of their set, which must be regenerated first (ADR 014). */
export const citedInstructionsType: Partial<Record<string, string>> = {
  training_themes: 'own_instructions',
  fire_training_themes: 'fire_own_instructions',
};

export function instructionChangesHint(
  typeKey: string,
  client: BehindClient,
  items: readonly DocumentsBehindResponseItemsItem[]
) {
  const cited = citedInstructionsType[typeKey];
  const citedBehind =
    cited !== undefined &&
    items.some(
      (type) =>
        type.typeKey === cited &&
        type.clients.some(
          (other) => other.clientId === client.clientId && behindInstructions(other)
        )
    );
  const reasons = client.instructionChanges.map(instructionChangeText).join(' ');
  return citedBehind
    ? `${reasons} Generează din nou mai întâi instrucțiunile proprii, apoi acest document.`
    : `${reasons} Generează documentul din nou.`;
}
