import type {
  DocumentsBehindResponseItemsItem,
  DocumentsBehindResponseItemsItemClientsItem,
  DocumentsBehindResponseItemsItemClientsItemInstructionChangesItem,
  DocumentsBehindResponseItemsItemPendingVersionsItem,
} from '@/api/generated/api';
import { formatRoDate } from '@/lib/dates';

type BehindClient = DocumentsBehindResponseItemsItemClientsItem;
type InstructionChange = DocumentsBehindResponseItemsItemClientsItemInstructionChangesItem;
type PendingVersion = DocumentsBehindResponseItemsItemPendingVersionsItem;

const day = (timestamp: string) => formatRoDate(timestamp.slice(0, 10));

export const behindInstructions = (client: BehindClient) => client.instructionChanges.length > 0;

const kindOrder = ['legal', 'correction', 'layout'] as const;

/**
 * The version that says why a document made from version `since` is behind: the newest legal one
 * after it, else the newest correction, else the newest layout one. The template's newest version
 * can be a layout one that asks for nothing while an older pending correction does.
 */
export function templateReason(versions: readonly PendingVersion[], since: number) {
  const pending = versions.filter((version) => version.version > since);
  for (const kind of kindOrder) {
    const newest = pending
      .filter((version) => version.kind === kind)
      .reduce<PendingVersion | null>(
        (found, version) => (found && found.version > version.version ? found : version),
        null
      );
    if (newest) {
      const others = pending
        .filter((other) => other !== newest)
        .sort((a, b) => a.version - b.version);
      return { reason: newest, others };
    }
  }
  return null;
}

export function otherVersionsLine(
  others: readonly PendingVersion[],
  kindLabels: Record<PendingVersion['kind'], string>,
  furthestBehind = false
) {
  const named = others.map(
    (version) => `${version.version} (${kindLabels[version.kind].toLowerCase()})`
  );
  if (named.length === 0) return null;
  const last = named.pop()!;
  const lead = furthestBehind
    ? 'La clientul cel mai în urmă, regenerarea aduce și'
    : 'Regenerarea aduce și';
  return named.length === 0
    ? `${lead} versiunea ${last}.`
    : `${lead} versiunile ${named.join(', ')} și ${last}.`;
}

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
