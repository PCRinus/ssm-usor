import {
  caenClassName,
  componentShares,
  evaluationGlobalRiskLevel,
  globalRiskLevel,
  gravityConsequence,
  isOverAcceptableLimit,
  isUnacceptableRiskLevel,
  maxAcceptableGlobalRiskLevel,
  type PreventionMeasureKind,
  type RiskEvaluationGap,
  type RiskEvaluationKind,
  riskLevel,
  sheetComponents,
  unacceptableFactors,
  type WorkSystemComponent,
} from '@ssm-usor/contracts';

export type RiskFactorFacts = {
  component: WorkSystemComponent;
  group: string;
  description: string;
  gravityClass: number;
  probabilityClass: number;
  /** In the order they were entered. */
  measures: { kind: PreventionMeasureKind; description: string }[];
  actions: string | null;
  deadline: string | null;
  responsiblePerson: string | null;
  observations: string | null;
};

export type RiskEvaluationFacts = {
  id: string;
  kind: RiskEvaluationKind;
  /** Set for kind `job_position` only. */
  jobPositionId: string | null;
  /** Set for kind `other` only. */
  name: string | null;
  meansOfProduction: string | null;
  workEnvironment: string | null;
  exposure: string;
  /** Null for a position's evaluation, which reads both from its position. */
  workTask: string | null;
  exposedPersons: string | null;
  /** In the evaluator's order. */
  factors: RiskFactorFacts[];
};

export type EvaluatedPosition = {
  id: string;
  name: string;
  workZone: string | null;
  activities: string | null;
  currentEmployeeCount: number;
};

export type WorkplaceFacts = {
  name: string;
  registeredOffice: boolean;
  /** Already in words: "București", "Timiș". */
  county: string | null;
  countyCode: string | null;
  locality: string | null;
  addressLine: string | null;
};

const dash = '—';
const orDash = (value: string | null | undefined) => value?.trim() || dash;

const collator = new Intl.Collator('ro');

export const sensitiveGroupsName = 'Grupuri sensibile la riscuri specifice';

const sensitiveGroupsHeading =
  'GRUPURI SENSIBILE LA RISCURI SPECIFICE (FEMEI GRAVIDE, LĂUZE SAU FEMEI CARE ALĂPTEAZĂ, TINERI, PERSOANE CU DIZABILITĂȚI)';

const sensitiveGroupsExecutant =
  'Lucrători din grupurile sensibile la riscuri specifice: femei gravide, lăuze sau femei care alăptează, tineri, persoane cu dizabilități';

/** Romanian puts "de" between a number and its noun from 20 on, except 101 to 119 and the like. */
export function countOf(count: number, one: string, many: string) {
  if (count === 1) return `1 ${one}`;
  const lastTwo = count % 100;
  return count >= 20 && (lastTwo === 0 || lastTwo >= 20)
    ? `${count} de ${many}`
    : `${count} ${many}`;
}

/** "2,49": two decimals and a comma, as the method's sheets print a level. */
export const printedLevel = (level: number) => level.toFixed(2).replace('.', ',');

export const printedShare = (percent: number) => `${printedLevel(percent)} %`;

const componentWords: Record<WorkSystemComponent, { label: string; of: string }> = {
  means_of_production: { label: 'MIJLOACE DE PRODUCȚIE', of: 'mijloacelor de producție' },
  work_environment: { label: 'MEDIUL DE MUNCĂ', of: 'mediului de muncă' },
  executant: { label: 'EXECUTANT', of: 'executantului' },
  work_task: { label: 'SARCINA DE MUNCĂ', of: 'sarcinii de muncă' },
};

const measureKinds = {
  technical: 'technical',
  organizational: 'organizational',
  hygienicSanitary: 'hygienic_sanitary',
  other: 'other',
} as const satisfies Record<string, PreventionMeasureKind>;

type MeasuresByKind = Record<keyof typeof measureKinds, string>;

function measuresByKind(measures: RiskFactorFacts['measures']): MeasuresByKind {
  return Object.fromEntries(
    Object.entries(measureKinds).map(([key, kind]) => [
      key,
      orDash(
        measures
          .filter((measure) => measure.kind === kind)
          .map((measure) => measure.description.trim())
          .join('\n')
      ),
    ])
  ) as MeasuresByKind;
}

const romanNumerals: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function roman(value: number) {
  let rest = value;
  let text = '';
  for (const [size, numeral] of romanNumerals) {
    while (rest >= size) {
      text += numeral;
      rest -= size;
    }
  }
  return text;
}

/**
 * The evaluations the documents print, in the ADR's order: the current positions in the order
 * of the positions table, the sensitive groups, then the others by name. An evaluation of a
 * position that is no longer current stays out, as does another one without a factor yet.
 */
export function printedEvaluations(
  evaluations: readonly RiskEvaluationFacts[],
  positions: readonly EvaluatedPosition[]
): RiskEvaluationFacts[] {
  const positionOrder = new Map(positions.map((position, index) => [position.id, index]));
  const rank = (evaluation: RiskEvaluationFacts) =>
    evaluation.kind === 'job_position'
      ? positionOrder.get(evaluation.jobPositionId!)!
      : evaluation.kind === 'sensitive_groups'
        ? positions.length
        : positions.length + 1;
  return evaluations
    .filter((evaluation) =>
      evaluation.kind === 'job_position'
        ? positionOrder.has(evaluation.jobPositionId ?? '')
        : evaluation.kind === 'sensitive_groups' || evaluation.factors.length > 0
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        collator.compare(a.name?.trim() ?? '', b.name?.trim() ?? '') ||
        a.id.localeCompare(b.id)
    );
}

export type IncompleteRiskEvaluation = {
  evaluationId: string | null;
  kind: RiskEvaluationKind;
  jobPositionId: string | null;
  name: string;
  missing: RiskEvaluationGap[];
};

const levelOf = (factor: Pick<RiskFactorFacts, 'gravityClass' | 'probabilityClass'>) =>
  riskLevel(factor.gravityClass, factor.probabilityClass);

/**
 * What each evaluation lacks before the documents can be generated (ADR 015): every current
 * position and the sensitive groups evaluated with a factor; every unacceptable factor with a
 * measure; every factor with measures with a deadline and a person responsible.
 */
export function incompleteRiskEvaluations(
  evaluations: readonly RiskEvaluationFacts[],
  positions: readonly EvaluatedPosition[]
): IncompleteRiskEvaluation[] {
  const printed = printedEvaluations(evaluations, positions);
  const gapsOf = (evaluation: RiskEvaluationFacts | undefined): RiskEvaluationGap[] => {
    const factors = evaluation?.factors ?? [];
    const gaps: RiskEvaluationGap[] = [];
    if (factors.length === 0) gaps.push('factors');
    if (
      factors.some((factor) => isUnacceptableRiskLevel(levelOf(factor)) && !factor.measures.length)
    ) {
      gaps.push('measures');
    }
    if (
      factors.some(
        (factor) =>
          factor.measures.length > 0 &&
          !(factor.deadline?.trim() && factor.responsiblePerson?.trim())
      )
    ) {
      gaps.push('plan');
    }
    return gaps;
  };
  const byPosition = new Map(
    printed
      .filter((evaluation) => evaluation.kind === 'job_position')
      .map((evaluation) => [evaluation.jobPositionId, evaluation])
  );
  const sensitiveGroups = printed.find((evaluation) => evaluation.kind === 'sensitive_groups');
  return [
    ...positions.map((position) => {
      const evaluation = byPosition.get(position.id);
      return {
        evaluationId: evaluation?.id ?? null,
        kind: 'job_position' as const,
        jobPositionId: position.id,
        name: position.name.trim(),
        missing: gapsOf(evaluation),
      };
    }),
    {
      evaluationId: sensitiveGroups?.id ?? null,
      kind: 'sensitive_groups' as const,
      jobPositionId: null,
      name: sensitiveGroupsName,
      missing: gapsOf(sensitiveGroups),
    },
    ...printed
      .filter((evaluation) => evaluation.kind === 'other')
      .map((evaluation) => ({
        evaluationId: evaluation.id,
        kind: 'other' as const,
        jobPositionId: null,
        name: evaluation.name!.trim(),
        missing: gapsOf(evaluation),
      })),
  ].filter((evaluation) => evaluation.missing.length > 0);
}

type FactorLine = { code: string; description: string };

type SheetFactor = FactorLine & { level: number };

export type RiskAssessmentEvaluation = {
  /** The subchapter's numeral in chapter V: "I", "II". */
  roman: string;
  name: string;
  /** "LOCUL DE MUNCĂ: BIROU, POSTUL DE LUCRU: CONTABIL", for every heading of the subchapter. */
  heading: string;
  workZoneOrDash: string;
  workSystem: {
    executant: string;
    workTask: string;
    meansOfProduction: string;
    workEnvironment: string;
  };
  /** "3 persoane", from the current employees of the position or the evaluation's own text. */
  exposedPersons: string;
  exposure: string;
  factorCount: number;
  /** The four components in the sheet's order, each with its groups and their factors. */
  components: {
    label: string;
    of: string;
    count: number;
    share: string;
    noFactors: boolean;
    groups: { letter: string; name: string; factors: FactorLine[] }[];
  }[];
  /** A row per factor; the component and the group are printed on their first row only. */
  sheet: (SheetFactor & {
    component: string;
    group: string;
    consequence: string;
    gravityClass: number;
    probabilityClass: number;
  })[];
  /** Every factor, the highest level first; equal levels in the sheet's order. */
  ranked: SheetFactor[];
  globalLevel: string;
  verdict: string;
  /** The highest level first: the measures sheet and the interpretation's list. */
  unacceptable: (SheetFactor & {
    /** Every measure, one per line, in the order entered. */
    measures: string;
  })[];
  hasUnacceptable: boolean;
  noUnacceptable: boolean;
  findings: string;
  /** Empty without unacceptable factors, like `measuresSentence`. */
  unacceptableLead: string;
  measuresSentence: string;
  irreversible: string;
  /** The prevention plan's rows: every factor with a measure, the highest level first. */
  plan: (FactorLine &
    MeasuresByKind & {
      actions: string;
      deadline: string;
      responsiblePerson: string;
      observations: string;
    })[];
  hasPlan: boolean;
  noPlan: boolean;
};

export type RiskAssessmentContext = {
  unit: {
    /** "5630 – Baruri și alte activități de servire a băuturilor", or a dash without one. */
    activity: string;
    employeeCount: number;
    workplaces: { name: string; kind: string; address: string }[];
    noWorkplaces: boolean;
  };
  /** "5 posturi de lucru": every evaluation printed, the sensitive groups included. */
  evaluationCountText: string;
  /** The unit's level: the evaluations' levels, each weighted by itself, as the method says. */
  globalLevel: string;
  evaluations: RiskAssessmentEvaluation[];
};

function findings(total: number, unacceptable: number) {
  const lead = 'Rezultatul este susținut de „Fișa de evaluare”, din care se observă că';
  const exceeds =
    'ca nivel parțial de risc, valoarea 3, încadrându-se în categoria factorilor de risc mare';
  const factors = countOf(total, 'factor de risc identificat', 'factori de risc identificați');
  if (total === 1) {
    return unacceptable === 0
      ? `${lead} singurul factor de risc identificat nu depășește, ca nivel parțial de risc, valoarea 3.`
      : `${lead} singurul factor de risc identificat depășește, ${exceeds}.`;
  }
  if (unacceptable === 0) {
    return `${lead} niciunul dintre cei ${factors} nu depășește, ca nivel parțial de risc, valoarea 3.`;
  }
  if (unacceptable === total) return `${lead} toți cei ${factors} depășesc, ${exceeds}.`;
  return unacceptable === 1
    ? `${lead} din totalul de ${factors}, unul singur depășește, ${exceeds}.`
    : `${lead} din totalul de ${factors}, ${unacceptable} dintre ei depășesc, ${exceeds}.`;
}

function unacceptableLead(count: number) {
  if (count === 0) return '';
  return count === 1
    ? 'Factorul de risc care se situează în domeniul inacceptabil este:'
    : `Cei ${countOf(count, 'factor', 'factori')} de risc care se situează în domeniul inacceptabil sunt:`;
}

function measuresSentence(count: number) {
  if (count === 0) return '';
  const subject =
    count === 1 ? 'acestui factor de risc' : `celor ${countOf(count, 'factor', 'factori')} de risc`;
  return `Pentru diminuarea sau eliminarea ${subject} sunt necesare măsurile prezentate în „Fișa de măsuri propuse”.`;
}

// Invalidity of any grade or death: gravity classes 4 to 7 of the method.
const irreversibleGravity = 4;

function irreversible(total: number, count: number) {
  const consequences = 'consecințe ireversibile asupra executantului (deces sau invaliditate)';
  if (count === 0) {
    return total === 1
      ? `Factorul de risc identificat nu poate avea ${consequences}.`
      : `Niciunul dintre factorii de risc identificați nu poate avea ${consequences}.`;
  }
  const lead = 'Din analiza „Fișei de evaluare” se constată că';
  if (count === total) {
    return total === 1
      ? `${lead} singurul factor de risc identificat poate avea ${consequences}.`
      : `${lead} toți factorii de risc identificați pot avea ${consequences}.`;
  }
  const share = printedShare(Math.round((count * 10_000) / total) / 100);
  return count === 1
    ? `${lead} unul dintre factorii de risc identificați, reprezentând ${share}, poate avea ${consequences}.`
    : `${lead} ${count} dintre factorii de risc identificați, reprezentând ${share}, pot avea ${consequences}.`;
}

const limit = String(maxAcceptableGlobalRiskLevel).replace('.', ',');

const verdicts = {
  within: `valoare care îl încadrează în categoria locurilor de muncă cu nivel de risc acceptabil, nedepășind limita maximă acceptabilă de ${limit}`,
  over: `valoare care depășește limita maximă acceptabilă de ${limit} și îl încadrează în categoria locurilor de muncă cu nivel de risc inacceptabil`,
};

const byLevel = <T extends { level: number; index: number }>(a: T, b: T) =>
  b.level - a.level || a.index - b.index;

function evaluationContext(
  evaluation: RiskEvaluationFacts,
  position: EvaluatedPosition | undefined,
  index: number
): RiskAssessmentEvaluation {
  const name =
    evaluation.kind === 'job_position'
      ? position!.name.trim()
      : evaluation.kind === 'sensitive_groups'
        ? sensitiveGroupsName
        : evaluation.name!.trim();
  const workZone = position?.workZone?.trim() || null;
  const upper = (text: string) => text.toLocaleUpperCase('ro');
  const heading =
    evaluation.kind === 'sensitive_groups'
      ? sensitiveGroupsHeading
      : evaluation.kind === 'other'
        ? upper(name)
        : workZone
          ? `LOCUL DE MUNCĂ: ${upper(workZone)}, POSTUL DE LUCRU: ${upper(name)}`
          : `POSTUL DE LUCRU: ${upper(name)}`;

  // Numbered F1…Fn down the sheet: by component, then by group in the order the evaluator
  // first used it, then in the evaluator's order.
  const groups = sheetComponents.map((component) => {
    const byGroup = new Map<string, { name: string; factors: RiskFactorFacts[] }>();
    for (const factor of evaluation.factors) {
      if (factor.component !== component) continue;
      const key = factor.group.trim().toLocaleLowerCase('ro');
      const group = byGroup.get(key) ?? { name: factor.group.trim(), factors: [] };
      group.factors.push(factor);
      byGroup.set(key, group);
    }
    return { component, groups: [...byGroup.values()] };
  });
  const numbered = groups.flatMap(({ component, groups }) =>
    groups.flatMap((group, groupIndex) =>
      group.factors.map((factor, factorIndex) => ({
        component,
        group,
        groupIndex,
        factorIndex,
        factor,
      }))
    )
  );
  const facts = numbered.map(({ factor }, number) => ({
    factor,
    index: number,
    level: levelOf(factor),
    code: `F${number + 1}`,
    description: factor.description.trim(),
  }));
  const factorLine = (entry: (typeof facts)[number]): FactorLine => ({
    code: entry.code,
    description: entry.description,
  });
  const sheetFactor = (entry: (typeof facts)[number]): SheetFactor => ({
    ...factorLine(entry),
    level: entry.level,
  });
  const unacceptable = unacceptableFactors(facts.map((entry) => ({ ...entry.factor, entry }))).map(
    ({ entry }) => entry
  );
  const shares = componentShares(evaluation.factors);
  const level = globalRiskLevel(facts.map((entry) => entry.level))!;
  const irreversibleCount = evaluation.factors.filter(
    (factor) => factor.gravityClass >= irreversibleGravity
  ).length;

  return {
    roman: roman(index + 1),
    name,
    heading,
    workZoneOrDash: workZone ?? dash,
    workSystem: {
      executant: evaluation.kind === 'sensitive_groups' ? sensitiveGroupsExecutant : name,
      workTask: orDash(position ? position.activities : evaluation.workTask),
      meansOfProduction: orDash(evaluation.meansOfProduction),
      workEnvironment: orDash(evaluation.workEnvironment),
    },
    exposedPersons: position
      ? position.currentEmployeeCount === 0
        ? 'nicio persoană'
        : countOf(position.currentEmployeeCount, 'persoană', 'persoane')
      : orDash(evaluation.exposedPersons),
    exposure: evaluation.exposure.trim(),
    factorCount: facts.length,
    components: groups.map(({ component, groups: componentGroups }) => {
      const count = componentGroups.reduce((total, group) => total + group.factors.length, 0);
      return {
        ...componentWords[component],
        count,
        share: printedShare(shares[component]),
        noFactors: count === 0,
        groups: componentGroups.map((group, groupIndex) => ({
          letter: String.fromCharCode(97 + (groupIndex % 26)),
          name: group.name,
          factors: facts.filter((entry) => group.factors.includes(entry.factor)).map(factorLine),
        })),
      };
    }),
    sheet: facts.map((entry, position) => {
      const { component, groupIndex, factorIndex } = numbered[position]!;
      const startsComponent = groupIndex === 0 && factorIndex === 0;
      return {
        ...sheetFactor(entry),
        component: startsComponent ? componentWords[component].label : '',
        group: factorIndex === 0 ? numbered[position]!.group.name : '',
        consequence: gravityConsequence(entry.factor.gravityClass),
        gravityClass: entry.factor.gravityClass,
        probabilityClass: entry.factor.probabilityClass,
      };
    }),
    ranked: [...facts].sort(byLevel).map(sheetFactor),
    globalLevel: printedLevel(level),
    verdict: isOverAcceptableLimit(level) ? verdicts.over : verdicts.within,
    unacceptable: unacceptable.map((entry) => ({
      ...sheetFactor(entry),
      measures: orDash(
        entry.factor.measures.map((measure) => measure.description.trim()).join('\n')
      ),
    })),
    hasUnacceptable: unacceptable.length > 0,
    noUnacceptable: unacceptable.length === 0,
    findings: findings(facts.length, unacceptable.length),
    unacceptableLead: unacceptableLead(unacceptable.length),
    measuresSentence: measuresSentence(unacceptable.length),
    irreversible: irreversible(facts.length, irreversibleCount),
    plan: facts
      .filter((entry) => entry.factor.measures.length > 0)
      .sort(byLevel)
      .map((entry) => ({
        ...factorLine(entry),
        ...measuresByKind(entry.factor.measures),
        actions: orDash(entry.factor.actions),
        deadline: orDash(entry.factor.deadline),
        responsiblePerson: orDash(entry.factor.responsiblePerson),
        observations: orDash(entry.factor.observations),
      })),
    hasPlan: facts.some((entry) => entry.factor.measures.length > 0),
    noPlan: !facts.some((entry) => entry.factor.measures.length > 0),
  };
}

const workplaceAddress = (workplace: WorkplaceFacts) => {
  // The capital is its own county: "București, Calea Victoriei 122A", without "județul".
  const place =
    workplace.countyCode === 'B'
      ? [workplace.locality]
      : [workplace.locality, workplace.county && `județul ${workplace.county}`];
  return orDash([...place, workplace.addressLine].filter(Boolean).join(', '));
};

export function riskAssessment({
  evaluations,
  positions,
  caenCode,
  workplaces,
  currentEmployeeCount,
}: {
  evaluations: readonly RiskEvaluationFacts[];
  positions: readonly EvaluatedPosition[];
  caenCode: string | null;
  workplaces: readonly WorkplaceFacts[];
  currentEmployeeCount: number;
}): RiskAssessmentContext {
  const byId = new Map(positions.map((position) => [position.id, position]));
  const printedFacts = printedEvaluations(evaluations, positions);
  const printed = printedFacts.map((evaluation, index) =>
    evaluationContext(evaluation, byId.get(evaluation.jobPositionId ?? ''), index)
  );
  // The method weighs each workplace's level by itself, as it weighs the factors of one.
  const unitLevel = globalRiskLevel(
    printedFacts.flatMap((evaluation) => evaluationGlobalRiskLevel(evaluation.factors) ?? [])
  );
  const activity = caenClassName(caenCode);
  const ordered = [...workplaces].sort(
    (a, b) => Number(b.registeredOffice) - Number(a.registeredOffice)
  );
  return {
    unit: {
      activity: caenCode ? (activity ? `${caenCode} – ${activity}` : caenCode) : dash,
      employeeCount: currentEmployeeCount,
      workplaces: ordered.map((workplace) => ({
        name: workplace.name.trim(),
        kind: workplace.registeredOffice ? 'Sediu social' : 'Punct de lucru',
        address: workplaceAddress(workplace),
      })),
      noWorkplaces: workplaces.length === 0,
    },
    evaluationCountText: countOf(printed.length, 'post de lucru', 'posturi de lucru'),
    globalLevel: unitLevel === null ? dash : printedLevel(unitLevel),
    evaluations: printed,
  };
}

const sameText = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.;,]+$/, '')
    .toLocaleLowerCase('ro');

/**
 * The unit's own risks for the general training material: the unacceptable factors of every
 * evaluation printed, each description once, the highest level first, with every measure
 * taken against it, one per line.
 */
export function unitRisks(
  evaluations: readonly RiskEvaluationFacts[],
  positions: readonly EvaluatedPosition[]
): { risk: string; measure: string }[] {
  const risks = new Map<
    string,
    { risk: string; level: number; index: number; measures: Map<string, string> }
  >();
  for (const evaluation of printedEvaluations(evaluations, positions)) {
    for (const factor of evaluation.factors) {
      const level = levelOf(factor);
      if (!isUnacceptableRiskLevel(level)) continue;
      const key = sameText(factor.description);
      const risk = risks.get(key) ?? {
        risk: factor.description.trim(),
        level,
        index: risks.size,
        measures: new Map<string, string>(),
      };
      risk.level = Math.max(risk.level, level);
      for (const measure of factor.measures) {
        const text = measure.description.trim();
        if (!risk.measures.has(sameText(text))) risk.measures.set(sameText(text), text);
      }
      risks.set(key, risk);
    }
  }
  return [...risks.values()].sort(byLevel).map((risk) => ({
    risk: risk.risk,
    measure: orDash([...risk.measures.values()].join('\n')),
  }));
}
