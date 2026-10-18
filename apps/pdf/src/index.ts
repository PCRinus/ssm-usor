import { Container, getContainer } from '@cloudflare/containers';
import {
  type BeginSignatureOptions,
  type BeginSignatureResult,
  type PdfService,
  type SignatureValidation,
  signerOverHttp,
  type SignerService,
} from '@ssm-usor/contracts';
import { WorkerEntrypoint } from 'cloudflare:workers';

import { convertDocuments, convertDocx, convertForm, mergePdfs } from './convert';
import { postToSigner } from './sign';

type PdfEnv = {
  GOTENBERG: DurableObjectNamespace<Gotenberg>;
  SIGNER: DurableObjectNamespace<Signer>;
};

// Word to PDF needs a layout engine, in practice LibreOffice, which cannot run in a Worker
// (ADR 005), and a PAdES signature needs pyHanko (ADR 023). This Worker owns the containers that
// run them and offers their methods over a service binding, as apps/mail does for email. It has
// no routes.

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

export class Signer extends Container {
  defaultPort = 3301;
  pingEndpoint = 'signer/health';
  // A signature's two phases must reach the instance that holds its session, which it keeps for
  // the same ten minutes.
  sleepAfter = '10m';
  // Nothing is fetched while signing or validating: no revocation lists, no timestamps.
  enableInternet = false;
}

export class Pdf extends WorkerEntrypoint<PdfEnv> implements PdfService, SignerService {
  async convertDocx(docx: ArrayBuffer): Promise<ArrayBuffer> {
    const container = getContainer(this.env.GOTENBERG);
    // `fetch` starts the container when it sleeps and waits for its port.
    return convertDocx((request) => container.fetch(request), docx);
  }

  async convertDocuments(files: ArrayBuffer[]): Promise<ArrayBuffer> {
    const container = getContainer(this.env.GOTENBERG);
    return convertDocuments((request) => container.fetch(request), files);
  }

  async convertForm(docx: ArrayBuffer): Promise<ArrayBuffer> {
    const container = getContainer(this.env.GOTENBERG);
    return convertForm((request) => container.fetch(request), docx);
  }

  async mergePdfs(files: ArrayBuffer[]): Promise<ArrayBuffer> {
    const container = getContainer(this.env.GOTENBERG);
    return mergePdfs((request) => container.fetch(request), files);
  }

  private signer(): SignerService {
    const container = getContainer(this.env.SIGNER);
    return signerOverHttp(postToSigner((request) => container.fetch(request)));
  }

  async prepareSheet(pdf: ArrayBuffer, signatureFields: string[]): Promise<ArrayBuffer> {
    return this.signer().prepareSheet(pdf, signatureFields);
  }

  async fillFields(pdf: ArrayBuffer, values: Record<string, string>): Promise<ArrayBuffer> {
    return this.signer().fillFields(pdf, values);
  }

  async beginSignature(
    pdf: ArrayBuffer,
    options: BeginSignatureOptions
  ): Promise<BeginSignatureResult> {
    return this.signer().beginSignature(pdf, options);
  }

  async finishSignature(
    prepared: ArrayBuffer,
    sessionToken: string,
    signature: ArrayBuffer
  ): Promise<ArrayBuffer> {
    return this.signer().finishSignature(prepared, sessionToken, signature);
  }

  async validate(pdf: ArrayBuffer, trustRootsPem?: string[]): Promise<SignatureValidation[]> {
    return this.signer().validate(pdf, trustRootsPem);
  }

  async stampPages(pdf: ArrayBuffer, text: string): Promise<ArrayBuffer> {
    return this.signer().stampPages(pdf, text);
  }
}

export default {
  fetch: () => new Response(null, { status: 404 }),
} satisfies ExportedHandler<PdfEnv>;
