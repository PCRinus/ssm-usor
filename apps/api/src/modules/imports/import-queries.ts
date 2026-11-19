export type UsageColumns = {
  input_tokens: unknown;
  cached_input_tokens: unknown;
  output_tokens: unknown;
  cost_usd: unknown;
};

// Postgres numeric and bigint may arrive as strings.
export const modelUsageOf = (row: UsageColumns) => ({
  costUsd: Number(row.cost_usd ?? 0),
  inputTokens: Number(row.input_tokens ?? 0),
  cachedInputTokens: Number(row.cached_input_tokens ?? 0),
  outputTokens: Number(row.output_tokens ?? 0),
});
