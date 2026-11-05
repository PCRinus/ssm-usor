// Two processes: Vite for the pages, and the Worker under `wrangler dev`, the only place the
// API's Admin entrypoint can be reached from. Vite sends `/api` on to it (vite.config.ts).

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import process from 'node:process';

// Wrangler refuses to start while the assets directory is missing, as it is before a build.
mkdirSync(new URL('../dist', import.meta.url), { recursive: true });

const children = [
  // Without --local-upstream, wrangler dev rewrites request.url to the route's host, and the
  // Worker honours ACCESS_CHECK=off only on localhost.
  spawn(
    'wrangler',
    ['dev', '--port', '8794', '--inspector-port', '9243', '--local-upstream', 'localhost:8794'],
    { stdio: 'inherit' }
  ),
  spawn('vite', ['--port', '5176', '--strictPort'], { stdio: 'inherit' }),
];

function stop(code) {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  process.exitCode = code;
}

for (const child of children) {
  child.on('exit', (code) => stop(code ?? 1));
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
