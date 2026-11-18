import type { AppRuntime } from '@/app/app-runtime';

export const runtimes: AppRuntime[] = [];

export function disposeRuntimes() {
  runtimes.splice(0).forEach((runtime) => runtime.dispose());
}
