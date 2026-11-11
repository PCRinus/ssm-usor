import { createContext } from 'react';

import type { FieldName } from './employee-review-model';

// The field of a choice whose photo numbers were pressed, so the large photo opens beside it.
export type ShowPage = (pageId: string, choice?: FieldName) => void;

export const ShowPageContext = createContext<ShowPage>(() => undefined);

export const ViewedPhotoContext = createContext<string | null>(null);
