import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

import { type DraftCall, draftModel, draftSchema } from './draft.js';

export function claudeCall(apiKey: string): DraftCall {
  const client = new Anthropic({ apiKey, timeout: 120_000 });
  return async ({ system, user }) => {
    const message = await client.beta.messages.create({
      model: draftModel,
      max_tokens: 16_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(draftSchema) },
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
