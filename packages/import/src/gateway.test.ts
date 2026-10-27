import { describe, expect, it } from 'vitest';

import { createModelClient, GatewayError, ModelAnswerError } from './gateway';
import { costOf, readingModel, sortingModel } from './models';
import { sortingMessages } from './prompts';
import { sortingAnswer } from './sorting';
import { provider } from './test/fixtures';

const answer = {
  files: [
    {
      path: 'Decizia 1.docx',
      kind: 'decision',
      companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
      companyCui: '12345674',
      carriesClientData: true,
    },
  ],
};

function completion(content: unknown, usage = { prompt: 1200, cached: 200, completion: 300 }) {
  return Response.json({
    id: 'chatcmpl-recorded',
    object: 'chat.completion',
    model: sortingModel,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: typeof content === 'string' ? content : JSON.stringify(content),
          refusal: null,
        },
      },
    ],
    usage: {
      prompt_tokens: usage.prompt,
      completion_tokens: usage.completion,
      total_tokens: usage.prompt + usage.completion,
      prompt_tokens_details: { cached_tokens: usage.cached },
      completion_tokens_details: { reasoning_tokens: 100 },
    },
  });
}

function fakeGateway(...responses: (() => Response)[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const delays: number[] = [];
  const client = createModelClient({
    baseUrl: 'https://gateway.example/v1/account/import/',
    token: 'gateway-token',
    fetch: async (input, init) => {
      requests.push({ url: String(input), init: init! });
      const next = responses.shift();
      if (!next) throw new Error('No recorded answer left.');
      return next();
    },
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });
  return { client, requests, delays };
}

const request = {
  model: sortingModel,
  messages: sortingMessages({ provider, files: [{ path: 'Decizia 1.docx', text: 'DECIZIA' }] }),
  answer: sortingAnswer,
  reasoningEffort: 'low',
  metadata: { organizationId: 'org-1', importId: 'import-1' },
} as const;

describe('createModelClient', () => {
  it('posts a strict structured request with the gateway token and metadata', async () => {
    const { client, requests } = fakeGateway(() => completion(answer));

    const result = await client.complete({ ...request, maxCompletionTokens: 4000 });

    expect(requests).toHaveLength(1);
    const [{ url, init }] = requests as [(typeof requests)[number]];
    expect(url).toBe('https://gateway.example/v1/account/import/openai/chat/completions');
    const headers = new Headers(init.headers);
    expect(headers.get('cf-aig-authorization')).toBe('Bearer gateway-token');
    expect(JSON.parse(headers.get('cf-aig-metadata')!)).toEqual({
      organizationId: 'org-1',
      importId: 'import-1',
    });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: 'gpt-6-luna',
      reasoning_effort: 'low',
      max_completion_tokens: 4000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'import_sorting', strict: true, schema: sortingAnswer.jsonSchema },
      },
    });
    expect(body.messages).toEqual(request.messages);

    expect(result.value.files[0]).toMatchObject({ kind: 'decision', companyCui: '12345674' });
    expect(result.usage).toEqual({ input: 1000, cachedInput: 200, output: 300 });
    expect(result.cost).toBeCloseTo((1000 * 0.1 + 200 * 0.01 + 300 * 0.5) / 1e6, 12);
    expect(result.attempts).toBe(1);
  });

  it('retries 429 and 5xx with backoff, then answers', async () => {
    const { client, delays } = fakeGateway(
      () => new Response('rate limited', { status: 429, headers: { 'retry-after': '7' } }),
      () => new Response('bad gateway', { status: 502 }),
      () => completion(answer)
    );

    const result = await client.complete(request);

    expect(delays).toEqual([7000, 4000]);
    expect(result.attempts).toBe(1);
  });

  it('gives up after three retries with a named error', async () => {
    const unavailable = () => new Response('unavailable', { status: 503 });
    const { client, requests } = fakeGateway(unavailable, unavailable, unavailable, unavailable);

    const failure = client.complete(request);

    await expect(failure).rejects.toThrow(GatewayError);
    await expect(failure).rejects.toMatchObject({ status: 503 });
    expect(requests).toHaveLength(4);
  });

  it('does not retry a client error', async () => {
    const { client, requests } = fakeGateway(() => new Response('bad request', { status: 400 }));

    await expect(client.complete(request)).rejects.toMatchObject({
      name: 'GatewayError',
      status: 400,
    });
    expect(requests).toHaveLength(1);
  });

  it('asks once more for an answer outside the schema and counts both', async () => {
    const outside = { files: [{ ...answer.files[0], kind: 'invoice' }] };
    const { client } = fakeGateway(
      () => completion(outside),
      () => completion(answer)
    );

    const result = await client.complete(request);

    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({ input: 2000, cachedInput: 400, output: 600 });
  });

  it('fails with a named error after a second answer outside the schema', async () => {
    const { client } = fakeGateway(
      () => completion('{"files": ['),
      () => completion({ files: 'none' })
    );

    const failure = client.complete(request);

    await expect(failure).rejects.toThrow(ModelAnswerError);
    await expect(failure).rejects.toMatchObject({
      reason: 'outside_schema',
      usage: { input: 2000, cachedInput: 400, output: 600 },
    });
  });

  it('fails on a refusal and on an answer that stopped early', async () => {
    const refused = Response.json({
      choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'I cannot help.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });
    const cut = Response.json({
      choices: [{ finish_reason: 'length', message: { content: '{"files": [' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });

    await expect(fakeGateway(() => refused).client.complete(request)).rejects.toMatchObject({
      name: 'ModelAnswerError',
      reason: 'refused',
    });
    await expect(fakeGateway(() => cut).client.complete(request)).rejects.toMatchObject({
      name: 'ModelAnswerError',
      reason: 'incomplete',
    });
  });
});

describe('costOf', () => {
  it('prices GPT-6.1 Terra and GPT-6 Luna’s higher tier', () => {
    expect(
      costOf(readingModel, { input: 1_000_000, cachedInput: 1_000_000, output: 1_000_000 })
    ).toBe(1 + 0.05 + 5);
    expect(costOf(sortingModel, { input: 300_000, cachedInput: 0, output: 1_000_000 })).toBeCloseTo(
      0.3 * 0.2 + 0.75,
      12
    );
  });
});
