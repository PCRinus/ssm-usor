import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from '@/app/App';
import { activateLocale, sourceLocale } from '@/app/i18n';
import { createPortalRuntime } from '@/app/portal-runtime';
import { supabase } from '@/lib/supabase';

activateLocale(sourceLocale);

const runtime = createPortalRuntime(supabase?.auth ?? null);

if (import.meta.hot) {
  import.meta.hot.dispose(() => runtime.dispose());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App runtime={runtime} />
  </StrictMode>
);
