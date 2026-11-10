import { createContext, use } from 'react';

// The note leads the email dialog, which opens where the support chat cannot. Null outside
// the signed-in shell, where neither the chat nor the shell's dialog exists.
export const ReportProblemContext = createContext<((note?: string) => Promise<void>) | null>(null);

const reportNothing = () => Promise.resolve();

export const useReportProblem = () => use(ReportProblemContext) ?? reportNothing;

export const useShellReportProblem = () => use(ReportProblemContext);
