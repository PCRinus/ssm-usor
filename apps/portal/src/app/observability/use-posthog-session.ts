import { useLocation } from '@tanstack/react-router';
import type { PostHog } from 'posthog-js';
import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/auth-context';
import type { Participation } from '@/features/participation/participation-context';

import { loadPostHog, stopPostHog } from './posthog';

export function usePostHogSession(participation: Participation | null) {
  const { session } = useAuth();
  const href = useLocation({ select: (location) => location.href });
  const userId = session?.user.id;
  const email = session?.user.email || undefined;
  const phone = session?.user.phone || undefined;
  const name = participation?.fullName;
  const kind = participation?.kind;
  const clientId = participation?.clientId;
  const clientName = participation?.clientName;
  const organizationName = participation?.organizationName;
  const [client, setClient] = useState<PostHog | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void loadPostHog()
      .then((posthog) => {
        if (!posthog) return;
        if (!active) {
          stopPostHog(posthog);
          return;
        }
        posthog.opt_in_capturing({ captureEventName: false });
        posthog.startSessionRecording(true);
        setClient(posthog);
      })
      .catch(() => {});
    return () => {
      active = false;
      void loadPostHog()
        .then((posthog) => {
          if (posthog) stopPostHog(posthog);
        })
        .catch(() => {});
      setClient(null);
    };
  }, [userId]);

  useEffect(() => {
    if (!client || !userId) return;
    client.identify(userId, { name, email, phone });
    if (clientId) {
      client.group('client', clientId, { name: clientName, organization_name: organizationName });
      client.register({ participant_kind: kind, organization_name: organizationName });
    } else {
      client.resetGroups();
      client.unregister('participant_kind');
      client.unregister('organization_name');
    }
  }, [client, userId, name, email, phone, kind, clientId, clientName, organizationName]);

  useEffect(() => {
    if (!client) return;
    client.capture('$pageview', { $current_url: new URL(href, window.location.origin).href });
  }, [client, href]);
}
