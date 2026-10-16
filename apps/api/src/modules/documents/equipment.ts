import {
  extinguisherCode,
  type FireExtinguishingAgent,
  fireExtinguishingAgents,
} from '@ssm-usor/contracts';

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

const isExtinguisher = (unit: Unit): unit is Extinguisher =>
  unit.kind === 'extinguisher' && unit.agent !== null && unit.capacity !== null;

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
  const extinguishers = units
    .filter(isExtinguisher)
    .sort(
      (a, b) =>
        fireExtinguishingAgents.indexOf(a.agent) - fireExtinguishingAgents.indexOf(b.agent) ||
        Number(a.wheeled) - Number(b.wheeled) ||
        a.capacity - b.capacity
    );
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
