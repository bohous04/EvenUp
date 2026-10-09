import type { CSSProperties } from 'react';

/*
 * The cast's avatars: one botpfp.com set (Classic head, cream backdrop,
 * turtleneck), each figure turned its own way and cropped to head and
 * shoulders. Shipped as 144px webp (2x the largest disc), drawn into a box
 * of fixed size so nothing shifts. The disc behind them, --lp-ava-disc,
 * matches the backdrop.
 */
export const PEOPLE = ['jirka', 'petr', 'honza', 'klara', 'filip', 'ondra', 'eva'] as const;
export type Person = (typeof PEOPLE)[number];

/** 'Klára' / 'klara' → 'klara'; names outside the cast get undefined. */
export function personKey(name: string): Person | undefined {
  const k = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return (PEOPLE as readonly string[]).includes(k) ? (k as Person) : undefined;
}

/** The initial: the first letter of the display name ('Klára' → 'K'). */
export const initial = (name: string) => name.slice(0, 1).toLocaleUpperCase('cs');

/** The initial's size for a disc of `size` px: optically centred cap height. */
export const initialSize = (size: number) => Math.round(size * 0.42 * 2) / 2;

const src = (p: Person) => `/marketing/avatars/${p}.webp`;

export function Avatar({
  name,
  size,
  className,
}: {
  /** Display name or key ('Klára' or 'klara'). */
  name: string;
  size: number;
  className?: string;
}) {
  const p = personKey(name);
  const style = {
    width: size,
    height: size,
    fontSize: initialSize(size),
  } as CSSProperties;
  return (
    <span
      className={className ? `lp-ava ${className}` : 'lp-ava'}
      data-p={p}
      style={style}
      aria-hidden="true"
    >
      {p ? (
        <img
          className="lp-ava-img"
          src={src(p)}
          alt=""
          width={size}
          height={size}
          decoding="async"
        />
      ) : (
        initial(name)
      )}
    </span>
  );
}

/** The same avatar drawn inside an SVG (the settle board's nodes). */
export function AvatarMark({
  name,
  cx,
  cy,
  r,
}: {
  name: string;
  cx: number;
  cy: number;
  r: number;
}) {
  const p = personKey(name);
  const clip = `lp-ava-c-${Math.round(cx)}-${Math.round(cy)}`;
  return (
    <g className="lp-ava-g" data-p={p}>
      <circle cx={cx} cy={cy} r={r} />
      {p ? (
        <>
          <clipPath id={clip}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
          <image
            href={src(p)}
            x={cx - r}
            y={cy - r}
            width={r * 2}
            height={r * 2}
            clipPath={`url(#${clip})`}
          />
          <circle className="lp-ava-edge" cx={cx} cy={cy} r={r} />
        </>
      ) : (
        <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={initialSize(r * 2)}>
          {initial(name)}
        </text>
      )}
    </g>
  );
}
