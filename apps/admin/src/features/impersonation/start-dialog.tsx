import {
  type AdminActiveImpersonation,
  adminImpersonationErrorReasons,
  type AdminMemberListItem,
  type ApiErrorResponse,
  maxImpersonationReasonLength,
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
import { Label } from '@ssm-usor/ui/components/label';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { type FormEvent, type RefObject, useState } from 'react';

import { ApiHttpError, isRefusedByApi } from '@/api/http';
import { ErrorNotice } from '@/components/error-notice';
import { roleLabels } from '@/features/members/api';

import {
  activeImpersonationKey,
  refreshImpersonations,
  startImpersonation,
  targetName,
  useActiveImpersonation,
} from './api';
import { memberAppUrl } from './member-app';
import { startInProgressReason } from './reasons';

const reasonRequired = 'Give the reason for acting as this member.';

const startKey = ['admin', 'impersonation', 'start'] as const;

const counterFrom = 400;

function refusalOf(error: Error): { reason?: string; general?: string } {
  if (isRefusedByApi(error)) {
    return { general: 'This account may not start an impersonation. Sign in again.' };
  }
  const body = error instanceof ApiHttpError ? (error.body as ApiErrorResponse | undefined) : null;
  if (body?.error === 'validation_error') {
    const reason = body.issues?.find((issue) => issue.path === 'reason');
    const other = body.issues?.find((issue) => issue.path !== 'reason');
    return {
      reason: reason
        ? `A reason of 1 to ${maxImpersonationReasonLength} characters is required.`
        : undefined,
      general:
        other || !reason ? 'The request was refused. Reload the page and try again.' : undefined,
    };
  }
  if (body?.reason === adminImpersonationErrorReasons.targetNotMember) {
    return {
      general: 'This account no longer belongs to an organization, so it cannot be acted as.',
    };
  }
  if (body?.reason === adminImpersonationErrorReasons.targetIsSelf) {
    return { general: 'This is your own account. Choose another member.' };
  }
  if (body?.reason === startInProgressReason) {
    return { general: 'A start is already in progress. Wait a moment and try again.' };
  }
  return { general: 'The impersonation could not be started. Check the connection and try again.' };
}

export function StartImpersonationDialog({
  member,
  onClose,
  opener,
}: {
  member: AdminMemberListItem | null;
  onClose: () => void;
  opener: RefObject<HTMLElement | null>;
}) {
  // Once sent, the start goes through whatever the dialog does; closing it then would open the
  // member app later, out of nowhere.
  const starting = useIsMutating({ mutationKey: startKey }) > 0;
  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && !starting && onClose()}>
      <DialogContent
        data-testid="start-impersonation"
        // Safari does not focus a button it clicks, so Radix would hand focus back to the body.
        onCloseAutoFocus={(event) => {
          if (!opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus();
        }}
      >
        {member && <StartForm key={member.userId} member={member} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function StartForm({ member, onClose }: { member: AdminMemberListItem; onClose: () => void }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const active = useActiveImpersonation();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const starting = useMutation({
    mutationKey: startKey,
    mutationFn: () =>
      startImpersonation({ targetUserId: member.userId, reason: reason.trim() }, apiRequest),
    onSuccess: (impersonation) => {
      queryClient.setQueryData<AdminActiveImpersonation>(activeImpersonationKey, {
        impersonation,
      });
      void refreshImpersonations(queryClient);
      window.open(memberAppUrl(), '_blank', 'noopener');
      onClose();
    },
  });

  const refusal = starting.error ? refusalOf(starting.error) : {};
  const reasonError = tried && !reason.trim() ? reasonRequired : refusal.reason;
  const replaced = active.data;
  const atLimit = reason.length >= maxImpersonationReasonLength;
  const describedBy =
    [
      reasonError && 'impersonation-reason-error',
      reason.length >= counterFrom && 'impersonation-reason-count',
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setTried(true);
      return;
    }
    starting.mutate();
  }

  function edit(value: string) {
    setReason(value);
    if (refusal.reason) starting.reset();
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Act as {member.fullName ?? member.email ?? 'this member'}</DialogTitle>
        <DialogDescription>
          The member app will treat your own sign-in as this member’s until you end it.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mt-4 space-y-4">
        <dl
          data-testid="start-impersonation-member"
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
        >
          <dt className="text-muted-foreground">Name</dt>
          <dd className="break-words">{member.fullName ?? '—'}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all">{member.email ?? '—'}</dd>
          <dt className="text-muted-foreground">Organization</dt>
          <dd className="break-words">{member.organization.name}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>{roleLabels[member.role]}</dd>
        </dl>
        <div className="space-y-1.5">
          <Label htmlFor="impersonation-reason">Reason</Label>
          <Textarea
            id="impersonation-reason"
            data-testid="impersonation-reason"
            value={reason}
            maxLength={maxImpersonationReasonLength}
            rows={3}
            className="max-h-40"
            required
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => edit(event.target.value)}
          />
          {reasonError && (
            <p
              id="impersonation-reason-error"
              data-testid="impersonation-reason-error"
              className="text-destructive text-sm"
            >
              {reasonError}
            </p>
          )}
          {reason.length >= counterFrom && (
            <p
              id="impersonation-reason-count"
              data-testid="impersonation-reason-count"
              aria-live={atLimit ? 'polite' : 'off'}
              className={atLimit ? 'text-sm font-medium' : 'text-muted-foreground text-sm'}
            >
              {atLimit
                ? `${maxImpersonationReasonLength} of ${maxImpersonationReasonLength} characters: the limit is reached, and nothing more is taken.`
                : `${reason.length} of ${maxImpersonationReasonLength} characters`}
            </p>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          It ends by itself after two hours, and starting and ending it are recorded in the audit
          log.
          {replaced && (
            <span data-testid="start-impersonation-replaces">
              {' '}
              It replaces the impersonation of {targetName(replaced.target)} in progress.
            </span>
          )}
        </p>
        {refusal.general && (
          <ErrorNotice testId="start-impersonation-error">{refusal.general}</ErrorNotice>
        )}
      </DialogBody>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" disabled={starting.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          data-testid="start-impersonation-submit"
          disabled={starting.isPending}
        >
          {starting.isPending ? 'Starting…' : 'Act as this member'}
        </Button>
      </DialogFooter>
    </form>
  );
}
