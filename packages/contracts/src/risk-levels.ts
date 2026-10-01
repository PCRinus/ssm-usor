import { type WorkSystemComponent, workSystemComponents } from './risk-evaluations';

// The figures of the I.N.C.D.P.M. method, as the risk assessment's chapter on the method
// states them (ADR 015).

export type GravityClass = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ProbabilityClass = 1 | 2 | 3 | 4 | 5 | 6;
export type RiskLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ClassedRiskFactor {
  gravityClass: number;
  probabilityClass: number;
}

/** Rows by gravity class 1–7, columns by probability class 1–6. */
export const riskLevelGrid = [
  [1, 1, 1, 1, 1, 1],
  [1, 2, 2, 2, 3, 3],
  [2, 2, 3, 3, 4, 4],
  [2, 3, 4, 4, 5, 5],
  [3, 4, 4, 5, 5, 6],
  [3, 4, 5, 6, 6, 7],
  [3, 4, 5, 6, 7, 7],
] as const satisfies readonly (readonly RiskLevel[])[];

export const maxAcceptableRiskLevel = 3;

export const maxAcceptableGlobalRiskLevel = 3.5;

export const gravityConsequences = {
  1: 'Minore reversibile',
  2: 'ITM 3–45 zile',
  3: 'ITM 45–180 zile',
  4: 'Invaliditate gradul III',
  5: 'Invaliditate gradul II',
  6: 'Invaliditate gradul I',
  7: 'Deces',
} as const satisfies Record<GravityClass, string>;

function isClass(value: number, max: number) {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

export function riskLevel(gravityClass: number, probabilityClass: number): RiskLevel {
  if (!isClass(gravityClass, 7) || !isClass(probabilityClass, 6)) {
    throw new RangeError(
      `No risk level for gravity ${gravityClass}, probability ${probabilityClass}.`
    );
  }
  return riskLevelGrid[gravityClass - 1]![probabilityClass - 1]!;
}

export function gravityConsequence(gravityClass: number): string {
  if (!isClass(gravityClass, 7)) throw new RangeError(`No gravity class ${gravityClass}.`);
  return gravityConsequences[gravityClass as GravityClass];
}

export function isUnacceptableRiskLevel(level: number): boolean {
  return level > maxAcceptableRiskLevel;
}

/** Σ R² / Σ R to two decimals: each level weighted by itself. Null without levels. */
export function globalRiskLevel(levels: readonly number[]): number | null {
  if (levels.length === 0) return null;
  let sum = 0;
  let sumOfSquares = 0;
  for (const level of levels) {
    sum += level;
    sumOfSquares += level * level;
  }
  // Scaled before dividing, so a mean that ends in a half hundredth rounds up exactly.
  return Math.round((sumOfSquares * 100) / sum) / 100;
}

export function evaluationGlobalRiskLevel(factors: readonly ClassedRiskFactor[]): number | null {
  return globalRiskLevel(factors.map((f) => riskLevel(f.gravityClass, f.probabilityClass)));
}

export function isOverAcceptableLimit(globalLevel: number | null): boolean {
  return globalLevel !== null && globalLevel > maxAcceptableGlobalRiskLevel;
}

/** The factors above the acceptable level, the highest first; equal levels keep their order. */
export function unacceptableFactors<T extends ClassedRiskFactor>(factors: readonly T[]): T[] {
  return factors
    .map((factor) => ({ factor, level: riskLevel(factor.gravityClass, factor.probabilityClass) }))
    .filter(({ level }) => isUnacceptableRiskLevel(level))
    .sort((a, b) => b.level - a.level)
    .map(({ factor }) => factor);
}

/** Each component's share of the factors, in percent to two decimals; all zero without factors. */
export function componentShares(
  factors: readonly { component: WorkSystemComponent }[]
): Record<WorkSystemComponent, number> {
  const counts = Object.fromEntries(workSystemComponents.map((c) => [c, 0])) as Record<
    WorkSystemComponent,
    number
  >;
  for (const factor of factors) counts[factor.component] += 1;
  if (factors.length === 0) return counts;
  return Object.fromEntries(
    workSystemComponents.map((c) => [c, Math.round((counts[c] * 10_000) / factors.length) / 100])
  ) as Record<WorkSystemComponent, number>;
}
