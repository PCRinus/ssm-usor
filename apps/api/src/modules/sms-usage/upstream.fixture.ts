type Row = Record<string, unknown>;

export type SmsUpstream = {
  subscriptions: Row[];
  claims: Row[];
  updates: Row[];
  deletes: string[];
  refusal: string | null;
  overage: boolean;
  handle(url: URL, init?: RequestInit): Response | null;
};

export function createSmsUpstream(overrides: Partial<SmsUpstream> = {}): SmsUpstream {
  const upstream: SmsUpstream = {
    subscriptions: [],
    claims: [],
    updates: [],
    deletes: [],
    refusal: null,
    overage: false,
    handle(url, init) {
      const method = init?.method ?? 'GET';
      if (url.pathname === '/rest/v1/subscriptions' && method === 'GET') {
        const one = new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object');
        const wanted =
          url.searchParams.get('organization_id')?.replace(/^(eq|in)\./, '') ?? undefined;
        const rows = upstream.subscriptions.filter(
          (row) => !wanted || wanted.includes(String(row.organization_id))
        );
        return Response.json(one ? (rows[0] ?? null) : rows);
      }
      if (url.pathname === '/rest/v1/rpc/claim_sms_send') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Row;
        upstream.claims.push(body);
        return Response.json(
          upstream.refusal
            ? { id: null, refusal: upstream.refusal, overage: false }
            : { id: `sms-${upstream.claims.length}`, refusal: null, overage: upstream.overage }
        );
      }
      if (url.pathname === '/rest/v1/sms_sends' && method === 'PATCH') {
        upstream.updates.push(JSON.parse(String(init?.body ?? '{}')) as Row);
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/rest/v1/sms_sends' && method === 'DELETE') {
        upstream.deletes.push(url.searchParams.get('id') ?? '');
        return new Response(null, { status: 204 });
      }
      return null;
    },
    ...overrides,
  };
  return upstream;
}

const day = 86_400_000;

export const plainTrial = (organizationId: string, overrides: Row = {}): Row => ({
  organization_id: organizationId,
  plan: 'profesional',
  status: 'trialing',
  created_at: new Date(Date.now() - 5 * day).toISOString(),
  trial_ends_at: new Date(Date.now() + 25 * day).toISOString(),
  stripe_subscription_id: null,
  stripe_customer_id: null,
  tester_allowances: false,
  first_paid_at: null,
  billing_anchor_at: null,
  current_period_end: null,
  sms_cap_factor: 3,
  ...overrides,
});
