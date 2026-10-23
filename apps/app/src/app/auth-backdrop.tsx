import { useId } from 'react';

// Each line lies on the lattice (y = ±x/2 + 28k) and runs past the edges of any common screen,
// so a glint enters and leaves out of view.
const glints = [
  { x1: -112, y1: 0, x2: 2688, y2: 1400, reverse: false },
  { x1: -112, y1: 784, x2: 2688, y2: -616, reverse: false },
  { x1: -112, y1: -308, x2: 2688, y2: 1092, reverse: true },
  { x1: -112, y1: 1288, x2: 2688, y2: -112, reverse: true },
];

const slabs = [
  { points: '30,250 170,180 280,235 140,305', color: '#cbd6c8' },
  { points: '30,175 170,105 280,160 140,230', color: 'var(--brand-lime)' },
  { points: '30,100 170,30 280,85 140,155', color: '#9fb39c' },
];

export function AuthBackdrop() {
  const latticeId = useId();
  return (
    <div aria-hidden="true" className="auth-backdrop pointer-events-none absolute inset-0">
      <svg className="auth-backdrop-lattice absolute inset-0 size-full">
        <defs>
          <pattern id={latticeId} width="56" height="28" patternUnits="userSpaceOnUse">
            <path
              d="M0 0L56 28M0 28L56 0"
              fill="none"
              style={{ stroke: 'var(--brand-forest)' }}
              strokeOpacity="0.09"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${latticeId})`} />
        {glints.map(({ reverse, ...line }, index) => (
          <line
            key={index}
            {...line}
            pathLength={100}
            className="auth-backdrop-glint"
            data-reverse={reverse || undefined}
            style={{ animationDelay: `${2 + index * 8}s` }}
          />
        ))}
      </svg>
      <svg
        viewBox="0 0 420 330"
        className="absolute -right-[70px] -bottom-[60px] w-[200px] opacity-55 sm:-right-[60px] sm:-bottom-[80px] sm:w-[380px]"
      >
        {slabs.map(({ points, color }) => (
          <polygon
            key={points}
            points={points}
            style={{ fill: color, stroke: color }}
            strokeWidth="16"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <svg
        viewBox="0 0 420 330"
        className="absolute -top-[70px] -left-[90px] hidden w-[340px] sm:block"
      >
        {slabs.map(({ points }) => (
          <polygon
            key={points}
            points={points}
            fill="none"
            style={{ stroke: 'var(--brand-forest)' }}
            strokeOpacity="0.14"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
}
