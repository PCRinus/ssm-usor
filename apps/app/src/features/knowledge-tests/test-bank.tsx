import { type KnowledgeTest, testErrorReasons, type TrainingDomain } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { useHideTestQuestion, useRestoreTestQuestion } from '@/api/generated/api';
import { apiErrorReason } from '@/api/http';
import { useApi } from '@/api/use-api';
import { HelpLink } from '@/components/help-link';
import { LoadFailed } from '@/components/load-failed';

import { DeleteQuestionDialog } from './delete-question-dialog';
import { QuestionDialog, type QuestionEditing } from './question-dialog';
import { QuestionItem } from './question-item';
import { QuestionPreviewDialog } from './question-preview-dialog';
import { bankTestLabel } from './test-bank-sections';
import {
  atMinimum,
  type BankQuestion,
  bankTestCounts,
  invalidateTestBank,
  testFailure,
} from './test-format';
import { useTestBank } from './use-test-bank';

const belowMinimum = (cause: unknown) => apiErrorReason(cause) === testErrorReasons.belowMinimum;

export function TestBank({ domain, test }: { domain: TrainingDomain; test: KnowledgeTest }) {
  const { request, queryClient } = useApi();
  const bank = useTestBank();
  const hide = useHideTestQuestion({ request });
  const restore = useRestoreTestQuestion({ request });
  const [editing, setEditing] = useState<QuestionEditing>(null);
  const [previewing, setPreviewing] = useState<BankQuestion | null>(null);
  const [deleting, setDeleting] = useState<BankQuestion | null>(null);
  const [failure, setFailure] = useState<{ questionId: string; message: string } | null>(null);
  const [minimumFor, setMinimumFor] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const label = bankTestLabel(domain, test);

  if (bank.isError) {
    return (
      <div className="p-4 sm:p-6">
        <LoadFailed
          error={bank.error}
          testId="test-bank-load-error"
          busy={bank.isFetching}
          onRetry={() => void bank.refetch()}
        >
          Nu am putut încărca întrebările.
        </LoadFailed>
      </div>
    );
  }
  const bankTest = bank.data?.tests.find((each) => each.domain === domain && each.test === test);
  if (!bank.data || !bankTest) {
    return (
      <div className="grid gap-4 p-4 sm:p-6" aria-busy="true">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  const { minimumActiveQuestions: minimum, sittingSize } = bank.data;
  const busy = hide.isPending || restore.isPending;
  const add = (from: HTMLElement | null = addRef.current) => {
    returnFocus.current = from;
    setMinimumFor(null);
    setEditing({ kind: 'new', domain, test });
  };

  async function setHidden(question: BankQuestion, hidden: boolean) {
    setFailure(null);
    if (hidden && atMinimum(bankTest!, minimum)) {
      setMinimumFor((current) => (current === question.id ? null : question.id));
      return;
    }
    setMinimumFor(null);
    try {
      await (hidden ? hide : restore).mutateAsync({ questionId: question.id });
      toast.success(
        hidden ? 'Întrebarea a fost ascunsă din test.' : 'Întrebarea a fost repusă în test.'
      );
    } catch (cause) {
      if (belowMinimum(cause)) setMinimumFor(question.id);
      else {
        setFailure({
          questionId: question.id,
          message: testFailure(
            cause,
            'Nu am putut salva schimbarea. Verifică conexiunea și încearcă din nou.'
          ),
        });
      }
    }
    await invalidateTestBank(queryClient);
  }

  let number = 0;
  const numbered = bankTest.questions.map((question) => ({
    question,
    number: question.hidden ? null : ++number,
  }));

  return (
    <div data-testid="test-bank-test" data-domain={domain} data-test={test}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-6">
        <p data-testid="test-bank-counts" className="flex items-center gap-1.5 text-sm">
          {bankTestCounts(bankTest, minimum)}
          <HelpLink topic="teste.extragere" label="Ajutor: Cum se alcătuiește un test" />
        </p>
        <Button
          ref={addRef}
          data-testid="test-question-add"
          className="max-sm:w-full"
          onClick={() => add()}
        >
          <Plus aria-hidden="true" />
          Adaugă o întrebare
        </Button>
      </div>
      <ol aria-label={`Întrebările testului ${label}`} className="grid gap-3 p-3 sm:gap-4 sm:p-6">
        {numbered.map(({ question, number }) => (
          <QuestionItem
            key={question.id}
            question={question}
            number={number}
            busy={busy}
            error={failure?.questionId === question.id ? failure.message : null}
            minimumOpen={minimumFor === question.id}
            minimum={minimum}
            onMinimumClose={() => setMinimumFor(null)}
            onAdd={add}
            onPreview={() => setPreviewing(question)}
            onHide={() => void setHidden(question, true)}
            onRestore={() => void setHidden(question, false)}
            onEdit={() => setEditing({ kind: 'edit', question })}
            onDelete={() => setDeleting(question)}
          />
        ))}
      </ol>
      <QuestionDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onCloseAutoFocus={(event) => {
          const target = returnFocus.current;
          returnFocus.current = null;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus({ preventScroll: true });
        }}
      />
      <QuestionPreviewDialog
        question={previewing}
        sittingSize={sittingSize}
        onClose={() => setPreviewing(null)}
      />
      <DeleteQuestionDialog question={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
