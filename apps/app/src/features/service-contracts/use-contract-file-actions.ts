import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  type ServiceContractResponse,
  useAttachDocumentSignedCopy,
  useConfirmDocumentSignedCopy,
  useDeleteDocumentDraft,
  useGenerateServiceContract,
  useIssueDocument,
  useRemoveDocumentSignedCopy,
} from '@/api/generated/api';
import { apiErrorBody, ApiHttpError } from '@/api/http';
import { pdfOfRevision, usePrint } from '@/features/documents/print';
import { commonFailure } from '@/lib/api-errors';

type Confirming = 'regenerate' | 'issue' | 'issueUnfilled' | 'delete' | 'removeSigned' | null;

export function useContractFileActions({
  clientId,
  documentId,
  title,
  refresh,
  setError,
}: {
  clientId: string;
  documentId: string | undefined;
  title: string;
  refresh: (response?: ServiceContractResponse) => Promise<void>;
  setError: (error: string | null) => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const generate = useGenerateServiceContract({ request: apiRequest });
  const issue = useIssueDocument({ request: apiRequest });
  const remove = useDeleteDocumentDraft({ request: apiRequest });
  const attachSigned = useAttachDocumentSignedCopy({ request: apiRequest });
  const confirmSigned = useConfirmDocumentSignedCopy({ request: apiRequest });
  const removeSigned = useRemoveDocumentSignedCopy({ request: apiRequest });
  const { printing, print } = usePrint();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const busy =
    generate.isPending ||
    issue.isPending ||
    remove.isPending ||
    attachSigned.isPending ||
    confirmSigned.isPending ||
    removeSigned.isPending;

  async function run(action: NonNullable<Confirming> | 'generate') {
    setError(null);
    try {
      if (action === 'generate' || action === 'regenerate') {
        await refresh(await generate.mutateAsync({ clientId }));
        toast.success(
          action === 'generate'
            ? 'Contractul a fost generat.'
            : 'Contractul a fost generat din nou.'
        );
      } else if (action === 'delete') {
        await remove.mutateAsync({ documentId: documentId! });
        await refresh();
        toast.success('Ciorna contractului a fost ștearsă.');
      } else if (action === 'removeSigned') {
        await removeSigned.mutateAsync({ documentId: documentId! });
        await refresh();
        toast.success('Exemplarul semnat a fost eliminat.');
      } else {
        await issue.mutateAsync({
          documentId: documentId!,
          data: { acceptUnfilled: action === 'issueUnfilled' },
        });
        await refresh();
        toast.success('Contractul a fost emis.');
      }
    } catch (cause) {
      const body = apiErrorBody(cause);
      if (body?.reason === 'unfilled_text') {
        // Not a failure: the same dialog asks its second question.
        setConfirming('issueUnfilled');
        return;
      }
      setError(
        commonFailure(cause) ??
          (body?.reason === 'pdf_unavailable'
            ? 'Nu am putut face PDF-ul, așa că contractul nu a fost emis. Încearcă din nou peste câteva momente.'
            : body?.reason === 'missing_contract_data'
              ? 'Lipsesc date pe care contractul le tipărește. Lista de mai jos spune care.'
              : body?.reason === 'template_missing'
                ? 'Modelul de contract nu este încă instalat în acest mediu.'
                : 'Operațiunea nu a reușit. Verifică conexiunea și încearcă din nou.')
      );
      await refresh();
    }
    setConfirming(null);
  }

  async function attachSignedCopy(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      await attachSigned.mutateAsync({ documentId: documentId!, data: file });
      await refresh();
      toast.success('Exemplarul semnat a fost atașat.');
    } catch (cause) {
      setError(
        cause instanceof ApiHttpError && cause.status === 400
          ? 'Exemplarul semnat trebuie să fie un PDF de cel mult 15 MB. Dacă ai o fotografie a contractului, salveaz-o ca PDF.'
          : 'Nu am putut atașa exemplarul semnat. Verifică conexiunea și încearcă din nou.'
      );
      await refresh();
    }
  }

  async function confirmSignedCopy() {
    setError(null);
    try {
      await confirmSigned.mutateAsync({ documentId: documentId! });
      await refresh();
      toast.success('Exemplarul semnat a fost confirmat.');
    } catch {
      setError('Nu am putut confirma exemplarul semnat. Verifică conexiunea și încearcă din nou.');
      await refresh();
    }
  }

  async function printRevision(revision: { id: string; hasPdf: boolean }) {
    setError(null);
    setError(await print(title, () => pdfOfRevision(apiRequest, documentId!, revision)));
  }

  return {
    busy,
    generating: generate.isPending,
    attaching: attachSigned.isPending,
    confirmingSigned: confirmSigned.isPending,
    printing,
    confirming,
    setConfirming,
    run,
    attachSignedCopy,
    confirmSignedCopy,
    printRevision,
  };
}

export type ContractFileActions = ReturnType<typeof useContractFileActions>;
