import { addUsage, costOf, type ModelId, noUsage, type Usage } from './models';
import type { ChatMessage } from './prompts';
import type { AnswerFormat } from './wire';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface GatewayOptions {
  // The gateway's base URL, up to the gateway's name: https://gateway.ai.cloudflare.com/v1/<account>/<gateway>.
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMilliseconds?: number;
}

export interface CompletionRequest<T> {
  model: ModelId;
  messages: ChatMessage[];
  answer: AnswerFormat<T>;
  reasoningEffort: ReasoningEffort;
  maxCompletionTokens?: number;
  metadata: { organizationId: string; importId: string };
}

export interface Completion<T> {
  value: T;
  usage: Usage;
  // In USD.
  cost: number;
  attempts: number;
}

// Both errors carry what the failed attempts used, which is billed all the same.
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly usage: Usage,
    readonly cost: number
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class ModelAnswerError extends Error {
  constructor(
    message: string,
    readonly reason: 'refused' | 'incomplete' | 'outside_schema',
    readonly usage: Usage,
    readonly cost: number
  ) {
    super(message);
    this.name = 'ModelAnswerError';
  }
}

const transientRetries = 3;
const answerAttempts = 2;

const retryable = (status: number) => status === 429 || status >= 500;

function backoff(retry: number, retryAfter: string | null) {
  const seconds = Number(retryAfter);
  if (retryAfter !== null && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds, 60) * 1000;
  }
  return 2000 * 2 ** retry;
}

interface ChatCompletion {
  choices?: {
    finish_reason?: string;
    message?: { content?: string | null; refusal?: string | null };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

function usageOf(body: ChatCompletion): Usage {
  const prompt = body.usage?.prompt_tokens ?? 0;
  const cached = body.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    input: prompt - cached,
    cachedInput: cached,
    output: body.usage?.completion_tokens ?? 0,
  };
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createModelClient(options: GatewayOptions) {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const url = `${options.baseUrl.replace(/\/+$/, '')}/openai/chat/completions`;

  async function post(
    body: unknown,
    metadata: CompletionRequest<unknown>['metadata'],
    spent: Usage,
    model: ModelId
  ) {
    for (let retry = 0; ; retry++) {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-aig-authorization': `Bearer ${options.token}`,
          'cf-aig-metadata': JSON.stringify(metadata),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMilliseconds ?? 600_000),
      });
      if (response.ok) return (await response.json()) as ChatCompletion;
      const text = await response.text();
      if (retryable(response.status) && retry < transientRetries) {
        await sleep(backoff(retry, response.headers.get('retry-after')));
        continue;
      }
      throw new GatewayError(
        `The gateway answered ${response.status}: ${text.slice(0, 300)}`,
        response.status,
        spent,
        costOf(model, spent)
      );
    }
  }

  return {
    async complete<T>(request: CompletionRequest<T>): Promise<Completion<T>> {
      const body = {
        model: request.model,
        messages: request.messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.answer.name,
            strict: true,
            schema: request.answer.jsonSchema,
          },
        },
        reasoning_effort: request.reasoningEffort,
        ...(request.maxCompletionTokens
          ? { max_completion_tokens: request.maxCompletionTokens }
          : {}),
      };
      let usage = noUsage;
      let problem = '';
      for (let attempt = 1; attempt <= answerAttempts; attempt++) {
        const completion = await post(body, request.metadata, usage, request.model);
        usage = addUsage(usage, usageOf(completion));
        const choice = completion.choices?.[0];
        const fail = (reason: ModelAnswerError['reason'], message: string) =>
          new ModelAnswerError(message, reason, usage, costOf(request.model, usage));
        if (choice?.message?.refusal)
          throw fail('refused', `The model refused: ${choice.message.refusal}`);
        if (choice?.finish_reason !== 'stop') {
          throw fail(
            'incomplete',
            `The answer stopped early (${choice?.finish_reason ?? 'no choice'}).`
          );
        }
        try {
          const value = request.answer.parse(JSON.parse(choice.message?.content ?? ''));
          return { value, usage, cost: costOf(request.model, usage), attempts: attempt };
        } catch (error) {
          problem = error instanceof Error ? error.message.slice(0, 500) : String(error);
        }
      }
      throw new ModelAnswerError(
        `The answer was outside the schema twice: ${problem}`,
        'outside_schema',
        usage,
        costOf(request.model, usage)
      );
    },
  };
}

export type ModelClient = ReturnType<typeof createModelClient>;
