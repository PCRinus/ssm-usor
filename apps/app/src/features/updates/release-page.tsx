import { Button } from '@ssm-usor/ui/components/button';
import { type ErrorComponentProps, Link, useLocation, useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import type { Release } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useScrollToHash } from '@/app/use-scroll-to-hash';

import { KindSquare } from './kind-square';
import { formatReleaseDay, formatReleaseDayBeside, kindTitles } from './release-format';
import { ReleaseTag } from './release-tag';
import { useAcknowledgeReleases, useReleases } from './use-releases';

const sectionIds = { features: 'ce-e-nou', improvements: 'imbunatatiri', fixes: 'remedieri' };

type SectionKey = keyof typeof sectionIds;

function sectionsOf(release: Release) {
  return [
    { key: 'features' as const, title: kindTitles.features, count: release.features.length },
    {
      key: 'improvements' as const,
      title: kindTitles.improvements,
      count: release.improvements.length,
    },
    { key: 'fixes' as const, title: kindTitles.fixes, count: release.fixes.length },
  ].filter((section) => section.count > 0);
}

function SectionHeading({
  id,
  kind,
  children,
}: {
  id: string;
  kind: SectionKey;
  children: string;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2.5 text-[19px] font-bold sm:text-xl">
      <KindSquare kind={kind} />
      {children}
    </h2>
  );
}

function SectionLinks({
  tag,
  sections,
  phone,
}: {
  tag: string;
  sections: ReturnType<typeof sectionsOf>;
  phone: boolean;
}) {
  const hash = useLocation({ select: (location) => location.hash });
  const current = sections.find((section) => sectionIds[section.key] === hash) ?? sections[0];
  if (phone) {
    return (
      <nav
        aria-label="Pe această pagină"
        className="-mx-5 -mt-2 flex gap-2 overflow-x-auto px-5 lg:hidden"
      >
        {sections.map((section) => (
          <Link
            key={section.key}
            to="/actualizari/$tag"
            params={{ tag }}
            hash={sectionIds[section.key]}
            className="flex h-11 shrink-0 items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input bg-card px-3.5 text-sm whitespace-nowrap">
              <KindSquare kind={section.key} className="size-2 rounded-[2px]" />
              {section.title}, {section.count}
            </span>
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav
      aria-label="Pe această pagină"
      className="sticky top-24 hidden flex-col gap-1 self-start text-sm lg:flex"
    >
      <span className="pb-2 pl-3 font-semibold">Pe această pagină</span>
      {sections.map((section) => (
        <Link
          key={section.key}
          to="/actualizari/$tag"
          params={{ tag }}
          hash={sectionIds[section.key]}
          data-current={section === current || undefined}
          className="border-l-2 border-border px-3 py-1.5 text-release-body outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-current:border-foreground data-current:font-medium data-current:text-foreground"
        >
          {section.title}, {section.count}
        </Link>
      ))}
    </nav>
  );
}

function OtherReleases({
  release,
  previous,
  newest,
}: {
  release: Release;
  previous?: Release;
  newest: boolean;
}) {
  return (
    <nav
      aria-label="Alte versiuni"
      className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3"
    >
      {previous && (
        <Link
          to="/actualizari/$tag"
          params={{ tag: previous.tag }}
          data-testid="release-previous"
          className="flex sm:flex-1 sm:basis-[260px] flex-col gap-1 rounded-xl border bg-card px-4 py-3.5 outline-none hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-5 sm:py-4"
        >
          <span className="text-[13px] text-muted-foreground">
            Versiunea anterioară,{' '}
            {formatReleaseDayBeside(previous.publishedAt, release.publishedAt)}
          </span>
          <span className="text-[15px] font-semibold">{previous.headline}</span>
        </Link>
      )}
      <Link
        to="/actualizari"
        data-testid="release-all"
        className="flex sm:flex-1 sm:basis-[260px] flex-col justify-center gap-1 rounded-xl border border-dashed border-input px-4 py-3.5 outline-none hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-5 sm:py-4"
      >
        <span className="text-[15px] font-semibold">Toate actualizările</span>
        {newest && (
          <span className="text-[13px] text-muted-foreground">
            Aceasta e cea mai nouă versiune.
          </span>
        )}
      </Link>
    </nav>
  );
}

export function ReleasePage({ tag }: { tag: string }) {
  const { releases, find } = useReleases();
  const { acknowledge } = useAcknowledgeReleases();
  const release = find(tag);
  const acknowledgedFor = useRef<string | null>(null);
  useScrollToHash(Boolean(release));

  const unread = release?.unread ?? false;
  useEffect(() => {
    if (!unread || acknowledgedFor.current === tag) return;
    acknowledgedFor.current = tag;
    acknowledge();
  }, [unread, tag, acknowledge]);

  if (!release) return <ReleaseNotFound />;

  const index = releases.indexOf(release);
  const previous = releases[index + 1];
  const sections = sectionsOf(release);
  const published = formatReleaseDay(release.publishedAt);

  return (
    <div data-testid="release-page" className="mx-auto grid w-full max-w-[1040px] gap-6 sm:gap-7">
      <header className="grid gap-3.5 overflow-hidden rounded-2xl border border-release-sand-edge bg-release-sand px-5 pt-5 pb-6 sm:flex sm:items-start sm:gap-8 sm:px-9 sm:py-8">
        <ReleaseTag tag={release.tag} size="hero" className="hidden sm:flex" />
        <div className="flex items-center gap-3.5 sm:hidden">
          <ReleaseTag tag={release.tag} size="badge" />
          <div className="grid gap-[3px]">
            <span className="text-[15px] font-bold tabular-nums">Versiunea {release.tag}</span>
            <span className="text-[13px] text-release-sand-muted">Publicată pe {published}</span>
          </div>
        </div>
        <div className="grid max-w-[640px] gap-3">
          <span className="hidden text-sm text-release-sand-muted sm:block">
            Publicată pe {published}
          </span>
          <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.02em] sm:text-[34px] sm:leading-[1.15]">
            {release.headline}
          </h1>
          {release.lead && (
            <p className="text-base leading-[1.6] text-release-body sm:text-[17px]">
              {release.lead}
            </p>
          )}
        </div>
      </header>

      {sections.length > 1 && <SectionLinks tag={release.tag} sections={sections} phone />}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,720px)_220px] lg:justify-between">
        <article className="grid min-w-0 content-start gap-8 sm:gap-10">
          {release.features.length > 0 && (
            <section
              id={sectionIds.features}
              aria-labelledby="release-features"
              data-testid="release-features"
              className="grid scroll-mt-24 gap-3 sm:gap-5"
            >
              <SectionHeading id="release-features" kind="features">
                Ce e nou
              </SectionHeading>
              {release.features.map((feature) => (
                <div
                  key={feature.title}
                  className="grid gap-2 rounded-xl border bg-card p-4 sm:gap-2.5 sm:px-6 sm:py-[22px]"
                >
                  <h3 className="text-base leading-[1.35] font-semibold sm:text-[17px]">
                    {feature.title}
                  </h3>
                  <p className="text-[15px] leading-[1.6] text-release-body">{feature.text}</p>
                  {feature.where && (
                    <p className="border-t border-muted pt-2 text-[13px] leading-[1.45] text-muted-foreground sm:border-0 sm:pt-0">
                      Unde o găsești:{' '}
                      <span className="font-medium text-foreground">{feature.where}</span>
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}
          {release.improvements.length > 0 && (
            <section
              id={sectionIds.improvements}
              aria-labelledby="release-improvements"
              data-testid="release-improvements"
              className="grid scroll-mt-24 gap-2.5 sm:gap-3.5"
            >
              <SectionHeading id="release-improvements" kind="improvements">
                Îmbunătățiri
              </SectionHeading>
              <ul className="grid list-disc gap-2.5 pl-5 text-[15px] leading-[1.55]">
                {release.improvements.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}
          {release.fixes.length > 0 && (
            <section
              id={sectionIds.fixes}
              aria-labelledby="release-fixes"
              data-testid="release-fixes"
              className="grid scroll-mt-24 gap-2.5 sm:gap-3.5"
            >
              <SectionHeading id="release-fixes" kind="fixes">
                Remedieri
              </SectionHeading>
              <ul className="grid list-disc gap-2.5 pl-5 text-[15px] leading-[1.55]">
                {release.fixes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}
          <OtherReleases release={release} previous={previous} newest={index === 0} />
        </article>
        {sections.length > 1 && (
          <SectionLinks tag={release.tag} sections={sections} phone={false} />
        )}
      </div>
    </div>
  );
}

export function ReleaseNotFound() {
  return (
    <div data-testid="release-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Versiunea nu a fost găsită</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există nicio actualizare pentru această versiune.
      </p>
      <Button asChild className="w-fit">
        <Link to="/actualizari">Toate actualizările</Link>
      </Button>
    </div>
  );
}

export function ReleaseError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message =
    error instanceof ApiHttpError && error.status === 401
      ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
      : 'Nu am putut încărca actualizarea. Încearcă din nou.';
  return (
    <div data-testid="release-error" role="alert" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Actualizarea nu a putut fi încărcată</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button variant="outline" className="w-fit" onClick={() => void router.invalidate()}>
        Încearcă din nou
      </Button>
    </div>
  );
}
