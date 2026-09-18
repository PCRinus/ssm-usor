import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import { useAuth } from './auth-context';
import { loginErrorMessage } from './auth-errors';
import { loginSchema, type LoginValues } from './login-schema';

// With an invitation token, a successful login returns to the accept page.
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

  return { ...form, onSubmit };
}
