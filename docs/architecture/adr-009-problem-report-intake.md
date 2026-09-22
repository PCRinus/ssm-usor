# ADR 009: Keep problem reports private until they become engineering work

- Status: accepted
- Date: 2026-09-22

## Context

Members may describe incorrect app behavior and may include client or employee data while doing so. The repository and its GitHub issues are public. Creating a GitHub issue from every report would publish unreviewed text and turn questions or duplicate reports into engineering tasks.

## Decision

Signed-in members submit problem reports through a dedicated “Raportează o problemă” entry in the sidebar footer, directly above the account menu. It opens PostHog's built-in Support widget over the current page. Owners and specialists both see the entry. The default floating PostHog launcher is hidden; unread replies appear as a badge on the sidebar entry. The pilot accepts the widget's fixed English labels, uses SSM Ușor's primary color, greets members with “Bună! Descrie pe scurt ce nu a funcționat și ce te așteptai să se întâmple. Vei vedea răspunsul nostru aici.”, and uses “Scrie mesajul tău...” as the message placeholder. It does not add a warning about sensitive details or promise a response time. The first version covers UI problems and other visible app behavior; concerns about generated document content remain outside this flow. Session replay provides visual context, so the initial report flow has no custom screenshot or file attachments. The maintainer investigates and replies in the private Support inbox. When a report identifies a specific fix, the maintainer manually creates a separate GitHub issue containing only information suitable for the public repository. Questions and feature ideas are outside the problem-report flow. Reporting access problems without signing in is deferred to [issue #178](https://github.com/PCRinus/ssm-usor/issues/178).

The initial PostHog integration identifies members and organizations and enables page views, autocaptured interactions, masked session replay, JavaScript error tracking, and Support. For an authenticated member, PostHog receives the member UUID, name, email address, role, organization UUID, and organization name. Client names, employee information, document contents, and form values do not become event properties. Sending this limited member and organization identity is a deliberate exception to the product's default rule against personal data in analytics because it is needed to investigate reports and contact the reporter. Custom business events, surveys, feature flags, and elaborate dashboards follow only when a concrete need appears. Production and development/staging use separate PostHog Cloud EU projects; local tracking stays disabled unless a developer supplies the development token.

PostHog starts only inside the authenticated application. Login, invitation acceptance, email confirmation, and password recovery routes are excluded because their URLs can contain access tokens. Authenticated URLs are captured without modification so record identifiers and ordinary query parameters remain available during investigation. During impersonation, the platform administrator remains the PostHog identity; events also carry an impersonation flag plus the target member and organization UUIDs. This keeps administrative support activity out of the impersonated member's behavioral history. The problem-report entry remains available during impersonation, and a submitted ticket identifies the administrator as its reporter while retaining the impersonation context.

Session replay may record request URLs, methods, response statuses, and timing. Request and response bodies and headers remain disabled explicitly, as does general console recording. The browser integration captures unhandled JavaScript errors and promise rejections, and production source maps are uploaded so those errors can be traced to source code. Console errors are not promoted to tracked exceptions in the initial integration.

Record all eligible app sessions initially, with client, employee, and document content masked in replays. Once a member is authenticated, analytics, error tracking, replay, and Support load together without a consent or opt-out flow. This is acceptable only while the maintainer is the remote environment's sole user. [Issue #179](https://github.com/PCRinus/ssm-usor/issues/179) is a release gate before inviting an external user and records the deferred consent work.

Update the public terms and privacy notice to describe the PostHog processing. Registration, owner onboarding, and invitation acceptance keep their current UI and continue linking to those pages; the recorded terms version changes when the revised terms take effect.

Retain session replays for 30 days, analytics events and error data for 12 months, and resolved Support conversations for 12 months after resolution. Confirm that the selected PostHog plan and project settings can enforce these periods before publishing them in the privacy notice. Prioritize reports by their impact. If the widget cannot open, offer `contact@ssmusor.ro` as the fallback on the app error page. A conversation finishes when the maintainer marks it resolved in PostHog Support.

## Consequences

Support tickets and GitHub issues have different purposes and need deliberate linking during triage. Raw report text and session replays do not automatically appear in public issues. Manual issue creation can be reconsidered if report volume grows.

The maintainer receives email notifications for new Support tickets. The initial integration does not send automatic error emails. The maintainer reviews Error Tracking after each production release and revisits error alerting when external members start using the app. Both reported problems and captured errors are manually triaged before a GitHub issue is created.
