// What apps/pdf offers other Workers over its service binding (ADR 005).

/** `message` of the error `convertDocx` rejects with when the conversion service fails. */
export const pdfConversionFailed = 'pdf_conversion_failed';

export interface PdfService {
  /**
   * A Word document as a PDF/A-2b file, laid out by LibreOffice. Takes seconds, and longer
   * when the container behind it has to start first. Rejects when it cannot be converted.
   */
  convertDocx(docx: ArrayBuffer): Promise<ArrayBuffer>;
}
