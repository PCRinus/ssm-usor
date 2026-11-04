import { createContext, use } from 'react';

// The note leads the email dialog, which opens where the support chat cannot.
export const ReportProblemContext = createContext<(note?: string) => Promise<void>>(() =>
  Promise.resolve()
);

export const useReportProblem = () => use(ReportProblemContext);
