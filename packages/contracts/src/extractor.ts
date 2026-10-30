// What the extractor container in apps/pdf offers other Workers over the PDF Worker's service
// binding (ADR 030): the conversions that turn an import's files into text and images.

/** `message` of the error a method rejects with when the extractor fails or cannot be reached. */
export const extractionFailed = 'extraction_failed';

/**
 * Why the extractor refused a file. Trying the same file again does not help.
 * `too_large` is a file over `extractorFileLimit`, or a PDF over 300 pages or whose text passes
 * 8 MiB; `timeout` is a file the tool did not finish within its limit; `page_out_of_range` a page
 * number below 1 or past the PDF's last page.
 */
export const extractionRefusals = [
  'too_large',
  'unsupported',
  'corrupt',
  'password_protected',
  'timeout',
  'page_out_of_range',
] as const;
export type ExtractionRefusal = (typeof extractionRefusals)[number];

export function extractionRefused(reason: ExtractionRefusal): string {
  return `${extractionFailed}:${reason}`;
}

/** The refusal in a rejection, `corrupt` for `extraction_failed:corrupt`; null for any other error. */
export function extractionRefusalOf(error: unknown): ExtractionRefusal | null {
  if (!(error instanceof Error)) return null;
  const prefix = `${extractionFailed}:`;
  if (!error.message.startsWith(prefix)) return null;
  const reason = error.message.slice(prefix.length);
  return extractionRefusals.find((each) => each === reason) ?? null;
}

/** The largest file the extractor takes: the largest file of an import, an employee import's. */
export const extractorFileLimit = 25 * 1024 * 1024;

export type PdfPageText = {
  /** From 1. */
  number: number;
  /** As `pdftotext -layout` lays it out. */
  text: string;
  isScan: boolean;
};

export type PdfText = { pageCount: number; pages: PdfPageText[] };

export interface ExtractorService {
  /** A Word 97–2003 file (or the RTF or HTML saved as one) as `.docx`, through LibreOffice. */
  docToDocx(doc: ArrayBuffer): Promise<ArrayBuffer>;
  /** `isScan` marks a page with fewer than 100 characters other than whitespace. */
  pdfText(pdf: ArrayBuffer): Promise<PdfText>;
  /** One page of a PDF as a JPEG at about 150 dpi, for a model to read a scanned page. */
  pdfPageImage(pdf: ArrayBuffer, page: number): Promise<ArrayBuffer>;
  /**
   * A HEIC, JPEG or PNG photograph as a JPEG turned upright, at most 2000 pixels a side, its
   * transparency on white and its metadata removed.
   */
  imageToJpeg(image: ArrayBuffer): Promise<ArrayBuffer>;
}
