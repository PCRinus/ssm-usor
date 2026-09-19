import { Container, getContainer } from '@cloudflare/containers';
import type { PdfService } from '@ssm-usor/contracts';
import { WorkerEntrypoint } from 'cloudflare:workers';

import { convertDocx } from './convert';

type PdfEnv = { GOTENBERG: DurableObjectNamespace<Gotenberg> };

// Word to PDF needs a layout engine, in practice LibreOffice, which cannot run in a Worker
// (ADR 005). This Worker owns the container that runs it and offers one method over a
// service binding, as apps/mail does for email. It has no routes.

export class Gotenberg extends Container {
  defaultPort = 3000;
  // Readiness is a request that gets an answer; Gotenberg has a route made for it.
  pingEndpoint = 'gotenberg/health';
  // Paid for while awake. Issuing comes in bursts, a client's set at a time, so it stays up
  // between documents and sleeps soon after.
  sleepAfter = '10m';
  // It converts what it is handed and has no reason to call anyone.
  enableInternet = false;
}

export class Pdf extends WorkerEntrypoint<PdfEnv> implements PdfService {
  async convertDocx(docx: ArrayBuffer): Promise<ArrayBuffer> {
    const container = getContainer(this.env.GOTENBERG);
    // `fetch` starts the container when it sleeps and waits for its port.
    return convertDocx((request) => container.fetch(request), docx);
  }
}

export default {
  fetch: () => new Response(null, { status: 404 }),
} satisfies ExportedHandler<PdfEnv>;
