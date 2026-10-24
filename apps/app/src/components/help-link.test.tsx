import { helpTopics } from '@ssm-usor/help-topics/topics';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureEvent } from '@/app/observability/posthog';
import { helpHref } from '@/lib/help';

import { Field, FieldMessage } from './form-field';
import { HelpLink } from './help-link';

vi.mock('@/app/observability/posthog', () => ({ captureEvent: vi.fn() }));

const topic = 'primii-pasi.deschide-ajutorul';
const { path, anchor } = helpTopics[topic];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(captureEvent).mockClear();
});

describe('helpHref', () => {
  it("points at the topic's page and heading on the help origin", () => {
    vi.stubEnv('VITE_HELP_URL', 'https://help.ssmusor.ro');
    expect(helpHref(topic)).toBe(`https://help.ssmusor.ro${path}#${anchor}`);
    expect(helpHref()).toBe('https://help.ssmusor.ro/');
  });

  it('uses the help dev server in development', () => {
    vi.stubEnv('VITE_HELP_URL', undefined);
    expect(helpHref(topic)).toBe(`http://localhost:4331${path}#${anchor}`);
  });
});

describe('Field', () => {
  it('links its label to the topic in the help tab', () => {
    render(
      <Field id="cnp" label="CNP" mark="optional" help={topic}>
        <input id="cnp" />
      </Field>
    );
    const link = screen.getByRole('link', { name: 'Ajutor: CNP' });
    expect(link.getAttribute('href')).toBe(helpHref(topic));
    expect(link.getAttribute('target')).toBe('ssm-usor-ajutor');
    expect(link.getAttribute('title')).toBe('Ajutor: CNP');
    expect(link.getAttribute('rel')).toBeNull();
    expect(screen.getByLabelText(/^CNP/)).toBe(document.getElementById('cnp'));
  });

  it('has no help link without a topic', () => {
    render(
      <Field id="cnp" label="CNP">
        <input id="cnp" />
      </Field>
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('adds one tab stop before the control and reports the opening', async () => {
    const user = userEvent.setup();
    render(
      <Field id="cnp" label="CNP" help={topic}>
        <input id="cnp" />
      </Field>
    );
    const link = screen.getByRole('link', { name: 'Ajutor: CNP' });
    link.addEventListener('click', (event) => event.preventDefault());
    await user.tab();
    expect(document.activeElement).toBe(link);
    await user.tab();
    expect(document.activeElement).toBe(document.getElementById('cnp'));
    await user.click(link);
    expect(captureEvent).toHaveBeenCalledWith('help_opened', { topic });
  });

  it('ends a message with "De ce?" when the rule has a topic', () => {
    render(
      <Field
        id="cnp"
        label="CNP"
        error={{ type: 'custom', message: 'CNP invalid.' }}
        errorHelp={topic}
      >
        <input id="cnp" />
      </Field>
    );
    const message = screen.getByRole('alert');
    expect(message.textContent).toBe('CNP invalid. De ce?');
    expect(screen.getByRole('link', { name: 'De ce?' }).getAttribute('href')).toBe(helpHref(topic));
  });
});

describe('FieldMessage', () => {
  it('shows the message alone without a topic', () => {
    render(<FieldMessage id="cnp-error" error={{ type: 'custom', message: 'CNP invalid.' }} />);
    expect(screen.getByRole('alert').textContent).toBe('CNP invalid.');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('HelpLink', () => {
  it('is an icon named by its label', () => {
    render(<HelpLink topic={topic} label="Ajutor: Contact" />);
    const link = screen.getByRole('link', { name: 'Ajutor: Contact' });
    expect(link.getAttribute('href')).toBe(helpHref(topic));
    expect(link.getAttribute('target')).toBe('ssm-usor-ajutor');
    expect(link.querySelector('svg')).not.toBeNull();
  });

  it('is inline text with children', async () => {
    const user = userEvent.setup();
    render(<HelpLink topic={topic}>Află mai mult</HelpLink>);
    const link = screen.getByRole('link', { name: 'Află mai mult' });
    expect(link.getAttribute('aria-label')).toBeNull();
    expect(link.getAttribute('target')).toBe('ssm-usor-ajutor');
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    expect(captureEvent).toHaveBeenCalledWith('help_opened', { topic });
  });

  it('renders nothing when the build has no help address', () => {
    vi.stubEnv('VITE_HELP_URL', undefined);
    vi.stubEnv('DEV', false);
    const { container } = render(<HelpLink topic={topic} label="Ajutor" />);
    expect(container.innerHTML).toBe('');
  });
});
