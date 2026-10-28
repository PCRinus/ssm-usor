import {
  extractionFailed,
  extractionRefusals,
  extractionRefused,
  extractorFileLimit,
  type ExtractorService,
  type PdfPageText,
  type PdfText,
} from './extractor';

// The wire format of the extractor container (apps/pdf/extractor): the file as the request body,
// the result as the answer's body. Shared by apps/pdf, which reaches the container, and the API,
// which reaches an extractor started locally by URL (docs/pdf.md).

export type ExtractorRoute = '/doc-to-docx' | '/pdf-text' | '/pdf-page-image' | '/heic-to-jpeg';

/** Rejects an answer that is not a 2xx with `extractorAnswerError`, so a refusal keeps its reason. */
export type ExtractorPost = (
  route: ExtractorRoute,
  file: ArrayBuffer,
  params?: Record<string, string>
) => Promise<ArrayBuffer>;

export function extractorAnswerError(status: number, body: string): Error {
  if (status >= 400 && status < 500) {
    try {
      const { error } = JSON.parse(body) as { error?: unknown };
      const refusal = extractionRefusals.find((each) => each === error);
      if (refusal) return new Error(extractionRefused(refusal));
    } catch {
      // Not the service's JSON: a proxy or the container runtime answered.
    }
  }
  return new Error(extractionFailed);
}

const startsWith = (data: ArrayBuffer, prefix: number[]) => {
  const bytes = new Uint8Array(data, 0, Math.min(prefix.length, data.byteLength));
  return prefix.every((byte, index) => bytes[index] === byte);
};

function expect(data: ArrayBuffer, prefix: number[]): ArrayBuffer {
  if (!startsWith(data, prefix)) throw new Error(extractionFailed);
  return data;
}

const zip = [0x50, 0x4b, 0x03, 0x04];
const jpeg = [0xff, 0xd8, 0xff];

function pdfTextOf(data: ArrayBuffer): PdfText {
  let answer: unknown;
  try {
    answer = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error(extractionFailed);
  }
  const { pageCount, pages } = (answer ?? {}) as { pageCount?: unknown; pages?: unknown };
  const valid =
    typeof pageCount === 'number' &&
    Array.isArray(pages) &&
    pages.length === pageCount &&
    pages.every(
      (page: Partial<PdfPageText>, index) =>
        page.number === index + 1 &&
        typeof page.text === 'string' &&
        typeof page.isScan === 'boolean'
    );
  if (!valid) throw new Error(extractionFailed);
  return { pageCount, pages: pages as PdfPageText[] };
}

function withinLimit(file: ArrayBuffer): ArrayBuffer {
  if (file.byteLength > extractorFileLimit) throw new Error(extractionRefused('too_large'));
  return file;
}

export function extractorOverHttp(post: ExtractorPost): ExtractorService {
  return {
    docToDocx: async (doc) => expect(await post('/doc-to-docx', withinLimit(doc)), zip),
    pdfText: async (pdf) => pdfTextOf(await post('/pdf-text', withinLimit(pdf))),
    pdfPageImage: async (pdf, page) => {
      if (!Number.isInteger(page) || page < 1) {
        throw new Error(extractionRefused('page_out_of_range'));
      }
      return expect(await post('/pdf-page-image', withinLimit(pdf), { page: String(page) }), jpeg);
    },
    heicToJpeg: async (image) => expect(await post('/heic-to-jpeg', withinLimit(image)), jpeg),
  };
}
