import type {
  BuiltInDocumentTypeKey,
  DocumentAnnex,
  DocumentSet,
  MissingDocumentData,
} from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import {
  getDocumentAnnex,
  getDocumentArchive,
  getDocumentWord,
  getListClientDocumentsQueryKey,
  getListDocumentsBehindQueryKey,
  useDeleteDocumentDraft,
  useIssueDocument,
  useRegenerateDocument,
  useStartDocumentDraft,
  useUploadClientDocument,
} from '@/api/generated/api';
import { apiErrorBody, ApiHttpError } from '@/api/http';
import { openedHere } from '@/app/opener';
import { behindSummaryQueryKey } from '@/features/legislation/use-behind-summary';
import { commonFailure } from '@/lib/api-errors';
import { saveFile } from '@/lib/save-file';

import type { ClientDocument } from './document-labels';
import { documentLink, documentSetCopy } from './document-sets';
import { pdfOfRevision, usePrint } from './print';

export type Revision = NonNullable<ClientDocument['draft']>;
export type Confirming = {
  // `issueUnfilled` is the second question of issuing: the file still has text to fill in.
  action: 'regenerate' | 'issue' | 'issueUnfilled' | 'upload' | 'delete';
  document: ClientDocument;
} | null;
export type Refusal = { document: ClientDocument; missing: MissingDocumentData[] };

export function documentActionFailure(cause: unknown, document: ClientDocument): string | Refusal {
  const body = apiErrorBody(cause);
  return (
    commonFailure(cause) ??
    (body?.reason === 'pdf_unavailable'
      ? `Nu am putut face PDF-ul pentru „${document.title}”, așa că documentul nu a fost emis. Încearcă din nou peste câteva momente.`
      : body?.reason === 'missing_document_data' && body.missing?.length
        ? { document, missing: body.missing }
        : body?.reason === 'missing_document_data'
          ? 'Lipsesc date de care documentul are nevoie. Completează-le în paginile clientului, apoi generează documentul din nou.'
          : cause instanceof ApiHttpError && (cause.status === 404 || cause.status === 409)
            ? 'Documentul s-a schimbat între timp. Lista a fost reîncărcată.'
            : 'Operațiunea nu a reușit. Verifică conexiunea și încearcă din nou.')
  );
}

export function useDocumentActions({ set, clientId }: { set: DocumentSet; clientId: string }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const regenerate = useRegenerateDocument({ request: apiRequest });
  const issue = useIssueDocument({ request: apiRequest });
  const remove = useDeleteDocumentDraft({ request: apiRequest });
  const upload = useUploadClientDocument({ request: apiRequest });
  const startDraft = useStartDocumentDraft({ request: apiRequest });
  const { printing, print } = usePrint();
  // One file input for the whole card; what it was opened for waits here until a file is chosen.
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{
    typeKey: BuiltInDocumentTypeKey;
    title: string;
    period: number | null;
  } | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState<string | Refusal | null>(null);
  const [archiving, setArchiving] = useState(false);
  const busy =
    regenerate.isPending ||
    issue.isPending ||
    remove.isPending ||
    upload.isPending ||
    startDraft.isPending;

  async function refreshLists() {
    void queryClient.invalidateQueries({ queryKey: getListDocumentsBehindQueryKey() });
    void queryClient.invalidateQueries({ queryKey: behindSummaryQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) });
  }

  function chooseFile(typeKey: string, title: string, period: number | null) {
    uploadTarget.current = { typeKey: typeKey as BuiltInDocumentTypeKey, title, period };
    fileInput.current?.click();
  }

  async function uploadFile(file: File | undefined) {
    const target = uploadTarget.current;
    if (!file || !target) return;
    setError(null);
    try {
      await upload.mutateAsync({
        clientId,
        typeKey: target.typeKey,
        data: file,
        params: target.period === null ? undefined : { period: target.period },
      });
      toast.success(`„${target.title}” a fost încărcat ca ciornă.`);
    } catch (cause) {
      setError(
        cause instanceof ApiHttpError && cause.status === 400
          ? 'Fișierul nu este un document Word (.docx) sau are peste 15 MB. Dacă este un .doc mai vechi, salvează-l din Word ca .docx.'
          : cause instanceof ApiHttpError && cause.status === 409
            ? 'Documentul s-a schimbat între timp. Lista a fost reîncărcată.'
            : `Nu am putut încărca fișierul pentru „${target.title}”. Verifică conexiunea și încearcă din nou.`
      );
    }
    await refreshLists();
  }

  async function download(document: ClientDocument, revision: Revision) {
    setError(null);
    try {
      const file = await getDocumentWord(document.id, revision.id, apiRequest);
      saveFile(file, file instanceof File ? file.name : `${document.title}.docx`);
    } catch {
      setError(
        `Nu am putut descărca „${document.title}”. Verifică conexiunea și încearcă din nou.`
      );
    }
  }

  async function downloadArchive(format: 'docx' | 'pdf') {
    setError(null);
    setArchiving(true);
    const pending = toast.loading('Se pregătește arhiva documentației…');
    try {
      const archive = await getDocumentArchive(clientId, { set, format }, apiRequest);
      saveFile(
        archive,
        archive instanceof File ? archive.name : `Documentatie ${documentSetCopy[set].name}.zip`
      );
    } catch (cause) {
      const body = apiErrorBody(cause);
      setError(
        body?.reason === 'nothing_to_archive'
          ? format === 'pdf'
            ? 'Niciun document nu are încă PDF. PDF-ul se face când documentul este emis.'
            : 'Niciun document nu este generat încă.'
          : 'Nu am putut pregăti arhiva documentației. Verifică conexiunea și încearcă din nou.'
      );
    } finally {
      toast.dismiss(pending);
      setArchiving(false);
    }
  }

  async function downloadAnnex(document: ClientDocument, revision: Revision, annex: DocumentAnnex) {
    setError(null);
    try {
      const file = await getDocumentAnnex(document.id, revision.id, annex.number, apiRequest);
      saveFile(file, file instanceof File ? file.name : `Anexa ${annex.number}.docx`);
    } catch {
      setError(
        `Nu am putut descărca anexa „${annex.title}”. Verifică conexiunea și încearcă din nou.`
      );
    }
  }

  async function printRevision(document: ClientDocument, revision: Revision) {
    setError(null);
    setError(await print(document.title, () => pdfOfRevision(apiRequest, document.id, revision)));
  }

  async function startDraftFromIssued(document: ClientDocument) {
    setError(null);
    try {
      await startDraft.mutateAsync({ documentId: document.id });
    } catch (cause) {
      // A 409 is a draft someone else has just started, and it opens all the same.
      if (!(cause instanceof ApiHttpError && cause.status === 409)) {
        setError(
          `Nu am putut porni o ciornă nouă pentru „${document.title}”. Verifică conexiunea și încearcă din nou.`
        );
        return;
      }
    }
    await queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) });
    await navigate({
      ...documentLink(set, clientId, document.id),
      state: openedHere,
    });
  }

  async function run({ action, document }: NonNullable<Confirming>) {
    setError(null);
    if (action === 'upload') {
      // Still inside the click, which is what lets a page open the file picker.
      chooseFile(document.typeKey, document.title, document.period);
      setConfirming(null);
      return;
    }
    try {
      if (action === 'regenerate') {
        await regenerate.mutateAsync({ documentId: document.id, data: {} });
        toast.success(`„${document.title}” a fost generat din nou.`);
      } else if (action === 'issue' || action === 'issueUnfilled') {
        await issue.mutateAsync({
          documentId: document.id,
          data: { acceptUnfilled: action === 'issueUnfilled' },
        });
        toast.success(`„${document.title}” a fost emis.`);
      } else {
        await remove.mutateAsync({ documentId: document.id });
        toast.success(`Ciorna pentru „${document.title}” a fost ștearsă.`);
      }
    } catch (cause) {
      if (apiErrorBody(cause)?.reason === 'unfilled_text') {
        // Not a failure: the same dialog asks its second question.
        setConfirming({ action: 'issueUnfilled', document });
        return;
      }
      setError(documentActionFailure(cause, document));
    }
    setConfirming(null);
    // Also after a failure: a 404 or a 409 means the list on screen is out of date.
    await refreshLists();
  }

  return {
    apiRequest,
    busy,
    printing,
    archiving,
    confirming,
    setConfirming,
    error,
    fileInput,
    chooseFile,
    uploadFile,
    download,
    downloadArchive,
    downloadAnnex,
    printRevision,
    startDraftFromIssued,
    run,
  };
}

export type DocumentActions = ReturnType<typeof useDocumentActions>;
