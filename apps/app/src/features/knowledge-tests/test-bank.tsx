import { knowledgeTestLabels, type TrainingDomain } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  getGetTestBankQueryKey,
  useGetTestBank,
  useHideTestQuestion,
  useRestoreTestQuestion,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';

import { DeleteQuestionDialog } from './delete-question-dialog';
import { QuestionDialog, type QuestionEditing } from './question-dialog';
import { QuestionItem } from './question-item';
import { QuestionPreviewDialog } from './question-preview-dialog';
import {
  type BankQuestion,
  type BankTest,
  bankTestFacts,
  invalidateTestBank,
  testFailure,
} from './test-format';

export function TestBank({ domain, userId }: { domain: TrainingDomain; userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = { domain };
  const bank = useGetTestBank(params, {
    request: apiRequest,
    query: {
      queryKey: [...getGetTestBankQueryKey(params), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const [editing, setEditing] = useState<QuestionEditing>(null);
  const [previewing, setPreviewing] = useState<BankQuestion | null>(null);
  const [deleting, setDeleting] = useState<BankQuestion | null>(null);

  if (bank.isError) {
    return (
      <Notice
        variant="destructive"
        data-testid="test-bank-load-error"
        action={
          <Button variant="outline" disabled={bank.isFetching} onClick={() => void bank.refetch()}>
            Încearcă din nou
          </Button>
        }
      >
        Nu am putut încărca banca de întrebări.
      </Notice>
    );
  }
  if (!bank.data) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  const { data } = bank;

  return (
    <div data-testid={`test-bank-${domain}`} className="grid gap-6">
      {data.tests.map((test) => (
        <BankTestCard
          key={test.test}
          test={test}
          facts={bankTestFacts(test, data)}
          onAdd={() => setEditing({ kind: 'new', domain, test: test.test })}
          onEdit={(question) => setEditing({ kind: 'edit', question })}
          onPreview={setPreviewing}
          onDelete={setDeleting}
        />
      ))}
      <QuestionDialog editing={editing} onClose={() => setEditing(null)} />
      <QuestionPreviewDialog
        question={previewing}
        sittingSize={data.sittingSize}
        onClose={() => setPreviewing(null)}
      />
      <DeleteQuestionDialog question={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function BankTestCard({
  test,
  facts,
  onAdd,
  onEdit,
  onPreview,
  onDelete,
}: {
  test: BankTest;
  facts: string;
  onAdd: () => void;
  onEdit: (question: BankQuestion) => void;
  onPreview: (question: BankQuestion) => void;
  onDelete: (question: BankQuestion) => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const hide = useHideTestQuestion({ request: apiRequest });
  const restore = useRestoreTestQuestion({ request: apiRequest });
  const [failure, setFailure] = useState<{ questionId: string; message: string } | null>(null);
  const busy = hide.isPending || restore.isPending;

  async function setHidden(question: BankQuestion, hidden: boolean) {
    setFailure(null);
    try {
      await (hidden ? hide : restore).mutateAsync({ questionId: question.id });
      toast.success(
        hidden ? 'Întrebarea a fost ascunsă din test.' : 'Întrebarea a fost repusă în test.'
      );
    } catch (cause) {
      setFailure({
        questionId: question.id,
        message: testFailure(
          cause,
          'Nu am putut salva schimbarea. Verifică conexiunea și încearcă din nou.'
        ),
      });
    }
    await invalidateTestBank(queryClient);
  }

  const numbered = test.questions.map((question, index) => ({
    question,
    number: question.hidden
      ? null
      : test.questions.slice(0, index + 1).filter((each) => !each.hidden).length,
  }));

  return (
    <SectionCard
      data-testid="test-bank-test"
      data-test={test.test}
      className="gap-0 pb-0"
      title={
        <span className="flex flex-wrap items-baseline gap-x-2">
          {knowledgeTestLabels[test.test]}
          <span className="text-sm font-normal text-muted-foreground">{test.code}</span>
        </span>
      }
      description={<span data-testid="test-bank-facts">{facts}</span>}
      action={
        <Button size="sm" data-testid="test-question-add" onClick={onAdd}>
          <Plus aria-hidden="true" />
          Adaugă o întrebare
        </Button>
      }
    >
      <ol aria-label={`Întrebările testului ${test.code}`} className="-mx-6 mt-5 divide-y border-t">
        {numbered.map(({ question, number }) => (
          <QuestionItem
            key={question.id}
            question={question}
            number={number}
            busy={busy}
            error={failure?.questionId === question.id ? failure.message : null}
            onPreview={() => onPreview(question)}
            onHide={() => void setHidden(question, true)}
            onRestore={() => void setHidden(question, false)}
            onEdit={() => onEdit(question)}
            onDelete={() => onDelete(question)}
          />
        ))}
      </ol>
    </SectionCard>
  );
}
