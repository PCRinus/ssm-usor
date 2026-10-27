// One constant per step, so that moving a step to another model is one change (ADR 030).
export const sortingModel = 'gpt-6-luna';
export const readingModel = 'gpt-6.1-terra';

export type ModelId = typeof sortingModel | typeof readingModel;

export interface Usage {
  // Input tokens not read from the provider's cache; those are `cachedInput`.
  input: number;
  cachedInput: number;
  // Reasoning tokens included.
  output: number;
}

interface Rates {
  input: number;
  cachedInput: number;
  output: number;
}

// USD per million tokens at list price, by the size of the whole prompt. The cached-input rates
// of GPT-6 Luna are the ones the evaluation used on 2026-10-26.
export const modelRates: Record<ModelId, (promptTokens: number) => Rates> = {
  'gpt-6.1-terra': () => ({ input: 1, cachedInput: 0.05, output: 5 }),
  'gpt-6-luna': (promptTokens) =>
    promptTokens > 272_000
      ? { input: 0.2, cachedInput: 0.02, output: 0.75 }
      : { input: 0.1, cachedInput: 0.01, output: 0.5 },
};

export function costOf(model: ModelId, usage: Usage) {
  const rates = modelRates[model](usage.input + usage.cachedInput);
  return (
    (usage.input * rates.input +
      usage.cachedInput * rates.cachedInput +
      usage.output * rates.output) /
    1_000_000
  );
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    cachedInput: a.cachedInput + b.cachedInput,
    output: a.output + b.output,
  };
}

export const noUsage: Usage = { input: 0, cachedInput: 0, output: 0 };
