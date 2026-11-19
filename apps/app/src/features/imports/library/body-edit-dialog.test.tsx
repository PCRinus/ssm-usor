import type { InstructionBody } from '@ssm-usor/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BodyEditDialog, type BodyRequest } from './body-edit-dialog';

const article = (text: string) => ({ kind: 'article' as const, paragraphs: [text] });

const requestFor = (body: InstructionBody): BodyRequest => ({
  key: 'ladders',
  title: 'Scări metalice',
  domain: 'ssm',
  category: 'work_equipment',
  body,
  original: body,
  clientNames: [],
});

async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole('button', { name: 'Lipește text' }));
  const dialog = await screen.findByTestId('paste-dialog');
  await user.click(within(dialog).getByTestId('paste-text'));
  await user.paste(text);
  return dialog;
}

describe('the body edit dialog of an imported instruction', () => {
  it('adds pasted articles after the text already there, leaving out an empty article', async () => {
    const onSave = vi.fn();
    render(
      <BodyEditDialog
        request={requestFor({
          blocks: [article('Scara se verifică.'), article('Scara se curăță.')],
        })}
        onSave={onSave}
        onClose={() => {}}
      />
    );
    const user = userEvent.setup();
    await user.clear(screen.getAllByTestId('instruction-article-text')[1]!);

    const dialog = await paste(user, 'Art. 1. Scara se depozitează la adăpost.');
    expect(within(dialog).getByTestId('paste-replace').textContent).toBe('Înlocuiește textul');
    await user.click(await within(dialog).findByTestId('paste-append'));
    await user.click(screen.getByTestId('library-body-save'));

    expect(onSave).toHaveBeenCalledWith('ladders', {
      blocks: [article('Scara se verifică.'), article('Scara se depozitează la adăpost.')],
    });
  });

  it('offers only to add the pasted articles to a text with no article written', async () => {
    render(
      <BodyEditDialog request={requestFor({ blocks: [] })} onSave={() => {}} onClose={() => {}} />
    );
    const dialog = await paste(userEvent.setup(), 'Art. 1. Scara se verifică.');
    await within(dialog).findByTestId('paste-summary');
    expect(within(dialog).queryByTestId('paste-append')).toBeNull();
    expect(within(dialog).getByTestId('paste-replace').textContent).toBe('Adaugă articolele');
  });
});
