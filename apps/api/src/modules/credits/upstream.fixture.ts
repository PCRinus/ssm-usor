// The ledger as the import routes meet it when a test says nothing of credits: no subscription,
// so nothing limits them, and every charge goes through.
export function creditsUpstream(call: { method: string; url: URL; body: unknown }) {
  switch (call.url.pathname) {
    case '/rest/v1/subscriptions':
      return Response.json([]);
    case '/rest/v1/rpc/charge_credits': {
      const { p_credits } = call.body as { p_credits: number };
      return Response.json({ charged: p_credits, refused: false, balance: null, gift_left: 0 });
    }
    case '/rest/v1/credit_entries':
      return call.method === 'GET' ? Response.json([]) : new Response(null, { status: 204 });
  }
  return undefined;
}
