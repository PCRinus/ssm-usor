import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { useDeleteTestQuestion } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';

import { type BankQuestion, invalidateTestBank, testFailure } from './test-format';

export function DeleteQuestionDialog({
  question,
  onClose,
}: {
  question: BankQuestion | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const remove = useDeleteTestQuestion({ request: apiRequest });
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
    <Dialog open={question !== null} onOpenChange={(open) => !open && !remove.isPending && close()}>
      {question && (
        <DialogContent data-testid="test-question-delete-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ștergi întrebarea?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">„{question.text}”</span> iese din bancă
              și din testul tipărit la următoarea generare. Încercările în care a apărut o păstrează
              așa cum a fost arătată.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Notice variant="destructive" data-testid="test-question-delete-error">
              {error}
            </Notice>
          )}
          <DialogFooter className="mt-2">
            <Button variant="ghost" disabled={remove.isPending} onClick={close}>
              Renunță
            </Button>
            <Button
              variant="destructive"
              data-testid="test-question-delete-confirm"
              disabled={remove.isPending}
              onClick={() => void deleteQuestion(question)}
            >
              {remove.isPending ? 'Se șterge…' : 'Șterge întrebarea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
