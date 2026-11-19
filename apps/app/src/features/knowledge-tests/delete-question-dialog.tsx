import { toast } from '@ssm-usor/ui/lib/toast';
import { useState } from 'react';

import { useDeleteTestQuestion } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { ConfirmDialog } from '@/components/confirm-dialog';

import { type BankQuestion, invalidateTestBank, testFailure } from './test-format';

export function DeleteQuestionDialog({
  question,
  onClose,
}: {
  question: BankQuestion | null;
  onClose: () => void;
}) {
  const { request, queryClient } = useApi();
  const remove = useDeleteTestQuestion({ request });
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function deleteQuestion(target: BankQuestion) {
    setError(null);
    try {
      await remove.mutateAsync({ questionId: target.id });
    } catch (cause) {
      if (!(cause instanceof ApiHttpError && cause.status === 404)) {
        setError(
          testFailure(
            cause,
            'Nu am putut șterge întrebarea. Verifică conexiunea și încearcă din nou.'
          )
        );
        return;
      }
    }
    toast.success('Întrebarea a fost ștearsă.');
    await invalidateTestBank(queryClient);
    close();
  }

  return (
    question && (
      <ConfirmDialog
        open
        error={error}
        testId="test-question-delete"
        title="Ștergi întrebarea?"
        confirmLabel="Șterge întrebarea"
        pendingLabel="Se șterge…"
        onConfirm={() => deleteQuestion(question)}
        onClose={close}
      >
        <span className="font-medium text-foreground">„{question.text}”</span> iese din bancă și din
        testul tipărit la următoarea generare. Încercările în care a apărut o păstrează așa cum a
        fost arătată.
      </ConfirmDialog>
    )
  );
}
