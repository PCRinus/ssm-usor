import { createAuthContext } from '@ssm-usor/spa-runtime/auth-context';

import type { AuthStore } from './auth-store';

export const { AuthContext, useAuth } = createAuthContext<AuthStore>();
