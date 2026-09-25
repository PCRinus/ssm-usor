import { toast } from '@ssm-usor/ui/lib/toast';
import { useState } from 'react';

import { type ApiErrorResponse, getDocumentDownload, printDocument } from '../api/generated/api';
import { ApiHttpError, type ApiRequestOptions } from '../api/http';

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let frame: HTMLIFrameElement | null = null;

// The frame stays until the next print: the print dialog gives no sign that it has closed, and
// the PDF has to outlive it.
function printPdf(pdf: Blob) {
  if (frame) {
    URL.revokeObjectURL(frame.src);
    frame.remove();
  }
  const printed = window.document.createElement('iframe');
  printed.dataset.testid = 'print-frame';
  printed.title = 'Tipărire';
  printed.setAttribute('aria-hidden', 'true');
  printed.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  printed.onload = () => printed.contentWindow?.print();
  printed.src = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  window.document.body.append(printed);
  frame = printed;
}

function saveAs(file: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(file);
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

async function fetchFile(
  apiRequest: ApiRequestOptions,
  documentId: string,
  revisionId: string,
  format: 'docx' | 'pdf'
) {
  const link = await getDocumentDownload(documentId, revisionId, { format }, apiRequest);
  const response = await fetch(link.url);
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  return response.blob();
}

export const pdfOf = (apiRequest: ApiRequestOptions, documentId: string, docx: Uint8Array) =>
  printDocument(documentId, new Blob([new Uint8Array(docx)], { type: docxType }), apiRequest);

// The PDF made at issuing is the document as issued; a conversion made now could differ.
export async function pdfOfRevision(
  apiRequest: ApiRequestOptions,
  documentId: string,
  revision: { id: string; hasPdf: boolean }
) {
  if (revision.hasPdf) return fetchFile(apiRequest, documentId, revision.id, 'pdf');
  const docx = await fetchFile(apiRequest, documentId, revision.id, 'docx');
  return printDocument(documentId, docx, apiRequest);
}

export function usePrint() {
  const [printing, setPrinting] = useState(false);

  /** Opens the print dialog with the PDF, or answers why it could not. */
  async function print(title: string, pdf: () => Promise<Blob>): Promise<string | null> {
    setPrinting(true);
    const pending = toast.loading(`Se pregătește „${title}” pentru tipărire…`);
    try {
      const file = await pdf();
      // Without a viewer, a PDF in a frame is downloaded under a random name and never printed.
      if (!navigator.pdfViewerEnabled) {
        saveAs(file, `${title}.pdf`);
        toast.info(
          `Browserul nu afișează PDF-uri, așa că „${title}” a fost descărcat. Deschide fișierul și tipărește-l de acolo.`
        );
        return null;
      }
      printPdf(file);
      return null;
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      return body?.reason === 'pdf_unavailable'
        ? `Nu am putut pregăti „${title}” pentru tipărire: serviciul care face PDF-ul nu răspunde acum. Încearcă din nou peste câteva momente sau descarcă documentul.`
        : `Nu am putut pregăti „${title}” pentru tipărire. Verifică conexiunea și încearcă din nou.`;
    } finally {
      toast.dismiss(pending);
      setPrinting(false);
    }
  }

  return { printing, print };
}
