import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

import { type DraftCall, draftModel, draftSchema, type Gateway } from './draft.js';

export function claudeCall(gateway: Gateway): DraftCall {
  const client = new Anthropic({
    baseURL: `${gateway.url.replace(/\/+$/, '')}/anthropic`,
    apiKey: 'unified-billing',
    defaultHeaders: { 'cf-aig-authorization': `Bearer ${gateway.token}` },
    fetch: withoutProviderKey(fetch),
    timeout: 120_000,
  });
  return async ({ system, user }) => {
    const message = await client.beta.messages.create({
      model: draftModel,
      max_tokens: 16_000,
      output_config: { effort: 'high', format: betaZodOutputFormat(draftSchema) },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (message.stop_reason === 'refusal') {
      throw new Error(`the model declined (${message.stop_details?.category ?? 'no category'})`);
    }
    if (message.stop_reason !== 'end_turn') {
      throw new Error(`the answer stopped early (${message.stop_reason})`);
    }
    const text = message.content.find((block) => block.type === 'text');
    if (text === undefined) throw new Error('the answer holds no text');
    return JSON.parse(text.text) as unknown;
  };
}

// AI Gateway forwards any provider credential it finds on the request and only then falls back
// to Unified Billing, so the SDK's placeholder key must not reach it.
export function withoutProviderKey(inner: typeof fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete('x-api-key');
    return inner(input, { ...init, headers });
  };
}
