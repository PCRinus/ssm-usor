import { createContext } from 'react';

import type { FieldName } from './employee-review-model';

export type ShowPage = (pageId: string, choice?: FieldName) => void;

export const ShowPageContext = createContext<ShowPage>(() => undefined);

export const ViewedPhotoContext = createContext<string | null>(null);
