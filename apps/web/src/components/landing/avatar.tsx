import type { CSSProperties } from 'react';

/*
 * The cast's avatars: one restrained, flat set drawn inline (no image
 * requests, no layout shift: the box is fixed). One system for everyone:
 *  - the same head, neck and shoulders, centred, on a 100-unit square that
 *    IS the disc;
 *  - the same face: two ink dots for eyes and one closed, slightly smiling
 *    line for a mouth. No brows, lashes, blush, teeth, noses or highlights;
 *  - three flat tones per person (skin, hair, top) plus the shared ink;
 *  - every shape carries the same ink contour (drawn under its fill, so only
 *    the outer edge shows), which is what keeps skin and hair separate from
 *    the disc at 24-32px whatever their own lightness.
 * Identity lives in the silhouette: Jirka's bun and beard, Petr's bald crown
 * and glasses, Honza's curls, Klára's swept pixie, Filip's quiff, Ondra's
 * flat-top, Eva's long hair. The disc is one fixed token, --lp-ava-disc.
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

const VIEW = '0 0 100 100';
const DISC = { cx: 50, cy: 50, r: 50 };

/** A flat shape with the shared contour, or an ink line (`w`). */
type Layer = { d: string; fill?: string; w?: number };
const F = (d: string, fill: string): Layer => ({ d, fill });
const LINE = (d: string, w: number): Layer => ({ d, w });
const n = (v: number) => Math.round(v * 100) / 100;
const ell = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z`;
const pair = (gap: number, f: (x: number) => string) => f(50 - gap) + f(50 + gap);

const INK = '#1d1917';
/** Contour width; half of it shows, outside each shape. */
const EDGE = 4;

/* The shared geometry. */
const HEAD = { w: 18.5, top: 27, my: 52, chin: 80 };
const EYE_Y = 55;
const EYE_GAP = 8.2;
const MOUTH = 'M45.4 69.4Q50 72.4 54.6 69.4';

function faceShape(sq: number) {
  const { w, top, my, chin } = HEAD;
  const j = 0.42 + 0.3 * sq;
  const k = 0.3 + 0.4 * sq;
  const u = top + (my - top) * 0.42;
  return (
    `M${n(50 - w)} ${my}C${n(50 - w)} ${n(u)} ${n(50 - w * 0.56)} ${top} 50 ${top}` +
    `C${n(50 + w * 0.56)} ${top} ${n(50 + w)} ${n(u)} ${n(50 + w)} ${my}` +
    `C${n(50 + w)} ${n(my + (chin - my) * j)} ${n(50 + w * k)} ${chin} 50 ${chin}` +
    `C${n(50 - w * k)} ${chin} ${n(50 - w)} ${n(my + (chin - my) * j)} ${n(50 - w)} ${my}Z`
  );
}

const SHOULDERS = 'M2 108C4 94 18 87.5 36 86H64C82 87.5 96 94 98 108Z';
const NECK = 'M42.4 68V87.4Q50 91.6 57.6 87.4V68Z';
const EARS = pair(HEAD.w, (x) => ell(x, 56, 3.6, 5.2));

type Person3 = { skin: string; hair: string; top: string };

/**
 * Paint order: [behind] → shoulders → [overShoulders] → neck → ears →
 * face → [hair] → eyes and mouth → [over] (glasses).
 */
function figure(
  c: Person3,
  o: {
    sq?: number;
    ears?: boolean;
    behind?: string[];
    overShoulders?: string[];
    hair?: string[];
    mouthOn?: string;
    over?: Layer[];
  },
): Layer[] {
  return [
    ...(o.behind ?? []).map((d) => F(d, c.hair)),
    F(SHOULDERS, c.top),
    ...(o.overShoulders ?? []).map((d) => F(d, c.hair)),
    F(NECK, c.skin),
    ...(o.ears === false ? [] : [F(EARS, c.skin)]),
    F(faceShape(o.sq ?? 0.4), c.skin),
    ...(o.hair ?? []).map((d) => F(d, c.hair)),
    { d: pair(EYE_GAP, (x) => ell(x, EYE_Y, 2.7)), fill: INK, w: 0 },
    LINE(MOUTH, 2.4),
    ...(o.over ?? []),
  ];
}

const jirka = figure(
  { skin: '#efc6a5', hair: '#a8532b', top: '#6f8a69' },
  {
    sq: 0.5,
    hair: [
      // the bun on the crown, and the hair swept back into it
      ell(50, 17.5, 8.2, 6.6) +
        'M31 53C29.6 35 37.4 23.4 50 23.4S70.4 35 69 53C67.6 44.6 65 39 59.6 36.6C54.6 35 45.4 35 40.4 36.6C35 39 32.4 44.6 31 53Z',
      // full beard, open around the mouth
      'M31.4 54C31.4 72 39.6 85 50 85S68.6 72 68.6 54L66 55C65.4 63 63.4 67.4 59.6 70.4C57.6 75.4 54 77.6 50 77.6S42.4 75.4 40.4 70.4C36.6 67.4 34.6 63 34 55Z',
    ],
  },
);

const petr = figure(
  { skin: '#eecaae', hair: '#a29c94', top: '#6d84a3' },
  {
    sq: 0.35,
    // a bald crown with short grey hair around the back and sides
    behind: ['M29.4 63C27.8 53 28.4 45 31.4 38.6Q50 33 68.6 38.6C71.6 45 72.2 53 70.6 63Z'],
    // and a grey moustache over the smile
    hair: [
      'M41.4 66.6C43.6 62.6 47.4 62.6 50 64.2C52.6 62.6 56.4 62.6 58.6 66.6C55.6 68 52.6 67.6 50 66.8C47.4 67.6 44.4 68 41.4 66.6Z',
    ],
    over: [
      LINE(
        ell(41, EYE_Y, 6.4) +
          ell(59, EYE_Y, 6.4) +
          'M47.4 54.4Q50 52.8 52.6 54.4M34.6 54.4L31.6 53.2M65.4 54.4L68.4 53.2',
        2.2,
      ),
    ],
  },
);

/* Honza's curls: one silhouette of round curls over the crown and temples. */
const CURLS =
  [190, 170, 150, 130, 110, 90, 70, 50, 30, 10, -10]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      return ell(50 + 20.5 * Math.cos(a), 39 - 19 * Math.sin(a), 7, 6.6);
    })
    .join('') + 'M30 48C30 34 38 26 50 26S70 34 70 48C66 42.4 60 40.6 50 40.6S34 42.4 30 48Z';

const honza = figure(
  { skin: '#b97f58', hair: '#231a16', top: '#c4a057' },
  { sq: 0.75, hair: [CURLS] },
);

const klara = figure(
  { skin: '#f3d5bd', hair: '#3b2a21', top: '#a95f53' },
  {
    sq: 0.1,
    ears: false,
    // a short, tousled cut to the jaw (tapered, not blunt) with a long fringe
    // swept from a deep left part across the brow to the right temple
    behind: [
      'M27.4 66C25.4 50 27 36 34 28.6Q50 18 66 28.6C73 36 74.6 50 72.6 66C70.6 70.4 67.4 71.4 64.6 69.6L50 60L35.4 69.6C32.6 71.4 29.4 70.4 27.4 66Z',
    ],
    hair: [
      'M30.6 58C28.4 38 36 24.6 50.6 24.2C63.4 23.8 71.6 33 70.6 46C70.2 51.6 69.4 55.4 68.4 58.4C67.8 53.4 66.8 49.4 65 46.8C59.8 46.4 52 44.6 46 40.2C42 43.4 37.6 45.6 33.4 46.6C32.2 50.2 31.4 54 30.6 58Z',
    ],
  },
);

const filip = figure(
  { skin: '#f1d0b4', hair: '#8b603b', top: '#e8e2d6' },
  {
    sq: 0.6,
    // short sides, the top swept up and over from a side part
    hair: [
      'M31.2 53C29.6 39 31.6 27 40 20.6C46.4 15.8 57.6 15 64.6 19.6C70.6 23.4 71.4 31 69.4 38.4C69 43.4 68.8 48 68.8 53C67.6 45.6 65.6 40.6 62 38C54.6 38.4 46.6 36.6 41.2 32.6C38.4 37.4 35.4 40.4 33 42.6C32.2 46 31.6 49.4 31.2 53Z',
    ],
  },
);

const ondra = figure(
  { skin: '#8a5a3c', hair: '#1c1614', top: '#4b5874' },
  {
    sq: 0.55,
    // a high, squared flat-top with a crisp hairline
    hair: [
      'M31.2 50V30Q31.2 21 40 21H60Q68.8 21 68.8 30V50C67.4 43.8 64.6 40.2 60.6 39H39.4C35.4 40.2 32.6 43.8 31.2 50Z',
    ],
  },
);

const eva = figure(
  { skin: '#f2d0b3', hair: '#c08f48', top: '#3f4a5e' },
  {
    sq: 0,
    ears: false,
    // long hair falling over the shoulders, parted in the centre
    overShoulders: [
      'M27.6 98V48C27.6 31 37 23.4 50 23.4S72.4 31 72.4 48V98Q64 101 57.6 96V70H42.4V96Q36 101 27.6 98Z',
    ],
    hair: [
      'M31.2 62C29.8 39 37.6 27 50 27.6C62.4 27 70.2 39 68.8 62C67.6 50 64.6 41.4 58.2 37C54.6 34.6 51.6 32 50 28.6C48.4 32 45.4 34.6 41.8 37C35.4 41.4 32.4 50 31.2 62Z',
    ],
  },
);

/* Drawn once per module load: the figures are static. */
const FIGURES: Record<Person, Layer[]> = { jirka, petr, honza, klara, filip, ondra, eva };

/** The figure's paths, in paint order. Fills carry the contour underneath. */
function Figure({ p }: { p: Person }) {
  return (
    <>
      {FIGURES[p].map((l, i) =>
        l.fill === undefined ? (
          <path
            key={i}
            d={l.d}
            fill="none"
            stroke={INK}
            strokeWidth={l.w}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : l.w === 0 ? (
          <path key={i} d={l.d} fill={l.fill} />
        ) : (
          <path
            key={i}
            d={l.d}
            fill={l.fill}
            stroke={INK}
            strokeWidth={EDGE}
            strokeLinejoin="round"
            paintOrder="stroke"
          />
        ),
      )}
    </>
  );
}

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
        <svg className="lp-ava-svg" viewBox={VIEW} width={size} height={size} focusable="false">
          <Figure p={p} />
        </svg>
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
        <svg x={cx - r} y={cy - r} width={r * 2} height={r * 2} viewBox={VIEW}>
          <clipPath id={clip}>
            <circle cx={DISC.cx} cy={DISC.cy} r={DISC.r} />
          </clipPath>
          <g clipPath={`url(#${clip})`}>
            <Figure p={p} />
          </g>
        </svg>
      ) : (
        <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={initialSize(r * 2)}>
          {initial(name)}
        </text>
      )}
    </g>
  );
}
