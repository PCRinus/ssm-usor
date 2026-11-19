import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SheetPage } from './employee-review-model';
import {
  choicePhoto,
  closedViewer,
  usePersonViewer,
  type Viewer,
  type ViewerAction,
  viewerReducer,
  viewerSpot,
  type ViewerState,
} from './use-person-viewer';

const pages = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as unknown as SheetPage[];
const highlight = { photos: ['p2'], caption: 'Subliniate' };

const photoViewer: Viewer = { photo: 'p1', mode: { kind: 'photo' }, spot: null };
const choiceViewer: Viewer = {
  photo: 'p1',
  mode: { kind: 'choice', field: 'cnp', queue: ['cnp', 'hiredAt'] },
  spot: null,
};
const open = (viewer: Viewer, more: Partial<ViewerState> = {}): ViewerState => ({
  ...closedViewer,
  viewer,
  ...more,
});

describe('the viewer state', () => {
  it('opens a photo with its spot and remembers it for the section on screen', () => {
    const state = viewerReducer(closedViewer, {
      type: 'show',
      photo: 'p2',
      section: 'data',
      spot: 'person.cnp',
      highlight: null,
      openChoices: ['cnp'],
    });
    expect(state.viewer).toEqual({
      photo: 'p2',
      mode: { kind: 'photo' },
      spot: { pageId: 'p2', target: 'person.cnp' },
    });
    expect(state.opened).toEqual({ section: 'data', photo: 'p2' });
  });

  it('opens a choice queued after the choices still open, and adds one not among them', () => {
    const show: ViewerAction = {
      type: 'show',
      photo: 'p1',
      section: 'decisions',
      highlight,
      openChoices: ['cnp', 'hiredAt'],
    };
    expect(viewerReducer(closedViewer, { ...show, choice: 'hiredAt' })).toMatchObject({
      viewer: { mode: { kind: 'choice', field: 'hiredAt', queue: ['cnp', 'hiredAt'] }, spot: null },
      highlight,
    });
    expect(viewerReducer(closedViewer, { ...show, choice: 'jobTitle' }).viewer?.mode).toEqual({
      kind: 'choice',
      field: 'jobTitle',
      queue: ['cnp', 'hiredAt', 'jobTitle'],
    });
  });

  it('keeps the queue of a choice already open over the choices still open', () => {
    const state = viewerReducer(open(choiceViewer), {
      type: 'show',
      photo: 'p2',
      section: 'decisions',
      choice: 'hiredAt',
      highlight: null,
      openChoices: ['jobTitle'],
    });
    expect(state.viewer?.mode).toEqual({
      kind: 'choice',
      field: 'hiredAt',
      queue: ['cnp', 'hiredAt'],
    });
  });

  it('stays on a choice when a page is shown without one', () => {
    const state = viewerReducer(open(choiceViewer), {
      type: 'show',
      photo: 'p3',
      section: 'data',
      spot: 'person.name',
      highlight: null,
      openChoices: [],
    });
    expect(state.viewer).toEqual({
      ...choiceViewer,
      photo: 'p3',
      spot: { pageId: 'p3', target: 'person.name' },
    });
  });

  it('moving to another photo clears the underlines of a photo, not those of a choice', () => {
    const move = { type: 'photo', photo: 'p2', section: 'data' } as const;
    const fromPhoto = viewerReducer(open(photoViewer, { highlight }), move);
    expect(fromPhoto.highlight).toBeNull();
    expect(fromPhoto.viewer?.photo).toBe('p2');
    const fromChoice = viewerReducer(open(choiceViewer, { highlight }), move);
    expect(fromChoice.highlight).toBe(highlight);
    expect(fromChoice.viewer).toEqual({ ...choiceViewer, photo: 'p2' });
  });

  it('a photo picked in the page strip with the viewer closed only rings it', () => {
    const state = viewerReducer(closedViewer, { type: 'photo', photo: 'p3', section: 'data' });
    expect(state).toEqual({ ...closedViewer, opened: { section: 'data', photo: 'p3' } });
  });

  it('closing clears the underlines and the typing, and keeps the photo ringed', () => {
    const opened = { section: 'data', photo: 'p1' };
    const state = viewerReducer(open(choiceViewer, { highlight, typing: true, opened }), {
      type: 'close',
    });
    expect(state).toEqual({ ...closedViewer, opened });
  });
});

describe('the box lit on a page', () => {
  const citing = (field: string) => (field === 'cnp' ? ['p1'] : []);

  it("lights the choice's field on a page that cites it, and nothing elsewhere", () => {
    expect(viewerSpot(choiceViewer, 'p1', citing)).toBe('person.cnp');
    expect(viewerSpot(choiceViewer, 'p2', citing)).toBeNull();
  });

  it('lights the spot asked for on its own page only', () => {
    const viewer = { ...photoViewer, spot: { pageId: 'p1', target: 'trainings[0]' } };
    expect(viewerSpot(viewer, 'p1', citing)).toBe('trainings[0]');
    expect(viewerSpot(viewer, 'p2', citing)).toBeNull();
    expect(viewerSpot(null, 'p1', citing)).toBeNull();
  });
});

describe('the photo a choice opens on', () => {
  it('stays on the photo shown when it cites the field', () => {
    expect(choicePhoto({ ...photoViewer, photo: 'p3' }, pages, ['p1', 'p3'], ['p1'])).toBe('p3');
  });

  it("opens the chosen option's first photo, else the first photo citing the field", () => {
    expect(choicePhoto(photoViewer, pages, ['p3', 'p2'], ['p3', 'p2'])).toBe('p2');
    expect(choicePhoto(null, pages, ['p3', 'p2'], undefined)).toBe('p2');
  });

  it('keeps the photo shown when no page cites the field', () => {
    expect(choicePhoto(photoViewer, pages, [], undefined)).toBe('p1');
    expect(choicePhoto(null, pages, [], undefined)).toBeUndefined();
  });
});

describe('the focus once the viewer closes', () => {
  afterEach(() => document.body.replaceChildren());

  const button = (id: string) => {
    const element = document.createElement('button');
    element.id = id;
    document.body.append(element);
    return element;
  };

  const closing = () => new Event('focusout', { cancelable: true });

  it('goes back to what opened it', () => {
    const opener = button('opener');
    opener.focus();
    const { result } = renderHook(() => usePersonViewer({ section: 'data', openChoices: [] }));
    act(() => result.current.show('p1', { highlight: null }));
    button('elsewhere').focus();
    act(() => result.current.close());
    const event = closing();
    result.current.giveFocusBack(event);
    expect(document.activeElement).toBe(opener);
    expect(event.defaultPrevented).toBe(true);
  });

  it('goes to the row the member asked for over the opener', () => {
    button('opener').focus();
    const row = button('match');
    const { result } = renderHook(() => usePersonViewer({ section: 'data', openChoices: [] }));
    act(() => result.current.show('p1', { highlight: null }));
    act(() => result.current.closeTo('match'));
    result.current.giveFocusBack(closing());
    expect(document.activeElement).toBe(row);
  });

  it('goes to the choice last open when its opener is gone', () => {
    const opener = button('opener');
    opener.focus();
    const choice = button('choice-hiredAt');
    const { result } = renderHook(() =>
      usePersonViewer({ section: 'decisions', openChoices: ['cnp'] })
    );
    act(() => result.current.show('p1', { choice: 'hiredAt', highlight: null }));
    opener.remove();
    act(() => result.current.close());
    result.current.giveFocusBack(closing());
    expect(document.activeElement).toBe(choice);
  });
});
