import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { useForm } from 'react-hook-form';

import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';

import type { ProfileNaming } from './profile-naming';
import {
  isProfileNameTaken,
  profileFailure,
  profileNameFormSchema,
  type ProfileNameFormValues,
  profileNameTaken,
} from './profile-schema';

export function ProfileNameDialog({
  naming,
  onClose,
}: {
  naming: ProfileNaming | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={naming !== null} onOpenChange={(open) => !open && onClose()}>
      {naming && <ProfileNameForm naming={naming} onClose={onClose} />}
    </Dialog>
  );
}

function ProfileNameForm({ naming, onClose }: { naming: ProfileNaming; onClose: () => void }) {
  const form = useForm<ProfileNameFormValues>({
    resolver: zodResolver(profileNameFormSchema),
    defaultValues: { name: naming.defaultName },
  });
  const formRef = useRevealErrors(form);
  const { errors, isSubmitting: busy } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name }) => {
    try {
      await naming.submit(name);
      onClose();
    } catch (cause) {
      if (isProfileNameTaken(cause)) {
        form.setError('name', { message: profileNameTaken });
        return;
      }
      form.setError('root.server', { message: profileFailure(cause, naming.failure) });
    }
  });

  return (
    <DialogContent data-testid="profile-name-dialog" className="sm:max-w-lg">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>{naming.title}</DialogTitle>
          <DialogDescription>{naming.description}</DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5">
          <Field id="profile-name" label="Denumirea profilului" mark="required" error={errors.name}>
            <Input
              id="profile-name"
              data-testid="profile-name"
              autoComplete="off"
              placeholder="Lucrător de birou, Șofer, Lucrător în atelier…"
              disabled={busy}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'profile-name-error' : undefined}
              {...form.register('name')}
            />
          </Field>
          {errors.root?.server && (
            <Notice variant="destructive" data-testid="profile-name-error-notice">
              {errors.root.server.message}
            </Notice>
          )}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="profile-name-submit" disabled={busy}>
            {busy ? naming.pendingLabel : naming.submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
