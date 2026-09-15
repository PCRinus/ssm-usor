import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { createAppRuntime } from './app-runtime';
import { supabase } from './lib/supabase';

const runtime = createAppRuntime(supabase?.auth ?? null);

if (import.meta.hot) {
  import.meta.hot.dispose(() => runtime.dispose());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App runtime={runtime} />
  </StrictMode>
);
