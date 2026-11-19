import { useCallback, useReducer, useRef } from 'react';

import type { FieldName, SheetPage } from './employee-review-model';
import { orderedPhotos } from './person-sections';
import { fieldTarget } from './spot-targets';
import type { Highlight } from './viewer-aside';

export type Viewer = {
  photo: string;
  mode: { kind: 'photo' } | { kind: 'choice'; field: FieldName; queue: FieldName[] };
  spot: { pageId: string; target: string } | null;
};

export type ViewerState = {
  viewer: Viewer | null;
  highlight: Highlight | null;
  typing: boolean;
  // The photo last opened, by the section on screen then, which the page strip rings.
  opened: { section: string; photo: string } | null;
};

export type ViewerAction =
  | {
      type: 'show';
      photo: string;
      section: string;
      choice?: FieldName;
      spot?: string | null;
      highlight: Highlight | null;
      openChoices: FieldName[];
    }
  | { type: 'photo'; photo: string; section: string }
  | { type: 'highlight'; highlight: Highlight | null }
  | { type: 'typing'; typing: boolean }
  | { type: 'close' };

export const closedViewer: ViewerState = {
  viewer: null,
  highlight: null,
  typing: false,
  opened: null,
};

function shown(current: Viewer | null, action: Extract<ViewerAction, { type: 'show' }>): Viewer {
  const { photo, choice, spot } = action;
  if (choice) {
    const queue = current?.mode.kind === 'choice' ? current.mode.queue : action.openChoices;
    return {
      photo,
      mode: {
        kind: 'choice',
        field: choice,
        queue: queue.includes(choice) ? queue : [...queue, choice],
      },
      spot: null,
    };
  }
  return {
    photo,
    mode: current?.mode ?? { kind: 'photo' },
    spot: spot ? { pageId: photo, target: spot } : null,
  };
}

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'show':
      return {
        ...state,
        viewer: shown(state.viewer, action),
        highlight: action.highlight,
        opened: { section: action.section, photo: action.photo },
      };
    case 'photo':
      return {
        ...state,
        viewer: state.viewer ? { ...state.viewer, photo: action.photo } : null,
        highlight: state.viewer?.mode.kind === 'photo' ? null : state.highlight,
        opened: { section: action.section, photo: action.photo },
      };
    case 'highlight':
      return { ...state, highlight: action.highlight };
    case 'typing':
      return { ...state, typing: action.typing };
    case 'close':
      return { ...state, viewer: null, highlight: null, typing: false };
  }
}

export function viewerSpot(
  viewer: Viewer | null,
  pageId: string,
  citing: (field: FieldName) => string[]
) {
  if (viewer?.mode.kind === 'choice') {
    const { field } = viewer.mode;
    return citing(field).includes(pageId) ? fieldTarget(field) : null;
  }
  return viewer?.spot?.pageId === pageId ? viewer.spot.target : null;
}

export function choicePhoto(
  viewer: Viewer | null,
  pages: SheetPage[],
  cited: string[],
  chosen: string[] | undefined
) {
  return (
    (viewer && cited.includes(viewer.photo) ? viewer.photo : null) ??
    orderedPhotos(pages, chosen ?? cited)[0] ??
    viewer?.photo
  );
}

export function usePersonViewer({
  section,
  openChoices,
}: {
  section: string;
  openChoices: FieldName[];
}) {
  const [state, dispatch] = useReducer(viewerReducer, closedViewer);
  const opener = useRef<HTMLElement | null>(null);
  const focusAfter = useRef<string | null>(null);
  const lastChoice = useRef<FieldName | null>(null);
  const { viewer } = state;

  const show = (
    photo: string,
    opening: { choice?: FieldName; spot?: string | null; highlight: Highlight | null }
  ) => {
    if (viewer === null && document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
    dispatch({ type: 'show', photo, section, openChoices, ...opening });
  };

  const showPhoto = (photo: string) => dispatch({ type: 'photo', photo, section });

  const close = () => {
    lastChoice.current = viewer?.mode.kind === 'choice' ? viewer.mode.field : null;
    dispatch({ type: 'close' });
  };

  const closeTo = (target: string) => {
    focusAfter.current = target;
    close();
  };

  const giveFocusBack = (event: Event) => {
    const after = focusAfter.current;
    focusAfter.current = null;
    const choice = lastChoice.current;
    lastChoice.current = null;
    const target =
      (after ? document.getElementById(after) : null) ??
      (opener.current?.isConnected ? opener.current : null) ??
      (choice ? document.getElementById(`choice-${choice}`) : null) ??
      document.querySelector<HTMLElement>('[data-testid="person-decisions"] [role="group"]') ??
      document.querySelector<HTMLElement>('[data-testid="person-strip"] [aria-current="true"]');
    opener.current = null;
    if (!target) return;
    event.preventDefault();
    if (after) target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  };

  const setHighlight = useCallback(
    (highlight: Highlight | null) => dispatch({ type: 'highlight', highlight }),
    []
  );
  const setTyping = useCallback((typing: boolean) => dispatch({ type: 'typing', typing }), []);

  return {
    ...state,
    show,
    showPhoto,
    close,
    closeTo,
    giveFocusBack,
    setHighlight,
    setTyping,
  };
}
