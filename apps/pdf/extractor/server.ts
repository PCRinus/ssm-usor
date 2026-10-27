import { spawn } from 'node:child_process';
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
  parsePdfInfo,
  splitPages,
} from './files.ts';

const port = Number(process.env.PORT ?? 3302);
const fileLimit = 20 * 1024 * 1024;
const libreOfficeProfile = process.env.LIBREOFFICE_PROFILE ?? join(tmpdir(), 'libreoffice');

type Refusal =
  'too_large' | 'unsupported' | 'corrupt' | 'password_protected' | 'timeout' | 'page_out_of_range';

const refusalStatus: Record<Refusal, number> = {
  too_large: 413,
  unsupported: 415,
  corrupt: 422,
  password_protected: 422,
  timeout: 422,
  page_out_of_range: 400,
};

class Refused extends Error {
  readonly reason: Refusal;
  readonly detail: string;
  constructor(reason: Refusal, detail = '') {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

type Run = { code: number | null; stdout: Buffer; stderr: string };

function run(command: string, args: string[], timeoutMs: number): Promise<Run> {
  return new Promise((resolve, reject) => {
    // Its own process group, so a timeout also stops what it started: soffice runs soffice.bin.
    const child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Refused('timeout', `${command} ran past ${timeoutMs} ms`));
      else resolve({ code, stdout: Buffer.concat(stdout), stderr });
    });
  });
}

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
let libreOfficeQueue: Promise<unknown> = Promise.resolve();
function oneLibreOfficeAtATime<T>(work: () => Promise<T>): Promise<T> {
  const result = libreOfficeQueue.then(work, work);
  libreOfficeQueue = result.catch(() => undefined);
  return result;
}

const libreOfficeArgs = [
  `-env:UserInstallation=file://${libreOfficeProfile}`,
  '--headless',
  '--norestore',
  '--nologo',
  '--nodefault',
  '--nolockcheck',
];

async function docToDocx(doc: Uint8Array): Promise<Buffer> {
  if (!isWordLike(doc)) throw new Refused('unsupported', 'not a Word, RTF or HTML file');
  return inTempDir(async (dir) => {
    await writeFile(join(dir, 'document.doc'), doc);
    const result = await oneLibreOfficeAtATime(() =>
      run(
        'soffice',
        [
          ...libreOfficeArgs,
          '--convert-to',
          'docx:MS Word 2007 XML',
          '--outdir',
          dir,
          join(dir, 'document.doc'),
        ],
        120_000
      )
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

async function pdfInfo(path: string, page?: number) {
  const range = page ? ['-f', String(page), '-l', String(page)] : [];
  const result = await run('pdfinfo', [...range, path], 30_000);
  if (result.code !== 0) {
    if (/incorrect password/i.test(result.stderr)) throw new Refused('password_protected');
    throw new Refused('corrupt', result.stderr.trim().slice(0, 300));
  }
  return parsePdfInfo(result.stdout.toString());
}

async function pdfText(pdf: Uint8Array) {
  if (!isPdf(pdf)) throw new Refused('unsupported', 'not a PDF');
  return inTempDir(async (dir) => {
    const path = join(dir, 'document.pdf');
    await writeFile(path, pdf);
    const { pageCount } = await pdfInfo(path);
    if (pageCount === 0) return { pageCount, pages: [] };
    const result = await run(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', '-f', '1', '-l', String(pageCount), path, '-'],
      120_000
    );
    if (result.code !== 0) throw new Refused('corrupt', result.stderr.trim().slice(0, 300));
    return { pageCount, pages: splitPages(result.stdout.toString('utf8'), pageCount) };
  });
}

async function pdfPageImage(pdf: Uint8Array, page: number): Promise<Buffer> {
  if (!isPdf(pdf)) throw new Refused('unsupported', 'not a PDF');
  return inTempDir(async (dir) => {
    const path = join(dir, 'document.pdf');
    await writeFile(path, pdf);
    const { pageCount } = await pdfInfo(path);
    if (page > pageCount) throw new Refused('page_out_of_range', `the PDF has ${pageCount} pages`);
    const { pageSizes } = await pdfInfo(path, page);
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
      60_000
    );
    if (result.code !== 0) throw new Refused('corrupt', result.stderr.trim().slice(0, 300));
    return readFile(join(dir, 'page.jpg'));
  });
}

async function imageToJpeg(image: Uint8Array): Promise<Buffer> {
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
        `${kind}:${input}[0]`,
        '-auto-orient',
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
      60_000
    );
    if (result.code !== 0) throw new Refused('corrupt', result.stderr.trim().slice(0, 300));
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

async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://extractor');
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { status: 'ok' });
  }
  if (request.method !== 'POST') return sendJson(response, 404, { error: 'not_found' });
  switch (url.pathname) {
    case '/doc-to-docx': {
      const docx = await docToDocx(await readBody(request));
      return send(
        response,
        200,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        docx
      );
    }
    case '/pdf-text':
      return sendJson(response, 200, await pdfText(await readBody(request)));
    case '/pdf-page-image': {
      const page = pageOf(url);
      return send(response, 200, 'image/jpeg', await pdfPageImage(await readBody(request), page));
    }
    case '/heic-to-jpeg':
      return send(response, 200, 'image/jpeg', await imageToJpeg(await readBody(request)));
    default:
      return sendJson(response, 404, { error: 'not_found' });
  }
}

const server = createServer((request, response) => {
  const started = Date.now();
  handle(request, response).catch((error: unknown) => {
    const refused = error instanceof Refused;
    const status = refused ? refusalStatus[error.reason] : 500;
    console.error(
      JSON.stringify({
        event: refused ? 'extractor_refused' : 'extractor_failed',
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
      refused ? { error: error.reason, detail: error.detail } : { error: 'failed' }
    );
  });
});

server.requestTimeout = 300_000;
server.listen(port, () => console.log(JSON.stringify({ event: 'extractor_listening', port })));

process.on('SIGTERM', () => server.close(() => process.exit(0)));
