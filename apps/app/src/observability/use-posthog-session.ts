import { useLocation, useRouteContext } from '@tanstack/react-router';
import type { PostHog } from 'posthog-js';
import { useCallback, useEffect, useState } from 'react';

import type { MeResponse } from '../api/generated/api';
import { getSupportIdentity } from '../api/generated/api';
import { useAuth } from '../auth/auth-context';
import { loadPostHog, openSupportChat, stopPostHog } from './posthog';

export function usePostHogSession(me: MeResponse | undefined) {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const href = useLocation({ select: (location) => location.href });
  const userId = session?.user.id;
  const organizationId = me?.membership?.organization.id;
  const organizationName = me?.membership?.organization.name;
  const role = me?.membership?.role;
  const name = me?.profile?.fullName;
  const email = me?.user.email;
  const targetMemberId = me?.impersonation?.targetMemberId;
  const targetOrganizationId = me?.impersonation?.targetOrganizationId;
  const [client, setClient] = useState<PostHog | null>(null);
  const [supportReady, setSupportReady] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId || !organizationId) return;
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
      setSupportReady(false);
      setUnreadCount(0);
    };
  }, [userId, organizationId]);

  useEffect(() => {
    if (!client || !userId || !organizationId) return;
    const impersonating = Boolean(targetMemberId);
    client.identify(userId, {
      $name: name,
      $email: email,
      role: impersonating ? 'platform_admin' : role,
      ...(!impersonating && { organization_id: organizationId }),
    });
    if (impersonating) {
      client.resetGroups();
    } else {
      client.unregister('target_member_id');
      client.unregister('target_organization_id');
      client.group('organization', organizationId, { name: organizationName });
    }
    client.register({
      is_impersonating: impersonating,
      ...(impersonating && {
        target_member_id: targetMemberId,
        target_organization_id: targetOrganizationId,
      }),
    });
  }, [
    client,
    userId,
    organizationId,
    organizationName,
    role,
    name,
    email,
    targetMemberId,
    targetOrganizationId,
  ]);

  useEffect(() => {
    if (!client) return;
    client.capture('$pageview', { $current_url: new URL(href, window.location.origin).href });
  }, [client, href]);

  useEffect(() => {
    if (!client || !userId) return;
    let active = true;
    void getSupportIdentity({ ...apiRequest })
      .then(({ distinctId, hash }) => {
        if (!active || distinctId !== userId) return;
        client.setIdentity(distinctId, hash);
        setSupportReady(true);
      })
      .catch(() => {
        if (active) setSupportReady(false);
      });
    return () => {
      active = false;
    };
  }, [client, userId, apiRequest]);

  useEffect(() => {
    if (!client || !supportReady) return;
    let active = true;
    async function refresh() {
      if (!client?.conversations.isAvailable()) return;
      try {
        const tickets = await client.conversations.getTickets({ limit: 100 });
        if (active)
          setUnreadCount(
            tickets?.results.reduce((sum, ticket) => sum + (ticket.unread_count ?? 0), 0) ?? 0
          );
      } catch {
        if (active) setUnreadCount(0);
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const onVisibilityChange = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [client, supportReady]);

  const openSupport = useCallback(async () => {
    if (!client || !supportReady) return false;
    const opened = await openSupportChat(client);
    if (opened) setUnreadCount(0);
    return opened;
  }, [client, supportReady]);

  return { openSupport, unreadCount };
}
