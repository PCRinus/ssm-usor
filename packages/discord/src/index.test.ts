import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clip,
  codeBlock,
  diffBlock,
  discordLimits,
  discordPayloads,
  discordWebhook,
  escapeCode,
  noPreview,
  splitContent,
} from './index';

const webhook = 'https://discord.example/api/webhooks/1/token';
const posted = () => new Response(null, { status: 204 });
const bodies = (fetcher: ReturnType<typeof vi.fn<typeof fetch>>) =>
  fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clip and noPreview', () => {
  it('cuts a text to its limit with an ellipsis, and leaves a short one alone', () => {
    expect(clip('abcdef', 4)).toBe('abc…');
    expect(clip('abcd', 4)).toBe('abcd');
    expect(clip('abcd', 1)).toBe('…');
    expect(clip('abcd', 0)).toBe('');
    expect(clip('abcd', -3)).toBe('');
  });

  it('never cuts an emoji in half', () => {
    expect(clip('a😀b', 3)).toBe('a…');
    expect(clip('ab😀', 3)).toBe('ab…');
  });

  it('wraps a link in angle brackets', () => {
    expect(noPreview('https://admin.ssmusor.ro/imports/1')).toBe(
      '<https://admin.ssmusor.ro/imports/1>'
    );
  });
});

describe('codeBlock and diffBlock', () => {
  it('wraps code in a block', () => {
    expect(codeBlock('a\nb', 'text')).toBe('```text\na\nb\n```');
  });

  it('shows each passage as removed and added lines', () => {
    expect(
      diffBlock([
        { before: 'art. 36 alin. (2) old\nsecond line', after: 'art. 36 alin. (2) new' },
        { before: '', after: 'an added passage' },
      ])
    ).toBe(
      '```diff\n- art. 36 alin. (2) old\n- second line\n+ art. 36 alin. (2) new\n\n+ an added passage\n```'
    );
  });

  it('keeps a passage with backticks from closing the block', () => {
    const block = diffBlock([{ before: 'a ``` b', after: 'c ` d' }]);
    expect(block.slice(3, -3)).not.toContain('``');
    expect(block.replaceAll('​', '')).toBe('```diff\n- a ``` b\n+ c ` d\n```');
  });
});

describe('splitContent', () => {
  it('keeps a message that fits whole', () => {
    expect(splitContent('one\ntwo')).toEqual(['one\ntwo']);
    expect(splitContent('')).toEqual([]);
  });

  it('splits at line ends, each part within the limit', () => {
    const lines = Array.from({ length: 300 }, (_, index) => `line ${index} `.padEnd(20, '.'));
    const parts = splitContent(lines.join('\n'));
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(discordLimits.content);
    expect(parts.join('\n')).toBe(lines.join('\n'));
  });

  it('cuts a line longer than a whole message', () => {
    const parts = splitContent(`head\n${'x'.repeat(4_500)}`);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(discordLimits.content);
    expect(parts.join('').replaceAll('\n', '')).toBe(`head${'x'.repeat(4_500)}`);
  });

  it('closes a code block it cuts and opens it again in the next part', () => {
    const passages = Array.from({ length: 40 }, (_, index) => ({
      before: `old ${index} `.padEnd(30, 'o'),
      after: `new ${index} `.padEnd(30, 'n'),
    }));
    const parts = splitContent(`**Header**\n${diffBlock(passages)}\nafter`, 500);
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(500);
      expect(part.split('```').length % 2).toBe(1);
    }
    expect(parts[1]!.startsWith('```diff\n')).toBe(true);
    expect(parts.at(-1)!.endsWith('```\nafter')).toBe(true);
  });

  it('starts a new part rather than add a line to a full one', () => {
    expect(splitContent(`${'x'.repeat(2_000)}\n\n\n\nnext`).map((part) => part.length)).toEqual([
      2_000, 7,
    ]);
    const diff = diffBlock([
      { before: 'y'.repeat(1_986), after: '' },
      { before: '', after: 'z' },
      { before: '', after: 'w' },
    ]);
    for (const part of splitContent(diff)) {
      expect(part.length).toBeLessThanOrEqual(discordLimits.content);
    }
  });

  it('never posts a code block with nothing in it', () => {
    const parts = splitContent(`\`\`\`diff\n${'a\n'.repeat(1_200)}\`\`\``);
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(discordLimits.content);
      expect(part).toMatch(/^```diff\na\n[^]*a\n```$/);
    }
    expect(splitContent('```diff\n\n```')).toEqual([]);
  });

  it('never cuts an emoji in half', () => {
    const parts = splitContent(`a${'😀'.repeat(1_500)}`);
    expect(parts.map((part) => part.length)).toEqual([1_999, 1_002]);
    for (const part of parts) expect(part).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
  });

  it('sees a fence only at the start of a line, so the caller escapes backticks elsewhere', () => {
    const unescaped = splitContent(`intro \`\`\`js\n${'b'.repeat(3_000)}`);
    expect(unescaped[1]!.startsWith('```')).toBe(false);
    const escaped = splitContent(`intro ${escapeCode('```js')}\n${'b'.repeat(3_000)}`);
    for (const part of escaped) expect(part).not.toContain('``');
  });

  it('keeps every part within the limit, whatever the text', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)]!;
    const line = () =>
      pick([
        () => '',
        () => '```diff',
        () => '```',
        () => '  ```js',
        () => '😀'.repeat(Math.floor(random() * 1_200)),
        () => 'w'.repeat(Math.floor(random() * 40)),
        () => 'v'.repeat(Math.floor(random() * 3_000)),
        () => `+ ${'p'.repeat(Math.floor(random() * 2_010))}`,
      ])();
    const visible = (text: string) =>
      text
        .split('\n')
        .filter((each) => !each.trimStart().startsWith('```'))
        .join('')
        .replace(/\s/g, '');

    for (let round = 0; round < 400; round++) {
      const max = pick([discordLimits.content, 40 + Math.floor(random() * 500)]);
      const text = Array.from({ length: Math.floor(random() * 60) }, line).join('\n');
      const parts = splitContent(text, max);
      for (const part of parts) {
        expect(part.length).toBeLessThanOrEqual(max);
        expect(
          part.split('\n').filter((each) => each.trimStart().startsWith('```')).length % 2
        ).toBe(0);
        expect(part).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
      }
      expect(visible(parts.join('\n'))).toBe(visible(text));
    }
  });
});

describe('discordPayloads', () => {
  it('mentions no one', () => {
    expect(discordPayloads({ content: 'hello' })).toEqual([
      { content: 'hello', allowed_mentions: { parse: [] } },
    ]);
  });

  it('puts the embeds after the last part of the content', () => {
    const payloads = discordPayloads({
      content: 'x'.repeat(2_500),
      embeds: [{ title: 'A change' }],
    });
    expect(payloads).toHaveLength(2);
    expect(payloads[0]!.embeds).toBeUndefined();
    expect(payloads[1]!.embeds).toEqual([{ title: 'A change' }]);
  });

  it('keeps every embed within what Discord takes', () => {
    const [payload] = discordPayloads({
      embeds: [
        {
          title: 't'.repeat(300),
          description: 'd'.repeat(5_000),
          fields: [
            { name: 'Amending act', value: '' },
            { name: 'Long', value: 'v'.repeat(2_000), inline: true },
          ],
        },
      ],
    });
    const [embed] = payload!.embeds!;
    expect(embed!.title).toHaveLength(discordLimits.embedTitle);
    expect(embed!.description).toHaveLength(discordLimits.embedDescription);
    expect(embed!.fields).toEqual([
      { name: 'Amending act', value: '—' },
      { name: 'Long', value: `${'v'.repeat(1_023)}…`, inline: true },
    ]);
  });

  it('spreads embeds over several posts past ten or 6,000 characters', () => {
    const many = discordPayloads({
      embeds: Array.from({ length: 12 }, (_, index) => ({ title: `${index}` })),
    });
    expect(many.map((payload) => payload.embeds!.length)).toEqual([10, 2]);
    const large = discordPayloads({
      embeds: Array.from({ length: 3 }, () => ({ description: 'd'.repeat(4_000) })),
    });
    expect(large.map((payload) => payload.embeds!.length)).toEqual([1, 1, 1]);
  });
});

describe('discordWebhook', () => {
  it('skips silently without a webhook', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const sender = discordWebhook(' ', { fetcher });
    expect(sender.enabled).toBe(false);
    expect(await sender.send({ content: 'hello' })).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('posts each part of a long message, in order', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => posted());
    const sender = discordWebhook(webhook, { fetcher });
    expect(sender.enabled).toBe(true);
    expect(
      await sender.send({ content: `${'a'.repeat(1_500)}\n${'b'.repeat(1_500)}`, embeds: [{}] })
    ).toBe(true);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([webhook, webhook]);
    expect(bodies(fetcher)).toEqual([
      { content: 'a'.repeat(1_500), allowed_mentions: { parse: [] } },
      { content: 'b'.repeat(1_500), embeds: [{}], allowed_mentions: { parse: [] } },
    ]);
  });

  it('waits once when Discord asks it to, then posts again', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { message: 'You are being rate limited.', retry_after: 0.01 },
          { status: 429 }
        )
      )
      .mockResolvedValueOnce(posted());
    expect(await discordWebhook(webhook, { fetcher }).send({ content: 'hello' })).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('drops a post Discord holds back too long', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 429, headers: { 'Retry-After': '60' } })
    );
    expect(await discordWebhook(webhook, { fetcher }).send({ content: 'hello' })).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never throws: a refused or failed post is logged and the rest dropped', async () => {
    const refused = vi.fn<typeof fetch>(async () => new Response('bad', { status: 400 }));
    const long = { content: `${'a'.repeat(1_500)}\n${'b'.repeat(1_500)}` };
    expect(await discordWebhook(webhook, { fetcher: refused, what: 'An alert' }).send(long)).toBe(
      false
    );
    expect(refused).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenLastCalledWith(
      'An alert was not posted: Discord answered 400.'
    );

    const down = discordWebhook(webhook, {
      fetcher: async () => {
        throw new TypeError('fetch failed');
      },
    });
    expect(await down.send({ content: 'hello' })).toBe(false);
    expect(console.error).toHaveBeenLastCalledWith('A message was not posted: fetch failed.');
  });
});
