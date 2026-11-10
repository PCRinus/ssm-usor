import {
  extinguisherCode,
  fireEquipmentKindLabels,
  fireEquipmentKinds,
  type FireExtinguishingAgent,
  fireExtinguishingAgentLabels,
  fireExtinguishingAgents,
} from '@ssm-usor/contracts';

import { collator } from '../../lib/romanian';
import type { FireSafetyClientFacts } from './fire-safety';

type Unit = FireSafetyClientFacts['equipment'][number];

type Extinguisher = Unit & { agent: FireExtinguishingAgent; capacity: number };

// Litres for the agents sold by volume, kilograms for the rest, as the labels on the units read.
const capacityUnits: Record<FireExtinguishingAgent, string> = {
  powder: 'kg',
  co2: 'kg',
  foam: 'l',
  water: 'l',
  clean_agent: 'kg',
};

export const isGasAgent = (agent: FireExtinguishingAgent | null) =>
  agent === 'co2' || agent === 'clean_agent';

export const isExtinguisher = (unit: Unit): unit is Extinguisher =>
  unit.kind === 'extinguisher' && unit.agent !== null && unit.capacity !== null;

const byType = (a: Extinguisher, b: Extinguisher) =>
  fireExtinguishingAgents.indexOf(a.agent) - fireExtinguishingAgents.indexOf(b.agent) ||
  Number(a.wheeled) - Number(b.wheeled) ||
  a.capacity - b.capacity;

/** "P6 – Pulbere, 6 kg, carosabil", as the list of means names a type. */
export function extinguisherText(unit: Pick<Extinguisher, 'agent' | 'capacity' | 'wheeled'>) {
  return `${extinguisherCode(unit.agent, unit.capacity)} – ${fireExtinguishingAgentLabels[unit.agent]}, ${unit.capacity}\u00a0${capacityUnits[unit.agent]}${unit.wheeled ? ', carosabil' : ''}`;
}

const inventoryOrder = new Intl.Collator('ro', { numeric: true });

const placeOf = (unit: Unit) => unit.location?.trim() || null;

const byPlace = (a: string | null, b: string | null) =>
  Number(a === null) - Number(b === null) || collator.compare(a ?? '', b ?? '');

/** A workplace's extinguishers in the order a control walks them: by location, then by type. */
export function extinguishersByPlace(units: readonly Unit[]) {
  return units
    .filter(isExtinguisher)
    .sort(
      (a, b) =>
        byPlace(placeOf(a), placeOf(b)) ||
        byType(a, b) ||
        inventoryOrder.compare(a.label?.trim() ?? '', b.label?.trim() ?? '')
    );
}

/**
 * The means counted per location and type, the way a hand-written list has them; empty where no
 * unit has a location, so such a workplace prints as before.
 */
export function meansByPlace(units: readonly Unit[]) {
  if (!units.some((unit) => placeOf(unit) !== null)) return [];
  const places = new Map<string, { place: string | null; units: Unit[] }>();
  for (const unit of units) {
    const place = placeOf(unit);
    const key = place?.toLocaleLowerCase('ro') ?? '';
    const entry = places.get(key) ?? { place, units: [] };
    entry.units.push(unit);
    places.set(key, entry);
  }
  return [...places.values()]
    .sort((a, b) => byPlace(a.place, b.place))
    .flatMap(({ place, units: here }) => [
      ...extinguisherGroups(here).map((group) => ({
        place: place ?? '—',
        means: `Stingător ${extinguisherText(group)}`,
        count: group.units.length,
      })),
      ...otherEquipmentGroups(here).map((group) => ({
        place: place ?? '—',
        means: group.label,
        count: group.units.length,
      })),
    ]);
}

export function extinguisherGroups(units: readonly Unit[]) {
  const groups = new Map<
    string,
    {
      agent: FireExtinguishingAgent;
      capacity: number;
      wheeled: boolean;
      code: string;
      /** "P6 carosabil": the code with the wheels. */
      label: string;
      gas: boolean;
      capacityLabel: string;
      units: Extinguisher[];
    }
  >();
  const extinguishers = units.filter(isExtinguisher).sort(byType);
  for (const unit of extinguishers) {
    const key = `${unit.agent}|${unit.capacity}|${unit.wheeled}`;
    const code = extinguisherCode(unit.agent, unit.capacity);
    const group = groups.get(key) ?? {
      agent: unit.agent,
      capacity: unit.capacity,
      wheeled: unit.wheeled,
      code,
      label: `${code}${unit.wheeled ? ' carosabil' : ''}`,
      gas: isGasAgent(unit.agent),
      capacityLabel: `${unit.capacity}\u00a0${capacityUnits[unit.agent]}`,
      units: [],
    };
    group.units.push(unit);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function otherEquipmentGroups(units: readonly Unit[]) {
  return fireEquipmentKinds
    .filter((kind) => kind !== 'extinguisher')
    .flatMap((kind) => {
      const found = units.filter((unit) => unit.kind === kind);
      return found.length > 0 ? [{ kind, label: fireEquipmentKindLabels[kind], units: found }] : [];
    });
}

export function firmsOf(names: readonly (string | null)[]) {
  const firms: string[] = [];
  for (const name of names) {
    const firm = name?.trim();
    if (
      firm &&
      !firms.some((each) => each.toLocaleLowerCase('ro') === firm.toLocaleLowerCase('ro'))
    ) {
      firms.push(firm);
    }
  }
  return firms;
}
