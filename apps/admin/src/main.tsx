import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createAdminRuntime } from '@/app/admin-runtime';
import App from '@/app/App';
import { supabase } from '@/lib/supabase';

const runtime = createAdminRuntime(supabase?.auth ?? null);

if (import.meta.hot) {
  import.meta.hot.dispose(() => runtime.dispose());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App runtime={runtime} />
  </StrictMode>
);
