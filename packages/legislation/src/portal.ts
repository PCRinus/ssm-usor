export const portalOrigin = 'https://legislatie.just.ro';
export const portalUserAgent =
  'ssm-usor-legislation-check/1.0 (+https://github.com/PCRinus/ssm-usor)';
export const portalPauseMs = 2_000;

// Wall time, not CPU time: a Worker's cron handler may wait minutes in all, while its CPU limit
// counts only the parsing.
export const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type PortalStatus = 'in_force' | 'repealed';

export type PortalAction = {
  section: string;
  operation: string;
  act: string;
  actPortalId: number | null;
  // The date in the act's own name: when it was adopted, not when it was published.
  actDate: string | null;
};

export type PortalPage = {
  title: string;
  // ISO dates, newest first; empty for an act never consolidated.
  consolidations: string[];
};

export type PortalAct = {
  portalId: number;
  title: string;
  status: PortalStatus;
  consolidations: string[];
  newestConsolidation: string | null;
  amendingActs: string[];
};

export class PortalError extends Error {
  override name = 'PortalError';
}

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function text(html: string) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith('#x') || name.startsWith('#X'))
        return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
      return entities[name.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(day: string, month: string, year: string) {
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

export function parseActPage(html: string, portalId: number): PortalPage {
  // An act never amended has no "Forme act" section; its "Fișă act" still marks an act page.
  if (!/<span>\s*Forme act\s*<\/span>/.test(html) && !html.includes('id="label_fisaact"')) {
    throw new PortalError(`Page ${portalId} has neither a "Forme act" nor a "Fișă act" section.`);
  }
  const heading = html.match(
    /<span class="S_DEN">([^<]*)<\/span>(?:\s*<span class="S_HDR">([\s\S]*?)<\/span>)?/
  );
  const title = heading ? text(`${heading[1]} ${heading[2] ?? ''}`) : '';
  if (!title) throw new PortalError(`Page ${portalId} has no act heading (S_DEN).`);

  const dates = new Set<string>();
  for (const match of html.matchAll(/title='Consolidarea din (\d{2})\.(\d{2})\.(\d{4})'/g)) {
    const date = isoDate(match[1]!, match[2]!, match[3]!);
    if (!date) throw new PortalError(`Page ${portalId} lists an impossible date: ${match[0]}.`);
    dates.add(date);
  }
  if (dates.size === 0 && html.includes('id="Formaconsolidata"')) {
    throw new PortalError(
      `Page ${portalId} offers a consolidated form but lists no consolidation dates.`
    );
  }
  return { title, consolidations: [...dates].sort().reverse() };
}

export function parseActions(body: unknown, portalId: number): PortalAction[] {
  const table = typeof body === 'object' && body !== null && 'acte' in body ? body.acte : undefined;
  if (typeof table !== 'string') {
    throw new PortalError(`The actions of act ${portalId} came without an "acte" table.`);
  }
  if (/Nu exista actiuni suferite/i.test(table)) return [];
  if (!table.includes('TIP OPERATIUNE')) {
    throw new PortalError(`The actions of act ${portalId} have no "TIP OPERATIUNE" column.`);
  }
  const actions: PortalAction[] = [];
  for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]!);
    if (cells.length !== 3 || /TIP OPERATIUNE/.test(row[1]!)) continue;
    const act = text(cells[2]!);
    const date = act.match(/(\d{2})\/(\d{2})\/(\d{4})$/);
    const link = cells[2]!.match(/DetaliiDocument\/(\d+)/);
    actions.push({
      section: text(cells[0]!),
      operation: text(cells[1]!),
      act,
      actPortalId: link ? Number(link[1]) : null,
      actDate: date ? isoDate(date[1]!, date[2]!, date[3]!) : null,
    });
  }
  if (actions.length === 0) {
    throw new PortalError(`The actions table of act ${portalId} has no rows that could be read.`);
  }
  return actions;
}

// The portal does not say which act produced a consolidated form; the acts adopted between
// the last two consolidations are the closest it comes.
export function describeAct(
  portalId: number,
  page: PortalPage,
  actions: PortalAction[]
): PortalAct {
  const repealed = actions.some(
    (action) => action.section === 'Actul' && /^ABROGAT (IMPLICIT )?DE$/.test(action.operation)
  );
  const [newest = null, previous = null] = page.consolidations;
  const amending = newest
    ? actions
        .filter(
          (action) =>
            action.actPortalId !== portalId &&
            action.operation !== 'INTRAT IN VIGOARE' &&
            action.actDate !== null &&
            action.actDate <= newest &&
            (previous === null || action.actDate > previous)
        )
        .sort((a, b) => (b.actDate ?? '').localeCompare(a.actDate ?? ''))
    : [];
  return {
    portalId,
    title: page.title,
    status: repealed ? 'repealed' : 'in_force',
    consolidations: page.consolidations,
    newestConsolidation: newest,
    amendingActs: [...new Set(amending.map((action) => action.act))],
  };
}

type PortalOptions = { fetch?: typeof fetch; pauseMs?: number };

async function request(url: string, init: RequestInit, fetchImpl: typeof fetch) {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: { 'User-Agent': portalUserAgent, ...init.headers },
      // The portal answers a missing page with a redirect to /Error.
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new PortalError(
      `${url} could not be fetched: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (response.status !== 200) {
    throw new PortalError(`${url} answered ${response.status}.`);
  }
  return response;
}

// The page alone never says that an act was repealed, and an annex's amendments are not on it;
// the "Acțiuni suferite" list behind the page's "Fișă act" carries both.
export async function fetchPortalAct(portalId: number, options: PortalOptions = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const pageUrl = `${portalOrigin}/Public/DetaliiDocument/${portalId}`;
  const page = parseActPage(await (await request(pageUrl, {}, fetchImpl)).text(), portalId);
  // A government site with no API: one request at a time, with a pause between them.
  await pause(options.pauseMs ?? portalPauseMs);
  const actionsUrl = `${portalOrigin}/Public/actiuniSuferite`;
  const response = await request(
    actionsUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ contor: String(portalId) }).toString(),
    },
    fetchImpl
  );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PortalError(`The actions of act ${portalId} were not JSON.`);
  }
  return describeAct(portalId, page, parseActions(body, portalId));
}
