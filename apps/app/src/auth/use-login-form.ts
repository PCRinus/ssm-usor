import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import { useAuth } from './auth-context';
import { loginErrorMessage } from './auth-errors';
import { loginSchema, type LoginValues } from './login-schema';

export function useLoginForm(invitation?: string) {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    try {
      await auth.signIn(email, password);
      form.reset();
      await navigate(
        invitation
          ? { to: '/accept-invitation', search: { token: invitation }, replace: true }
          : { to: '/dashboard', replace: true }
      );
    } catch (cause) {
      form.setError('root.auth', { message: loginErrorMessage(cause) });
    }
  });

  // Return the form itself, never a spread copy. `useForm` hands back one stable object
  // and swaps its `formState` on every render; the React Compiler would memoize a copy on
  // that stable identity and freeze the first `formState`, so errors and the submitting
  // state would never reach the page. Read `form.formState` while rendering instead.
  return { form, onSubmit };
}
