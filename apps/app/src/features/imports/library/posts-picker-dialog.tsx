import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { useState } from 'react';

import { Tag } from '../review-parts';
import type { LibraryPost } from './library-model';

export type UndecidedNote = { written: string; quotes: string[]; reasons: string[] };

export type PostsRequest = {
  key: string;
  title: string;
  selected: string[];
  themes: string[];
  // The instructions' words unless given.
  description?: string;
  resetLabel?: string;
};

export function PostsPickerDialog({
  request,
  posts,
  undecided,
  onSave,
  onClose,
}: {
  request: PostsRequest | null;
  posts: LibraryPost[];
  undecided: Map<string, UndecidedNote[]>;
  onSave: (key: string, posts: string[] | null) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      {request && (
        <PickerContent
          key={request.key}
          request={request}
          posts={posts}
          undecided={undecided}
          onSave={(chosen) => {
            onSave(request.key, chosen);
            onClose();
          }}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

function PickerContent({
  request,
  posts,
  undecided,
  onSave,
  onClose,
}: {
  request: PostsRequest;
  posts: LibraryPost[];
  undecided: Map<string, UndecidedNote[]>;
  onSave: (posts: string[] | null) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState(() => new Set(request.selected));
  const toggle = (id: string, checked: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const ordered = [
    ...posts.filter((post) => undecided.has(post.id)),
    ...posts.filter((post) => !undecided.has(post.id)),
  ];

  return (
    <DialogContent data-testid="library-posts-dialog" className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Posturile pentru „{request.title}”</DialogTitle>
        <DialogDescription>
          {request.description ??
            'Bifează posturile la care se aplică instrucțiunea. Posturile pe care tematica nu le-a putut decide sunt primele, cu ce scrie în tematică.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mt-4 grid max-h-[60svh] gap-2 overflow-y-auto pr-1">
        {ordered.length === 0 && (
          <p className="text-sm text-muted-foreground">Clientul nu are niciun post.</p>
        )}
        {ordered.map((post) => {
          const notes = undecided.get(post.id) ?? [];
          return (
            <label
              key={post.id}
              className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-3 rounded-md border px-3 py-2.5 text-sm hover:bg-muted/50"
              data-testid="library-post-option"
            >
              <Checkbox
                className="mt-0.5"
                checked={chosen.has(post.id)}
                onCheckedChange={(checked) => toggle(post.id, checked === true)}
                aria-label={post.name}
              />
              <span className="grid min-w-0 gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{post.name}</span>
                  {notes.length > 0 && <Tag tone="warning">Nedecis</Tag>}
                </span>
                {notes.map((note, index) => (
                  <span key={index} className="grid gap-0.5 text-[13px] text-muted-foreground">
                    {note.quotes.map((quote) => (
                      <q key={quote} className="wrap-anywhere">
                        {quote}
                      </q>
                    ))}
                    {note.reasons.map((reason) => (
                      <span key={reason} className="text-warning-foreground">
                        {reason}
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            </label>
          );
        })}
      </DialogBody>
      <DialogFooter className="mt-4">
        {!sameSet([...chosen], request.themes) && (
          <Button
            variant="ghost"
            className="sm:mr-auto"
            data-testid="library-posts-reset"
            onClick={() => onSave(null)}
          >
            {request.resetLabel ?? 'Ca în tematică'}
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          Renunță
        </Button>
        <Button
          data-testid="library-posts-save"
          onClick={() => {
            const next = posts.filter((post) => chosen.has(post.id)).map((post) => post.id);
            onSave(sameSet(next, request.themes) ? null : next);
          }}
        >
          Salvează
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
