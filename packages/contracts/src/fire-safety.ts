import { z } from 'zod';

export const fireSmokingPolicies = ['forbidden_everywhere', 'designated_places'] as const;

export const fireSmokingPolicySchema = z.enum(fireSmokingPolicies);

export type FireSmokingPolicy = z.infer<typeof fireSmokingPolicySchema>;

export const fireSmokingPolicyLabels: Record<FireSmokingPolicy, string> = {
  forbidden_everywhere: 'Fumatul este interzis în toate spațiile unității',
  designated_places: 'Fumatul este permis numai în locurile amenajate și marcate',
};

/** The rows of OMAI 163/2007 annex 6, named by the built area one extinguisher covers. */
export const fireExtinguisherNorms = [
  'administrative_300',
  'commercial_200',
  'residential_level',
  'mixed_300',
  'other_150',
] as const;

export const fireExtinguisherNormSchema = z.enum(fireExtinguisherNorms);

export type FireExtinguisherNorm = z.infer<typeof fireExtinguisherNormSchema>;

/** As annex 6 words its rows: the category, what it covers, and the orientative minimum. */
export const fireExtinguisherNormLabels: Record<
  FireExtinguisherNorm,
  { label: string; description: string; rate: string }
> = {
  administrative_300: {
    label: 'Clădiri administrative',
    description:
      'Sedii ale administrației publice centrale și locale; sedii de fundații, organizații neguvernamentale, asociații, agenții și altele asemenea; sedii de birouri.',
    rate: '1 buc./300 m²',
  },
  commercial_200: {
    label: 'Clădiri comerciale',
    description:
      'Comerț alimentar și nealimentar; magazine generale; alimentație publică (restaurante, braserii și altele asemenea); spații și încăperi destinate serviciilor.',
    rate: '1 buc./200 m²',
  },
  residential_level: {
    label: 'Clădiri de locuit',
    description: 'Blocuri; locuințe unifamiliale. Cu caracter de recomandare.',
    rate: '1 buc./nivel/apartament',
  },
  mixed_300: {
    label: 'Clădiri civile cu funcțiuni mixte',
    description: 'Comerț, birouri, reuniuni.',
    rate: '1 buc./300 m²',
  },
  other_150: {
    label: 'Alte amenajări',
    description:
      'Circuri mobile; scene și tribune amenajate provizoriu în aer liber (pentru spectacole, mitinguri, competiții sportive etc.); studiouri de radio, televiziune, îndeosebi cu public.',
    rate: '1 buc./150 m²',
  },
};

// Annex 6 counts dwellings by level or apartment, not by area.
const squareMetresPerExtinguisher: Record<FireExtinguisherNorm, number | null> = {
  administrative_300: 300,
  commercial_200: 200,
  residential_level: null,
  mixed_300: 300,
  other_150: 150,
};

/**
 * Annex 6's orientative minimum of extinguishers for a floor area, at least one; null for a
 * dwelling. A hint for the app only: never printed and never a reason to refuse generation.
 */
export function minimumExtinguishers(floorAreaM2: number, norm: FireExtinguisherNorm) {
  const divisor = squareMetresPerExtinguisher[norm];
  if (divisor === null) return null;
  return Math.max(1, Math.ceil(floorAreaM2 / divisor));
}

export const fireEquipmentKinds = [
  'extinguisher',
  'sand_box',
  'fire_post',
  'fire_blanket',
  'other',
] as const;

export const fireEquipmentKindSchema = z.enum(fireEquipmentKinds);

export type FireEquipmentKind = z.infer<typeof fireEquipmentKindSchema>;

export const fireEquipmentKindLabels: Record<FireEquipmentKind, string> = {
  extinguisher: 'Stingător',
  sand_box: 'Ladă cu nisip',
  fire_post: 'Post de intervenție PSI',
  fire_blanket: 'Pătură antifoc',
  other: 'Alt mijloc',
};

export const fireExtinguishingAgents = ['powder', 'co2', 'foam', 'water', 'clean_agent'] as const;

export const fireExtinguishingAgentSchema = z.enum(fireExtinguishingAgents);

export type FireExtinguishingAgent = z.infer<typeof fireExtinguishingAgentSchema>;

export const fireExtinguishingAgentLabels: Record<FireExtinguishingAgent, string> = {
  powder: 'Pulbere',
  co2: 'Dioxid de carbon (CO₂)',
  foam: 'Spumă mecanică',
  water: 'Apă pulverizată',
  clean_agent: 'Gaz inert',
};

const agentLetters: Record<FireExtinguishingAgent, string> = {
  powder: 'P',
  co2: 'G',
  foam: 'SM',
  water: 'AP',
  clean_agent: 'GI',
};

/**
 * "P6", "G3": the agent's letters and the capacity, as the trade prints an extinguisher. A
 * wheeled one has the same code; documents say "carosabil" beside it.
 */
export function extinguisherCode(agent: FireExtinguishingAgent, capacity: number) {
  return `${agentLetters[agent]}${capacity}`;
}

export const fireInstallationKinds = [
  'detection_alarm',
  'interior_hydrants',
  'exterior_hydrants',
  'sprinklers',
  'smoke_exhaust',
  'emergency_lighting',
  'lightning_protection',
  'gas_detection',
  'other',
] as const;

export const fireInstallationKindSchema = z.enum(fireInstallationKinds);

export type FireInstallationKind = z.infer<typeof fireInstallationKindSchema>;

export const fireInstallationKindLabels: Record<FireInstallationKind, string> = {
  detection_alarm: 'Instalație de detectare, semnalizare și avertizare la incendiu',
  interior_hydrants: 'Hidranți interiori',
  exterior_hydrants: 'Hidranți exteriori',
  sprinklers: 'Instalație de stingere cu sprinklere',
  smoke_exhaust: 'Instalație de evacuare a fumului și a gazelor fierbinți',
  emergency_lighting: 'Iluminat de siguranță',
  lightning_protection: 'Instalație de protecție împotriva trăsnetului',
  gas_detection: 'Instalație de detectare a gazelor',
  other: 'Altă instalație',
};

const optionalText = (min: number, max: number) => z.string().trim().min(min).max(max).nullish();

// OMAI 712/2005: art. 21 asks two hours at least, art. 26 six months at most for any category.
const fireTrainingFields = {
  periodicTrainingHours: z.int().min(2).max(8),
  administrativeTrainingIntervalMonths: z.int().min(1).max(6),
  workerTrainingIntervalMonths: z.int().min(1).max(6),
  trainingFirstMonth: z.int().min(1).max(12),
  trainingDayFrom: z.int().min(1).max(31),
  trainingDayTo: z.int().min(1).max(31),
};

/**
 * What the card opens on while a client has no fire-safety row: the law's minimum and the
 * sample's intervals. The first month and the days come from the occupational safety schedule
 * when it has them; nothing else is copied (ADR 018).
 */
export const fireSafetyStartingValues = {
  periodicTrainingHours: 2,
  administrativeTrainingIntervalMonths: 3,
  workerTrainingIntervalMonths: 3,
} as const;

export const clientFireSafetySchema = z.object({
  periodicTrainingHours: fireTrainingFields.periodicTrainingHours.nullable(),
  administrativeTrainingIntervalMonths:
    fireTrainingFields.administrativeTrainingIntervalMonths.nullable(),
  workerTrainingIntervalMonths: fireTrainingFields.workerTrainingIntervalMonths.nullable(),
  trainingFirstMonth: fireTrainingFields.trainingFirstMonth.nullable(),
  trainingDayFrom: fireTrainingFields.trainingDayFrom.nullable(),
  trainingDayTo: fireTrainingFields.trainingDayTo.nullable(),
  smokingPolicy: fireSmokingPolicySchema.nullable(),
  wasteKinds: z.array(z.string()),
  wasteContractor: z.string().nullable(),
});

export type ClientFireSafety = z.infer<typeof clientFireSafetySchema>;

export const clientFireSafetyResponseSchema = z.object({
  fireSafety: clientFireSafetySchema,
  // False until the first save, with every field empty: the app then opens on the starting values.
  exists: z.boolean(),
});

export type ClientFireSafetyResponse = z.infer<typeof clientFireSafetyResponseSchema>;

// Replaces all of them: a field left out or null is cleared.
export const updateClientFireSafetyRequestSchema = z
  .object({
    periodicTrainingHours: fireTrainingFields.periodicTrainingHours.nullish(),
    administrativeTrainingIntervalMonths:
      fireTrainingFields.administrativeTrainingIntervalMonths.nullish(),
    workerTrainingIntervalMonths: fireTrainingFields.workerTrainingIntervalMonths.nullish(),
    trainingFirstMonth: fireTrainingFields.trainingFirstMonth.nullish(),
    trainingDayFrom: fireTrainingFields.trainingDayFrom.nullish(),
    trainingDayTo: fireTrainingFields.trainingDayTo.nullish(),
    smokingPolicy: fireSmokingPolicySchema.nullish(),
    wasteKinds: z
      .array(z.string().trim().min(2).max(80))
      .max(12)
      .refine(
        (kinds) => new Set(kinds.map((kind) => kind.toLocaleLowerCase('ro'))).size === kinds.length,
        { message: 'A kind of waste appears twice.' }
      )
      .default([]),
    wasteContractor: optionalText(2, 160),
  })
  .refine(
    (value) =>
      value.trainingDayFrom == null ||
      value.trainingDayTo == null ||
      value.trainingDayFrom <= value.trainingDayTo,
    { path: ['trainingDayTo'], message: 'The last day cannot precede the first.' }
  );

export type UpdateClientFireSafetyRequest = z.infer<typeof updateClientFireSafetyRequestSchema>;

const capacity = z.int().min(1).max(250);
const manufacturedYear = z.int().min(1990).max(2100);

export const fireEquipmentRequestSchema = z
  .object({
    workplaceId: z.uuid(),
    kind: fireEquipmentKindSchema,
    agent: fireExtinguishingAgentSchema.nullish(),
    // Kilograms or litres.
    capacity: capacity.nullish(),
    wheeled: z.boolean().default(false),
    label: optionalText(1, 80),
    location: optionalText(2, 160),
    manufacturedYear: manufacturedYear.nullish(),
    lastServiceOn: z.iso.date().nullish(),
    nextServiceOn: z.iso.date().nullish(),
    maintainer: optionalText(2, 160),
  })
  .refine((unit) => (unit.kind === 'extinguisher') === (unit.agent != null), {
    path: ['agent'],
    message: 'An extinguisher has an agent; other equipment has none.',
  })
  .refine((unit) => (unit.kind === 'extinguisher') === (unit.capacity != null), {
    path: ['capacity'],
    message: 'An extinguisher has a capacity; other equipment has none.',
  })
  .refine((unit) => !unit.wheeled || unit.kind === 'extinguisher', {
    path: ['wheeled'],
    message: 'Only an extinguisher is wheeled.',
  });

export type FireEquipmentRequest = z.infer<typeof fireEquipmentRequestSchema>;

export const fireEquipmentSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  workplaceId: z.uuid(),
  kind: fireEquipmentKindSchema,
  agent: fireExtinguishingAgentSchema.nullable(),
  capacity: capacity.nullable(),
  wheeled: z.boolean(),
  label: z.string().nullable(),
  location: z.string().nullable(),
  manufacturedYear: manufacturedYear.nullable(),
  lastServiceOn: z.iso.date().nullable(),
  nextServiceOn: z.iso.date().nullable(),
  maintainer: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type FireEquipment = z.infer<typeof fireEquipmentSchema>;

export const fireEquipmentResponseSchema = z.object({ equipment: fireEquipmentSchema });

export type FireEquipmentResponse = z.infer<typeof fireEquipmentResponseSchema>;

export const fireEquipmentListResponseSchema = z.object({ items: z.array(fireEquipmentSchema) });

export type FireEquipmentListResponse = z.infer<typeof fireEquipmentListResponseSchema>;

export const fireInstallationRequestSchema = z
  .object({
    workplaceId: z.uuid(),
    kind: fireInstallationKindSchema,
    description: optionalText(2, 240),
    maintainer: optionalText(2, 160),
    lastCheckOn: z.iso.date().nullish(),
    nextCheckOn: z.iso.date().nullish(),
  })
  .refine((installation) => installation.kind !== 'other' || installation.description != null, {
    path: ['description'],
    message: 'Describe an installation of another kind.',
  });

export type FireInstallationRequest = z.infer<typeof fireInstallationRequestSchema>;

export const fireInstallationSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  workplaceId: z.uuid(),
  kind: fireInstallationKindSchema,
  description: z.string().nullable(),
  maintainer: z.string().nullable(),
  lastCheckOn: z.iso.date().nullable(),
  nextCheckOn: z.iso.date().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type FireInstallation = z.infer<typeof fireInstallationSchema>;

export const fireInstallationResponseSchema = z.object({ installation: fireInstallationSchema });

export type FireInstallationResponse = z.infer<typeof fireInstallationResponseSchema>;

export const fireInstallationListResponseSchema = z.object({
  items: z.array(fireInstallationSchema),
});

export type FireInstallationListResponse = z.infer<typeof fireInstallationListResponseSchema>;
