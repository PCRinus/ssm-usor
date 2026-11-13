// Discord refuses a message past any of these, with a 400 that loses the whole message.
export const discordLimits = {
  content: 2_000,
  embeds: 10,
  embedTitle: 256,
  embedDescription: 4_096,
  embedFields: 25,
  fieldName: 256,
  fieldValue: 1_024,
  footer: 2_048,
  embedsTotal: 6_000,
} as const;

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  // 0xRRGGBB.
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

export type DiscordPayload = DiscordMessage & { allowed_mentions: { parse: [] } };

export interface DiscordWebhook {
  // False without a webhook, so that nothing is read only to be dropped.
  enabled: boolean;
  // Never throws: a post that fails is logged and dropped. True when every post went through.
  send(message: DiscordMessage): Promise<boolean>;
}

export interface DiscordWebhookOptions {
  fetcher?: typeof fetch;
  // Opens the log line of a post that failed: "An alert was not posted: …".
  what?: string;
  timeoutMs?: number;
  // The longest a rate-limited post waits, once, before it is dropped.
  maxRetryWaitMs?: number;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

// A cut between the two halves of an emoji would post a broken character.
function cutAt(text: string, at: number) {
  return at > 1 && isHighSurrogate(text.charCodeAt(at - 1)) ? at - 1 : at;
}

export function clip(text: string, max: number) {
  if (text.length <= max) return text;
  return max < 1 ? '' : `${text.slice(0, cutAt(text, max - 1))}…`;
}

// Angle brackets keep Discord from fetching a preview of the page, which may sit behind Access.
export const noPreview = (url: string) => `<${url}>`;

const fence = '```';
const closingFence = `\n${fence}`;

// Discord has no escape inside a code block: a zero-width space breaks every run of backticks,
// so a passage cannot close the block early.
export const escapeCode = (text: string) => text.replaceAll('`', '`​');

export function codeBlock(text: string, language = '') {
  return `${fence}${language}\n${escapeCode(text)}${closingFence}`;
}

export interface Passage {
  before: string;
  after: string;
}

export function diffBlock(passages: Passage[]) {
  const side = (text: string, mark: string) =>
    text === '' ? [] : text.split('\n').map((line) => `${mark} ${line}`);
  const lines = passages.flatMap((passage, index) => [
    ...(index > 0 ? [''] : []),
    ...side(passage.before, '-'),
    ...side(passage.after, '+'),
  ]);
  return codeBlock(lines.join('\n'), 'diff');
}

// A code block cut in two is closed and opened again with its language, so each part renders.
// A fence counts only at the start of a line: backticks anywhere else are the caller's to escape.
export function splitContent(text: string, max: number = discordLimits.content) {
  const parts: string[] = [];
  let lines: string[] = [];
  let length = 0;
  let open: string | null = null;

  const add = (line: string) => {
    length += (lines.length > 0 ? 1 : 0) + line.length;
    lines.push(line);
  };
  const flush = () => {
    parts.push(`${lines.join('\n')}${open ? closingFence : ''}`);
    lines = [];
    length = 0;
    if (open) add(open);
  };
  const fresh = () => lines.length === (open ? 1 : 0);

  for (let rest of text.split('\n')) {
    for (;;) {
      const isFence = rest.trimStart().startsWith(fence);
      const openAfter: string | null = isFence ? (open ? null : rest.trimStart()) : open;
      const room =
        max - length - (lines.length > 0 ? 1 : 0) - (openAfter ? closingFence.length : 0);
      if (rest.length <= room) {
        add(rest);
        open = openAfter;
        break;
      }
      if (!fresh()) {
        flush();
        continue;
      }
      // Only a fence line about as long as a whole part leaves a fresh part no room: that part
      // runs over rather than loop forever.
      const cut = cutAt(rest, Math.max(1, room));
      add(rest.slice(0, cut));
      rest = rest.slice(cut);
      flush();
    }
  }
  if (!fresh()) flush();
  return parts.filter(hasText);
}

const hasText = (part: string) =>
  part.split('\n').some((line) => line.trim() !== '' && !line.trimStart().startsWith(fence));

const fieldSize = (field: DiscordEmbedField) => field.name.length + field.value.length;

const embedSize = (embed: DiscordEmbed) =>
  (embed.title?.length ?? 0) +
  (embed.description?.length ?? 0) +
  (embed.footer?.text.length ?? 0) +
  (embed.fields ?? []).reduce((sum, field) => sum + fieldSize(field), 0);

function fitEmbed(embed: DiscordEmbed): DiscordEmbed {
  const fitted: DiscordEmbed = { ...embed };
  if (embed.title !== undefined) fitted.title = clip(embed.title, discordLimits.embedTitle);
  if (embed.footer) fitted.footer = { text: clip(embed.footer.text, discordLimits.footer) };
  let room = discordLimits.embedsTotal - embedSize({ title: fitted.title, footer: fitted.footer });
  if (embed.description !== undefined) {
    fitted.description = clip(embed.description, Math.min(discordLimits.embedDescription, room));
    room -= fitted.description.length;
  }
  if (embed.fields) {
    const fields: DiscordEmbedField[] = [];
    for (const field of embed.fields.slice(0, discordLimits.embedFields)) {
      // Discord refuses an empty name or value.
      const fit = {
        ...field,
        name: clip(field.name || '—', discordLimits.fieldName),
        value: clip(field.value || '—', discordLimits.fieldValue),
      };
      if (fieldSize(fit) > room) break;
      fields.push(fit);
      room -= fieldSize(fit);
    }
    fitted.fields = fields;
  }
  return fitted;
}

export function discordPayloads(message: DiscordMessage): DiscordPayload[] {
  const groups: DiscordEmbed[][] = [];
  for (const embed of (message.embeds ?? []).map(fitEmbed)) {
    const last = groups.at(-1);
    const size = (last ?? []).reduce((sum, each) => sum + embedSize(each), 0);
    if (
      last &&
      last.length < discordLimits.embeds &&
      size + embedSize(embed) <= discordLimits.embedsTotal
    ) {
      last.push(embed);
    } else {
      groups.push([embed]);
    }
  }
  const messages: DiscordMessage[] = splitContent(message.content ?? '').map((content) => ({
    content,
  }));
  const [first, ...others] = groups;
  const last = messages.at(-1);
  if (first && last) last.embeds = first;
  else if (first) messages.push({ embeds: first });
  messages.push(...others.map((embeds) => ({ embeds })));
  return messages.map((each) => ({ ...each, allowed_mentions: { parse: [] } }));
}

const secondsToWait = (value: unknown) => {
  const seconds = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1_000
    : null;
};

async function retryAfterMs(response: Response) {
  const fromHeader = secondsToWait(response.headers.get('Retry-After'));
  if (fromHeader !== null) {
    await response.body?.cancel().catch(() => {});
    return fromHeader;
  }
  try {
    const body: unknown = await response.json();
    return secondsToWait((body as { retry_after?: unknown } | null)?.retry_after);
  } catch {
    return null;
  }
}

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 200) : 'unknown error';

export function discordWebhook(
  url: string | undefined,
  {
    fetcher = (input, init) => fetch(input, init),
    what = 'A message',
    timeoutMs = 5_000,
    maxRetryWaitMs = 5_000,
  }: DiscordWebhookOptions = {}
): DiscordWebhook {
  const webhook = url?.trim();

  async function post(payload: DiscordPayload, retried = false): Promise<boolean> {
    try {
      const response = await fetcher(webhook!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429 && !retried) {
        const wait = await retryAfterMs(response);
        if (wait !== null && wait <= maxRetryWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, wait));
          return post(payload, true);
        }
      }
      if (!response.ok) {
        console.error(`${what} was not posted: Discord answered ${response.status}.`);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`${what} was not posted: ${reasonOf(error)}.`);
      return false;
    }
  }

  return {
    enabled: Boolean(webhook),
    async send(message) {
      if (!webhook) return false;
      const payloads = discordPayloads(message);
      for (const payload of payloads) {
        if (!(await post(payload))) return false;
      }
      return payloads.length > 0;
    },
  };
}
