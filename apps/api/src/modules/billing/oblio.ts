import { ApiError } from '../../lib/errors';

const baseUrl = 'https://www.oblio.eu/api';

export type OblioConfig = {
  clientId: string;
  clientSecret: string;
  // Needed only when the account holds more than one company.
  sellerCif?: string;
};

type Session = {
  token?: { value: string; expiresAt: number };
  sellerCif?: string;
};

export type OblioSessions = Map<string, Session>;

// A Worker isolate serves many requests; a token lives an hour, and logging in counts
// against the rate limit.
const sharedSessions: OblioSessions = new Map();

export type OblioDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  sessions?: OblioSessions;
};

export type OblioDocumentKind = 'invoice' | 'proforma';

export type OblioClientDetails = {
  name: string;
  cif?: string;
  rc?: string;
  address?: string;
  state?: string;
  city?: string;
  country?: string;
  email?: string;
  vatPayer: 0 | 1;
  save: 0 | 1;
  autocomplete: 0 | 1;
};

export type OblioProduct = {
  name: string;
  description?: string;
  // In the document's currency, before VAT when vatIncluded is 0.
  price: number;
  measuringUnit: string;
  currency: string;
  vatName: string;
  vatPercentage: number;
  vatIncluded: 0 | 1;
  quantity: number;
  productType: 'Serviciu';
};

export type OblioCollect = {
  type: 'Card';
  documentNumber: string;
  value: number;
};

export type OblioProformaPayload = {
  client: OblioClientDetails;
  seriesName: string;
  language: 'RO';
  currency: string;
  products: OblioProduct[];
  mentions?: string;
  internalNote?: string;
  sendEmail: 0 | 1;
  idempotencyKey: string;
};

export type OblioInvoicePayload = OblioProformaPayload & {
  collect?: OblioCollect;
  // Sends the invoice to e-Factura when "Trimite automat e-Factura în SPV" is on in Oblio.
  spvExtern?: 0 | 1;
};

export type OblioStornoPayload = {
  seriesName: string;
  referenceDocument: { type: 'Factura'; seriesName: string; number: string; refund: 0 | 1 };
  sendEmail: 0 | 1;
  spvExtern?: 0 | 1;
  idempotencyKey: string;
};

export type OblioDocumentRequest =
  | { kind: 'invoice'; payload: OblioInvoicePayload }
  | { kind: 'proforma'; payload: OblioProformaPayload };

export type OblioDocument = { seriesName: string; number: string; link: string };

export type OblioCompany = { cif: string; company: string };

export type OblioSeries = { type: string; name: string; next: string; default: boolean };

type Envelope<T> = { status?: number; statusMessage?: string; data?: T };

export const loginRefusedMessage =
  'Oblio refused the login. Its API secret changes whenever the Oblio password is reset: ' +
  'copy the new one from Oblio (Setări → Date cont) into the GitHub secret OBLIO_CLIENT_SECRET ' +
  'of both environments.';

const unreachable = (detail: string) =>
  new ApiError(
    'service_unavailable',
    `Oblio could not be reached: ${detail}`,
    undefined,
    'oblio_unavailable'
  );

const refused = (status: number, message: string | undefined) =>
  new ApiError(
    status >= 500 || status === 429 ? 'service_unavailable' : 'unprocessable',
    `Oblio answered ${status}: ${message || 'no message'}`,
    undefined,
    status >= 500 || status === 429 ? 'oblio_unavailable' : 'oblio_refused'
  );

const loginRefused = (message: string | undefined) =>
  new ApiError(
    'service_unavailable',
    message ? `${loginRefusedMessage} Oblio said: ${message}` : loginRefusedMessage,
    undefined,
    'oblio_login_refused'
  );

async function readEnvelope<T>(response: Response): Promise<Envelope<T>> {
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    return {};
  }
}

function retryDelayMs(response: Response) {
  const seconds = Number(response.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 30) * 1000 : 2_000;
}

export function createOblioClient(config: OblioConfig, deps: OblioDeps = {}) {
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const sessions = deps.sessions ?? sharedSessions;
  const sessionKey = `${config.clientId}\n${config.clientSecret}`;
  const session = sessions.get(sessionKey) ?? {};
  sessions.set(sessionKey, session);

  async function send(url: string, init: RequestInit) {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetcher(url, init);
      } catch (error) {
        throw unreachable(error instanceof Error ? error.message : String(error));
      }
      if (response.status !== 429 || attempt > 0) return response;
      await sleep(retryDelayMs(response));
    }
  }

  async function login() {
    const response = await send(`${baseUrl}/authorize/token`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });
    const body = (await readEnvelope<never>(response)) as Envelope<never> & {
      access_token?: string;
      expires_in?: string | number;
    };
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw loginRefused(body.statusMessage);
    }
    if (!response.ok || !body.access_token) throw refused(response.status, body.statusMessage);
    const lifetimeSeconds = Number(body.expires_in) || 3600;
    session.token = {
      value: body.access_token,
      expiresAt: now() + (lifetimeSeconds - 60) * 1000,
    };
    return session.token.value;
  }

  async function token() {
    if (session.token && session.token.expiresAt > now()) return session.token.value;
    return login();
  }

  async function call<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    params: Record<string, string> | object
  ): Promise<T> {
    const request = (bearer: string): [string, RequestInit] => {
      const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` };
      if (method === 'GET') {
        const query = new URLSearchParams(params as Record<string, string>).toString();
        return [`${baseUrl}${path}?${query}`, { method, headers }];
      }
      if (method === 'PUT') {
        return [
          `${baseUrl}${path}`,
          { method, headers, body: new URLSearchParams(params as Record<string, string>) },
        ];
      }
      headers['Content-Type'] = 'application/json';
      return [`${baseUrl}${path}`, { method, headers, body: JSON.stringify(params) }];
    };

    let response = await send(...request(await token()));
    if (response.status === 401) {
      session.token = undefined;
      response = await send(...request(await login()));
    }
    const body = await readEnvelope<T>(response);
    if (!response.ok || body.data === undefined) {
      throw refused(response.status, body.statusMessage);
    }
    return body.data;
  }

  async function companies() {
    return call<OblioCompany[]>('GET', '/nomenclature/companies', {});
  }

  async function sellerCif() {
    if (config.sellerCif) return config.sellerCif;
    if (session.sellerCif) return session.sellerCif;
    const list = await companies();
    if (list.length !== 1) {
      const names = list.map((company) => `${company.company} (${company.cif})`).join(', ');
      throw new ApiError(
        'service_unavailable',
        list.length === 0
          ? 'The Oblio account holds no company to invoice from.'
          : `The Oblio account holds several companies: ${names}. Configure the seller's CIF.`,
        undefined,
        'oblio_seller_unknown'
      );
    }
    session.sellerCif = list[0]!.cif;
    return session.sellerCif;
  }

  const create = async (kind: OblioDocumentKind, payload: object) =>
    call<OblioDocument>('POST', `/docs/${kind}`, { cif: await sellerCif(), ...payload });

  return {
    companies,
    sellerCif,
    series: async () =>
      call<OblioSeries[]>('GET', '/nomenclature/series', { cif: await sellerCif() }),
    createInvoice: (payload: OblioInvoicePayload) => create('invoice', payload),
    createProforma: (payload: OblioProformaPayload) => create('proforma', payload),
    storno: (payload: OblioStornoPayload) => create('invoice', payload),
    issue: (request: OblioDocumentRequest) => create(request.kind, request.payload),
    getDocument: async (kind: OblioDocumentKind, seriesName: string, number: string) =>
      call<OblioDocument>('GET', `/docs/${kind}`, { cif: await sellerCif(), seriesName, number }),
    cancel: async (kind: OblioDocumentKind, seriesName: string, number: string) =>
      call<OblioDocument>('PUT', `/docs/${kind}/cancel`, {
        cif: await sellerCif(),
        seriesName,
        number,
      }),
  };
}

export type OblioClient = ReturnType<typeof createOblioClient>;
