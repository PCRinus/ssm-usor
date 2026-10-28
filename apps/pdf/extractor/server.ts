import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  dpiFor,
  imageKind,
  isJpeg,
  isPasswordProtectedWord,
  isPdf,
  isWordLike,
  longestEdgePixels,
  parsePdfInfo,
  splitPages,
} from './files.ts';
import { Abandoned, Busy, gate, type Refusal, Refused, run } from './processes.ts';

const port = Number(process.env.PORT ?? 3302);
const fileLimit = 20 * 1024 * 1024;
// Twice what an import reads as scans, and past the text the model reads for a whole client; a
// small file can hold thousands of pages that share one content stream.
const pdfPageLimit = 300;
const libreOfficeProfile = process.env.LIBREOFFICE_PROFILE ?? join(tmpdir(), 'libreoffice');

const refusalStatus: Record<Refusal, number> = {
  too_large: 413,
  unsupported: 415,
  corrupt: 422,
  password_protected: 422,
  timeout: 422,
  page_out_of_range: 400,
};

async function inTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'extract-'));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// One LibreOffice at a time: two instances cannot share a profile, and a profile per request
// would add its first-start cost to every conversion.
const libreOffice = gate(1, 2);
// Half a CPU between them: more at once would only turn each into a timeout.
const tools = gate(2, 6);

const libreOfficeArgs = [
  `-env:UserInstallation=file://${libreOfficeProfile}`,
  '--headless',
  '--norestore',
  '--nologo',
  '--nodefault',
  '--nolockcheck',
];

async function docToDocx(doc: Uint8Array, signal: AbortSignal): Promise<Buffer> {
  if (!isWordLike(doc)) throw new Refused('unsupported', 'not a Word, RTF or HTML file');
  return inTempDir(async (dir) => {
    await writeFile(join(dir, 'document.doc'), doc);
    const result = await run(
      'soffice',
      [
        ...libreOfficeArgs,
        '--convert-to',
        'docx:MS Word 2007 XML',
        '--outdir',
        dir,
        join(dir, 'document.doc'),
      ],
      // Killed, soffice leaves its lu*.tmp folders behind; here they go with the request's folder.
      { timeoutMs: 120_000, signal, env: { ...process.env, TMPDIR: dir } }
    );
    try {
      return await readFile(join(dir, 'document.docx'));
    } catch {
      // LibreOffice says "source file could not be loaded" and still exits 0.
      if (isPasswordProtectedWord(doc)) throw new Refused('password_protected');
      throw new Refused('corrupt', result.stderr.trim().slice(0, 300));
    }
  });
}

// `-l` alone: pdfinfo stops quietly at the last page, but takes a `-f` past it as an error.
async function pdfInfo(path: string, signal: AbortSignal, sizesUpTo?: number) {
  const range = sizesUpTo ? ['-l', String(sizesUpTo)] : [];
  const result = await run('pdfinfo', [...range, path], { timeoutMs: 30_000, signal });
  if (result.code !== 0) {
    if (/incorrect password/i.test(result.stderr)) throw new Refused('password_protected');
    throw new Refused('corrupt', result.stderr.trim().slice(0, 300));
  }
  return parsePdfInfo(result.stdout.toString());
}

async function pdfText(pdf: Uint8Array, signal: AbortSignal) {
  if (!isPdf(pdf)) throw new Refused('unsupported', 'not a PDF');
  return inTempDir(async (dir) => {
    const path = join(dir, 'document.pdf');
    await writeFile(path, pdf);
    const { pageCount } = await pdfInfo(path, signal);
    if (pageCount > pdfPageLimit) throw new Refused('too_large', `the PDF has ${pageCount} pages`);
    if (pageCount === 0) return { pageCount, pages: [] };
    const result = await run(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', '-f', '1', '-l', String(pageCount), path, '-'],
      { timeoutMs: 120_000, signal }
    );
    if (result.code !== 0) throw new Refused('corrupt', result.stderr.trim().slice(0, 300));
    return { pageCount, pages: splitPages(result.stdout.toString('utf8'), pageCount) };
  });
}

async function pdfPageImage(pdf: Uint8Array, page: number, signal: AbortSignal): Promise<Buffer> {
  if (!isPdf(pdf)) throw new Refused('unsupported', 'not a PDF');
  return inTempDir(async (dir) => {
    const path = join(dir, 'document.pdf');
    await writeFile(path, pdf);
    const { pageCount, pageSizes } = await pdfInfo(path, signal, page);
    if (page > pageCount) throw new Refused('page_out_of_range', `the PDF has ${pageCount} pages`);
    const result = await run(
      'pdftoppm',
      [
        '-jpeg',
        '-jpegopt',
        'quality=85',
        '-r',
        String(dpiFor(pageSizes.get(page))),
        '-f',
        String(page),
        '-l',
        String(page),
        '-singlefile',
        path,
        join(dir, 'page'),
      ],
      { timeoutMs: 60_000, signal }
    );
    if (result.code !== 0) throw new Refused('corrupt', result.stderr.trim().slice(0, 300));
    return readFile(join(dir, 'page.jpg'));
  });
}

// Below Debian's policy.xml (a gigabyte of memory, 32,000 pixels a side), and set here so a later
// base image cannot raise them. A 48-megapixel photograph fits.
const imageLimits = [
  ['memory', '512MiB'],
  ['map', '1GiB'],
  ['area', '128MP'],
  ['disk', '1GiB'],
  ['width', '20KP'],
  ['height', '20KP'],
  ['time', '50'],
  // On half a CPU, OpenMP's threads only wait on each other: a resize took 3 to 13 s, one thread 2.6.
  ['thread', '1'],
].flatMap(([resource, value]) => ['-limit', resource!, value!]);

async function imageToJpeg(image: Uint8Array, signal: AbortSignal): Promise<Buffer> {
  const kind = imageKind(image);
  if (!kind) throw new Refused('unsupported', 'not a HEIC, JPEG or PNG image');
  return inTempDir(async (dir) => {
    const input = join(dir, `image.${kind}`);
    const output = join(dir, 'image.jpg');
    await writeFile(input, image);
    // The coder named in front of the path, so ImageMagick never guesses another from the bytes.
    // Stripping drops the camera's metadata, its location included, once the turn is applied.
    const result = await run(
      'magick',
      [
        ...imageLimits,
        `${kind}:${input}[0]`,
        '-auto-orient',
        '-resize',
        `${longestEdgePixels}x${longestEdgePixels}>`,
        '-background',
        'white',
        '-alpha',
        'remove',
        '-alpha',
        'off',
        '-strip',
        '-quality',
        '85',
        `jpeg:${output}`,
      ],
      { timeoutMs: 60_000, signal }
    );
    const detail = result.stderr.trim().slice(0, 300);
    // Past its time limit ImageMagick still exits 0, with what it had drawn by then.
    if (/time limit exceeded/i.test(result.stderr)) throw new Refused('timeout', detail);
    if (/exceeds user limit|resources exhausted/i.test(result.stderr)) {
      throw new Refused('too_large', detail);
    }
    if (result.code !== 0) throw new Refused('corrupt', detail);
    const jpeg = await readFile(output);
    if (!isJpeg(jpeg)) throw new Error('ImageMagick wrote something other than a JPEG');
    return jpeg;
  });
}

async function readBody(request: IncomingMessage): Promise<Uint8Array> {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > fileLimit) throw new Refused('too_large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > fileLimit) throw new Refused('too_large');
    chunks.push(chunk);
  }
  if (size === 0) throw new Refused('unsupported', 'empty body');
  return new Uint8Array(Buffer.concat(chunks));
}

function send(response: ServerResponse, status: number, type: string, body: Buffer | string) {
  response.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

const sendJson = (response: ServerResponse, status: number, body: object) =>
  send(response, status, 'application/json', JSON.stringify(body));

function pageOf(url: URL): number {
  const page = Number(url.searchParams.get('page'));
  if (!Number.isInteger(page) || page < 1) {
    throw new Refused('page_out_of_range', 'page must be a whole number from 1');
  }
  return page;
}

async function handle(request: IncomingMessage, response: ServerResponse, signal: AbortSignal) {
  const url = new URL(request.url ?? '/', 'http://extractor');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method !== 'POST') return sendJson(response, 404, { error: 'not_found' });
  switch (url.pathname) {
    case '/doc-to-docx': {
      const doc = await readBody(request);
      const docx = await libreOffice(signal, () => docToDocx(doc, signal));
      return send(
        response,
        200,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        docx
      );
    }
    case '/pdf-text': {
      const pdf = await readBody(request);
      return sendJson(response, 200, await tools(signal, () => pdfText(pdf, signal)));
    }
    case '/pdf-page-image': {
      const page = pageOf(url);
      const pdf = await readBody(request);
      const jpeg = await tools(signal, () => pdfPageImage(pdf, page, signal));
      return send(response, 200, 'image/jpeg', jpeg);
    }
    case '/heic-to-jpeg': {
      const image = await readBody(request);
      return send(
        response,
        200,
        'image/jpeg',
        await tools(signal, () => imageToJpeg(image, signal))
      );
    }
    default:
      return sendJson(response, 404, { error: 'not_found' });
  }
}

const server = createServer((request, response) => {
  const started = Date.now();
  // The Worker gives up on a request after three minutes; what it no longer waits for stops here.
  const abandoned = new AbortController();
  response.on('close', () => {
    if (!response.writableFinished) abandoned.abort();
  });
  handle(request, response, abandoned.signal).catch((error: unknown) => {
    const refused = error instanceof Refused;
    const status = refused ? refusalStatus[error.reason] : error instanceof Busy ? 503 : 500;
    if (error instanceof Abandoned || abandoned.signal.aborted) {
      console.error(
        JSON.stringify({
          event: 'extractor_abandoned',
          route: request.url,
          ms: Date.now() - started,
        })
      );
      return response.destroy();
    }
    console.error(
      JSON.stringify({
        event: refused
          ? 'extractor_refused'
          : status === 503
            ? 'extractor_busy'
            : 'extractor_failed',
        route: request.url,
        status,
        reason: refused ? error.reason : undefined,
        detail: refused ? error.detail : String(error).slice(0, 300),
        ms: Date.now() - started,
      })
    );
    if (response.headersSent) return response.destroy();
    // A refusal can come before the body is read; the connection is not reused after it.
    response.setHeader('connection', 'close');
    sendJson(
      response,
      status,
      refused
        ? { error: error.reason, detail: error.detail }
        : { error: status === 503 ? 'busy' : 'failed' }
    );
  });
});

server.requestTimeout = 300_000;
server.listen(port, () => console.log(JSON.stringify({ event: 'extractor_listening', port })));

process.on('SIGTERM', () => server.close(() => process.exit(0)));
