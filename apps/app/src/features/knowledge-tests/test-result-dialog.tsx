import { zodResolver } from '@hookform/resolvers/zod';
import {
  type KnowledgeTest,
  knowledgeTestCodeOf,
  knowledgeTestLabels,
  knowledgeTestSchema,
  testResultMaterial,
  type TrainingDomain,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import {
  type EmployeeTestsResponse,
  getGetTrainingProposalQueryKey,
  useGetTrainingProposal,
  useRecordPaperTestResult,
  useUpdateTestResult,
} from '@/api/generated/api';
import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { todayIso } from '@/features/employees/employee-format';
import { invalidateSignatures } from '@/features/signatures/signature-queries';

import { invalidateEmployeeTests, testFailure } from './test-format';

export type TestResult = EmployeeTestsResponse['ssm']['results'][number];

export type TestResultTarget =
  | { kind: 'paper'; tests: readonly KnowledgeTest[] }
  | { kind: 'examiner'; result: TestResult }
  | null;

const resultFormSchema = z.object({
  test: knowledgeTestSchema,
  takenOn: z
    .string()
    .min(1, 'Alege ziua în care a susținut testul.')
    .refine((value) => value <= todayIso(), 'Ziua testului nu poate fi în viitor.'),
  examinerName: z
    .string()
    .trim()
    .min(1, 'Scrie numele examinatorului.')
    .max(160, 'Numele are cel mult 160 de caractere.'),
  examinerJobTitle: z
    .string()
    .trim()
    .min(1, 'Scrie funcția examinatorului.')
    .max(160, 'Funcția are cel mult 160 de caractere.'),
});

type ResultFormValues = z.infer<typeof resultFormSchema>;

interface Examiner {
  name: string;
  jobTitle: string | null;
}

export function TestResultDialog({
  clientId,
  employeeId,
  userId,
  domain,
  target,
  onClose,
}: {
  clientId: string;
  employeeId: string;
  userId: string;
  domain: TrainingDomain;
  target: TestResultTarget;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target && (
        <ProposedExaminer
          key={target.kind === 'examiner' ? target.result.id : 'paper'}
          clientId={clientId}
          userId={userId}
          domain={domain}
          skip={target.kind === 'examiner' && target.result.examiner !== null}
        >
          {(proposed) => (
            <ResultForm
              clientId={clientId}
              employeeId={employeeId}
              domain={domain}
              target={target}
              proposed={proposed}
              onClose={onClose}
            />
          )}
        </ProposedExaminer>
      )}
    </Dialog>
  );
}

// The examiner is who gives the introductory general training (ADR 024): the proposal names the
// specialist for occupational safety and the fire-safety technician for fire safety.
function ProposedExaminer({
  clientId,
  userId,
  domain,
  skip,
  children,
}: {
  clientId: string;
  userId: string;
  domain: TrainingDomain;
  skip: boolean;
  children: (proposed: Examiner | null) => ReactNode;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = { domain, phase: 'introductory_general', heldOn: todayIso() } as const;
  const proposal = useGetTrainingProposal(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getGetTrainingProposalQueryKey(clientId, params), userId],
      enabled: !skip && Boolean(apiRequest.baseUrl),
      retry: false,
    },
  });
  if (!skip && proposal.isLoading) {
    return (
      <DialogContent className="sm:max-w-lg" aria-busy="true">
        <DialogHeader>
          <DialogTitle>Se pregătește formularul…</DialogTitle>
          <DialogDescription className="sr-only">Se încarcă examinatorul propus.</DialogDescription>
        </DialogHeader>
        <Skeleton className="h-40 w-full" />
      </DialogContent>
    );
  }
  return children(skip ? null : (proposal.data?.trainer ?? null));
}

function ResultForm({
  clientId,
  employeeId,
  domain,
  target,
  proposed,
  onClose,
}: {
  clientId: string;
  employeeId: string;
  domain: TrainingDomain;
  target: NonNullable<TestResultTarget>;
  proposed: Examiner | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const record = useRecordPaperTestResult({ request: apiRequest });
  const update = useUpdateTestResult({ request: apiRequest });
  const result = target.kind === 'examiner' ? target.result : null;
  const examiner = result?.examiner ?? proposed;
  const form = useForm<ResultFormValues>({
    resolver: zodResolver(resultFormSchema),
    defaultValues: {
      test: result?.test ?? (target.kind === 'paper' ? target.tests[0] : 'hiring'),
      takenOn: result?.takenOn ?? todayIso(),
      examinerName: examiner?.name ?? '',
      examinerJobTitle: examiner?.jobTitle ?? '',
    },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = record.isPending || update.isPending;
  const test = useWatch({ control: form.control, name: 'test' });
  const tests = target.kind === 'paper' ? target.tests : [];

  const onSubmit = form.handleSubmit(async (values) => {
    const examinerValue = { name: values.examinerName, jobTitle: values.examinerJobTitle };
    try {
      if (result) {
        await update.mutateAsync({
          clientId,
          employeeId,
          resultId: result.id,
          data: { examiner: examinerValue },
        });
      } else {
        await record.mutateAsync({
          clientId,
          employeeId,
          data: {
            domain,
            test: values.test,
            takenOn: values.takenOn,
            grade: 'admis',
            examiner: examinerValue,
          },
        });
      }
      await Promise.all([
        invalidateEmployeeTests(queryClient, clientId, employeeId),
        // A new examiner voids the pending request on the test sheet and is asked in its place.
        ...(result ? [invalidateSignatures(queryClient, clientId)] : []),
      ]);
      toast.success(result ? 'Examinatorul a fost salvat.' : 'Rezultatul a fost înregistrat.');
      onClose();
    } catch (cause) {
      form.setError('root.server', {
        message: testFailure(
          cause,
          'Nu am putut salva rezultatul. Verifică conexiunea și încearcă din nou.'
        ),
      });
    }
  });

  return (
    <DialogContent data-testid="test-result-dialog" className="sm:max-w-lg">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {result ? 'Modifică examinatorul' : 'Înregistrează un rezultat de pe hârtie'}
          </DialogTitle>
          <DialogDescription>
            {result
              ? 'Examinatorul apare în fișa individuală, în rândul rezultatului.'
              : 'Pentru un test completat pe exemplarul tipărit și promovat. Un test nepromovat nu se înregistrează: contează susținerea următoare.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          {!result && (
            <>
              <Field id="test-result-test" label="Testul" mark="required">
                {tests.length > 1 ? (
                  <NativeSelect
                    id="test-result-test"
                    data-testid="test-result-test"
                    disabled={busy}
                    {...form.register('test')}
                  >
                    {tests.map((each) => (
                      <NativeSelectOption key={each} value={each}>
                        {knowledgeTestLabels[each]} ({knowledgeTestCodeOf(domain, each)})
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    id="test-result-test"
                    data-testid="test-result-test"
                    readOnly
                    value={`${knowledgeTestLabels[test]} (${knowledgeTestCodeOf(domain, test)})`}
                  />
                )}
              </Field>
              <p className="-mt-2 text-xs text-muted-foreground">
                Materialul examinat: {testResultMaterial(domain, test)}. Calificativ: admis.
              </p>
              <Field
                id="test-result-taken-on"
                label="Ziua testului"
                mark="required"
                error={errors.takenOn}
              >
                <Controller
                  control={form.control}
                  name="takenOn"
                  render={({ field }) => (
                    <DatePicker
                      id="test-result-taken-on"
                      testId="test-result-taken-on"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      max={todayIso()}
                      disabled={busy}
                      invalid={Boolean(errors.takenOn)}
                      describedBy={errors.takenOn ? 'test-result-taken-on-error' : undefined}
                      required
                    />
                  )}
                />
              </Field>
            </>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="test-result-examiner-name"
              label="Examinatorul"
              mark="required"
              error={errors.examinerName}
            >
              <Input
                id="test-result-examiner-name"
                data-testid="test-result-examiner-name"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.examinerName)}
                aria-describedby={
                  errors.examinerName ? 'test-result-examiner-name-error' : undefined
                }
                {...form.register('examinerName')}
              />
            </Field>
            <Field
              id="test-result-examiner-job-title"
              label="Funcția"
              mark="required"
              error={errors.examinerJobTitle}
            >
              <Input
                id="test-result-examiner-job-title"
                data-testid="test-result-examiner-job-title"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.examinerJobTitle)}
                aria-describedby={
                  errors.examinerJobTitle ? 'test-result-examiner-job-title-error' : undefined
                }
                {...form.register('examinerJobTitle')}
              />
            </Field>
          </div>
          {errors.root?.server && (
            <Notice variant="destructive" data-testid="test-result-error">
              {errors.root.server.message}
            </Notice>
          )}
        </DialogBody>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="test-result-submit" disabled={busy}>
            {busy ? 'Se salvează…' : result ? 'Salvează' : 'Înregistrează rezultatul'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
