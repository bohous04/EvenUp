import {
  tMarketing,
  formatCurrency,
  formatNumber,
  TRIMMED_PRICE_FORMAT,
  type Locale,
  type MarketingKey,
} from '@evenup/i18n';
import './features.css';

/**
 * The feature story. Five rows, each a claim on the left and the piece of the
 * app that proves it on the right — drawn as live HTML, not screenshots, so it
 * stays crisp at every density, follows the colour scheme, and costs no bytes
 * beyond the markup. Hairlines between rows; no card grid, no icons.
 *
 * The UI fragments are illustrations of the body copy beside them, so they are
 * `aria-hidden`; everything they say is said in prose too.
 *
 * Motion (features.css): the lead settle-up board plays a short, time-based
 * choreography once it scrolls into view (debts draw, collapse, five payments
 * land); the rows below assemble on scroll. A couple of fragments also carry a slow
 * ambient loop (the receipt scanner, the typing caret). All of it lives behind
 * prefers-reduced-motion: no-preference; the base styles are the final frame.
 */

type Tm = (key: MarketingKey, values?: Record<string, string | number>) => string;

/** The four supporting rows; debt minimising leads on its own, larger stage. */
const FEATURES: readonly {
  key: string;
  title: MarketingKey;
  body: MarketingKey;
  Visual: (p: { tm: Tm; locale: Locale }) => React.ReactNode;
}[] = [
  {
    key: 'ocr',
    title: 'marketing.feature.ocr.title',
    body: 'marketing.feature.ocr.body',
    Visual: Receipt,
  },
  {
    key: 'qr',
    title: 'marketing.feature.qr.title',
    body: 'marketing.feature.qr.body',
    Visual: QrPay,
  },
  {
    key: 'currency',
    title: 'marketing.feature.currency.title',
    body: 'marketing.feature.currency.body',
    Visual: Currency,
  },
  {
    key: 'guests',
    title: 'marketing.feature.guests.title',
    body: 'marketing.feature.guests.body',
    Visual: Guests,
  },
];

export function Features({ locale }: { locale: Locale }) {
  const tm: Tm = (key, values) => tMarketing(locale, key, values);
  return (
    <section id="features" className="lp-section lp-features" data-gauntlet="features">
      <div className="lp-wrap">
        <div className="lp-fx-lead">
          <h2 className="lp-h2 lp-fx-title">
            {tm('marketing.features.title')}{' '}
            <span className="lp-fx-title-after">{tm('marketing.features.titleAfter')}</span>
          </h2>
          {/* One paragraph, two lengths: the full sentence where there is room
              beside the headline; on a phone a single line, so the board itself
              is what meets the eye. Only one is ever displayed (and read). */}
          <p className="lp-lede lp-fx-lead-copy">
            <span className="lp-fx-lead-long">{tm('marketing.feature.debts.body')}</span>
            <span className="lp-fx-lead-short">{tm('marketing.feature.debts.short')}</span>
          </p>
          <div className="lp-fx-lead-stage" aria-hidden="true">
            <SettleBoard tm={tm} locale={locale} />
          </div>
        </div>
        <ol className="lp-fx-list">
          {FEATURES.map(({ key, title, body, Visual }) => (
            <li key={key} className={`lp-fx-row lp-fx-row-${key}`}>
              <div className="lp-fx-copy">
                <h3 className="lp-fx-h3">{tm(title)}</h3>
                <p className="lp-body">{tm(body)}</p>
              </div>
              <div className="lp-fx-stage" aria-hidden="true">
                <Visual tm={tm} locale={locale} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- fragments */

const czk = (minor: number, locale: Locale) =>
  formatCurrency(minor, 'CZK', locale, TRIMMED_PRICE_FORMAT);

/** An amount the way the app sets it: the figure in tabular weight, the
    currency code beside it in a lighter ink. The string still comes whole
    from formatCurrency; this only splits where the digits start and stop. */
function Money({ minor, locale }: { minor: number; locale: Locale }) {
  const s = czk(minor, locale);
  const m = /^(\D*?)(\d[\d\s.,\u00a0\u202f]*\d|\d)(\D*)$/.exec(s);
  if (!m) return <span className="lp-fx-money lp-num">{s}</span>;
  return (
    <span className="lp-fx-money lp-num">
      {m[1] ? <span className="lp-fx-cur-code">{m[1]}</span> : null}
      <span className="lp-fx-fig">{m[2]}</span>
      {m[3] ? <span className="lp-fx-cur-code">{m[3]}</span> : null}
    </span>
  );
}

/* The cast: one photo each, the same faces the hero and the how-it-works
   diagram use, so the page has a single set of people and a single avatar
   style. The tone is kept for the guest monogram only. */
const PEOPLE: Record<string, { photo: string }> = {
  Jirka: { photo: 'how/jirka' },
  Klára: { photo: 'people/klara' },
  Filip: { photo: 'people/filip' },
  Ondra: { photo: 'people/ondra' },
  Petr: { photo: 'how/petr' },
  Honza: { photo: 'how/honza' },
  Eva: { photo: 'people/eva' },
};
const photo = (n: string) => `/marketing/${PEOPLE[n]!.photo}.webp`;

/** A member's avatar; guests (no account yet) wear the app's plain monogram. */
function Av({ n, tone: kind, size = 28 }: { n: string; tone?: 'guest'; size?: number }) {
  if (kind || !PEOPLE[n]) return <span className="lp-fx-av lp-fx-av-guest">{n.slice(0, 1)}</span>;
  return (
    <img
      className="lp-fx-av lp-fx-av-photo"
      src={photo(n)}
      width={size}
      height={size}
      alt=""
      decoding="async"
      loading="lazy"
    />
  );
}

/* The settle-up board. Seven people on a ring; seventeen pairwise debts
   between them (drawn in full on entry, then cleared away completely, so the
   still frame is the answer alone, never muddied by the mess it replaced) and the five
   payments that replace them (heavy ink arcs, each labelled with its amount:
   the answer outweighs the mess). The ring order is chosen so every payment
   joins two neighbours: the answer draws as two short chains with nothing
   crossing. Geometry, including every stroke's true length (so lines draw
   cleanly end to end), is computed once at module load in a 360×284 box. */
const RING = ['Jirka', 'Klára', 'Filip', 'Ondra', 'Petr', 'Honza', 'Eva'] as const;
const PAYMENTS: [from: number, to: number, minor: number][] = [
  [0, 1, 124000], // Jirka → Klára
  [3, 4, 86000], // Ondra → Petr
  [2, 1, 51000], // Filip → Klára
  [5, 4, 39000], // Honza → Petr
  [6, 0, 17000], // Eva → Jirka
];
/* What the graph cannot say: where each payment goes (the payee's account,
   which the QR code carries) and whether it has been sent yet. Klára's
   account matches the QR fragment further down the page. */
const ACCOUNTS: Record<string, string> = {
  Klára: '…3456/2010',
  Petr: '…7781/0800',
  Jirka: '…0912/0300',
};
const PAID = 2; // the first two have already gone out
const G = (() => {
  const cx = 180;
  const cy = 142;
  const R = 19;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const nodes = RING.map((name, i) => {
    const a = (-90 + (i * 360) / RING.length) * (Math.PI / 180);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const x = cx + 128 * ux;
    const y = cy + 104 * uy;
    const lx = x + ux * (R + 9);
    const ly = y + uy * (R + 11) + 4;
    const anchor = Math.abs(ux) < 0.2 ? 'middle' : ux > 0 ? 'start' : 'end';
    return { name, x: r1(x), y: r1(y), lx: r1(lx), ly: r1(ly), anchor };
  });
  // Four pairs who owed each other nothing: 21 − 4 = 17 debts.
  const skip = new Set(['0-3', '1-5', '2-6', '4-0']);
  const debts: { d: string; len: number }[] = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      if (skip.has(`${i}-${j}`) || skip.has(`${j}-${i}`)) continue;
      const p = nodes[i]!;
      const q = nodes[j]!;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      const ux = (q.x - p.x) / d;
      const uy = (q.y - p.y) / d;
      debts.push({
        d: `M${r1(p.x + ux * R)} ${r1(p.y + uy * R)}L${r1(q.x - ux * R)} ${r1(q.y - uy * R)}`,
        len: Math.ceil(d - 2 * R),
      });
    }
  const pays = PAYMENTS.map(([f, t, minor]) => {
    const p = nodes[f]!;
    const q = nodes[t]!;
    // Bow each arc outward, along the ring, so it reads as a move between
    // neighbours.
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const kx = mx - (cx - mx) * 0.22;
    const ky = my - (cy - my) * 0.22;
    const out = (from: { x: number; y: number }, to: { x: number; y: number }, by: number) => {
      const d = Math.hypot(to.x - from.x, to.y - from.y);
      return { x: from.x + ((to.x - from.x) / d) * by, y: from.y + ((to.y - from.y) / d) * by };
    };
    const s = out(p, { x: kx, y: ky }, R + 4);
    const e = out(q, { x: kx, y: ky }, R + 5);
    const d = Math.hypot(e.x - kx, e.y - ky);
    const tx = (e.x - kx) / d;
    const ty = (e.y - ky) / d;
    // A solid head; the line stops inside its base so no cap pokes through.
    const L = 8.5;
    const W = 5;
    const head = `M${r1(e.x - tx * L - ty * W)} ${r1(e.y - ty * L + tx * W)}L${r1(e.x)} ${r1(e.y)}L${r1(e.x - tx * L + ty * W)} ${r1(e.y - ty * L - tx * W)}Z`;
    const bx = e.x - tx * (L - 2);
    const by = e.y - ty * (L - 2);
    // True arc length, sampled, so the dash draws exactly once, no fragments.
    const at = (u: number) => ({
      x: (1 - u) ** 2 * s.x + 2 * (1 - u) * u * kx + u * u * bx,
      y: (1 - u) ** 2 * s.y + 2 * (1 - u) * u * ky + u * u * by,
    });
    let len = 0;
    for (let k = 1, prev = at(0); k <= 32; k++) {
      const c = at(k / 32);
      len += Math.hypot(c.x - prev.x, c.y - prev.y);
      prev = c;
    }
    // The amount sits as a chip just outside the arc's midpoint, in the
    // open gap between two neighbours' names: clear of the line, its head,
    // the nodes and the faded web inside the ring.
    const m = at(0.5);
    const dm = Math.hypot(m.x - cx, m.y - cy);
    const ox = (m.x - cx) / dm;
    // Pushed further on the flanks, where the chip's width faces the arc.
    const ax = m.x + ox * (13 + 22 * Math.abs(ox));
    const ay = m.y + ((m.y - cy) / dm) * 11;
    return {
      line: `M${r1(s.x)} ${r1(s.y)}Q${r1(kx)} ${r1(ky)} ${r1(bx)} ${r1(by)}`,
      head,
      len: Math.ceil(len),
      ax: r1(ax),
      ay: r1(ay),
      minor,
    };
  });
  const payees = new Set(PAYMENTS.map(([, t]) => t));
  return { nodes, debts, pays, payees, R };
})();

/** An amount set on an arc: a raised chip with a hairline, sized from the
    label's length (tabular figures, so ~0.58em a glyph). */
function ArcChip({ x, y, label }: { x: number; y: number; label: string }) {
  const w = Math.round(label.length * 4.9 + 11);
  const h = 14;
  return (
    <g className="lp-fx-arc-amt">
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={7} className="lp-fx-chip" />
      <text x={x} y={y + 3} textAnchor="middle" className="lp-fx-chip-t lp-num">
        {label}
      </text>
    </g>
  );
}

/** Debts: the settle-up board — the web of debts on the left, the five
    payments that clear it on the right. */
function SettleBoard({ tm, locale }: { tm: Tm; locale: Locale }) {
  const total = PAYMENTS.reduce((s, [, , m]) => s + m, 0);
  const R = G.R;
  return (
    <div className="lp-fx-board">
      <div className="lp-fx-board-head">
        <span className="lp-fx-board-title">{tm('marketing.fx.debts.group')}</span>
        <span className="lp-fx-seg">
          <span className="lp-fx-seg-thumb" />
          <span className="lp-fx-seg-a lp-num">{tm('marketing.fx.debts.before')}</span>
          <span className="lp-fx-seg-b lp-num">{tm('marketing.fx.debts.after')}</span>
        </span>
      </div>
      <div className="lp-fx-board-body">
        <div className="lp-fx-graph">
          <svg viewBox="-14 0 388 284" width="388" height="284">
            <defs>
              <clipPath id="lp-fx-round" clipPathUnits="objectBoundingBox">
                <circle cx="0.5" cy="0.5" r="0.5" />
              </clipPath>
            </defs>
            <g className="lp-fx-debts">
              {G.debts.map(({ d, len }, i) => (
                <path key={d} d={d} style={{ '--i': i, '--len': len } as React.CSSProperties} />
              ))}
            </g>
            <g className="lp-fx-pays">
              {G.pays.map(({ line, head, len, ax, ay, minor }, i) => (
                <g key={line} style={{ '--i': i, '--len': len } as React.CSSProperties}>
                  <path className="lp-fx-pay-line" d={line} />
                  <path className="lp-fx-pay-head" d={head} />
                  <ArcChip x={ax} y={ay} label={czk(minor, locale)} />
                </g>
              ))}
            </g>
            <g className="lp-fx-nodes">
              {G.nodes.map((n, i) => (
                <g
                  key={n.name}
                  className={G.payees.has(i) ? 'lp-fx-node lp-fx-node-in' : 'lp-fx-node'}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <circle className="lp-fx-node-ring" cx={n.x} cy={n.y} r={R + 2.5} />
                  <image
                    href={photo(n.name)}
                    x={n.x - R}
                    y={n.y - R}
                    width={R * 2}
                    height={R * 2}
                    clipPath="url(#lp-fx-round)"
                    preserveAspectRatio="xMidYMid slice"
                  />
                  <text x={n.lx} y={n.ly} textAnchor={n.anchor as 'start'} className="lp-fx-node-n">
                    {n.name}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>
        <div className="lp-fx-panel lp-fx-ledger">
          <ul className="lp-fx-pay">
            {PAYMENTS.map(([f, t, amt], i) => {
              const from = RING[f]!;
              const to = RING[t]!;
              const paid = i < PAID;
              return (
                <li
                  key={f}
                  className={paid ? 'lp-fx-paid' : undefined}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <Av n={from} size={36} />
                  <span className="lp-fx-pay-text">
                    <span className="lp-fx-pay-who">
                      <b>{from}</b> <span className="lp-fx-to">→</span> {to}
                    </span>
                    <span className="lp-fx-pay-via lp-num">
                      {tm('marketing.fx.debts.via', { account: ACCOUNTS[to]! })}
                    </span>
                  </span>
                  <span className="lp-fx-amt">
                    <Money minor={amt} locale={locale} />
                  </span>
                  {paid ? (
                    <span className="lp-fx-state lp-fx-state-paid">
                      <svg viewBox="0 0 12 12" width="12" height="12">
                        <path d="M2.5 6.2l2.3 2.3 4.7-4.9" />
                      </svg>
                      {tm('marketing.fx.debts.paid')}
                    </span>
                  ) : (
                    <span className="lp-fx-state lp-fx-state-qr">
                      <svg viewBox="-2 -2 29 29" width="16" height="16" fillRule="evenodd">
                        <path d={QR_PATH} />
                      </svg>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="lp-fx-ledger-foot">
            <div className="lp-fx-progress">
              <span className="lp-fx-progress-t">
                {tm('marketing.fx.debts.progress', { paid: PAID, count: PAYMENTS.length })}
              </span>
              <span className="lp-fx-bar">
                {PAYMENTS.map(([f], i) => (
                  <span
                    key={f}
                    className={i < PAID ? 'lp-fx-bar-on' : undefined}
                    style={{ '--i': i } as React.CSSProperties}
                  />
                ))}
              </span>
            </div>
            <p className="lp-fx-total">
              <span>{tm('marketing.fx.debts.total')}</span>
              <Money minor={total} locale={locale} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** OCR: a receipt, its lines read off the photo, each tapped to a person. */
function Receipt({ tm, locale }: { tm: Tm; locale: Locale }) {
  const items: [MarketingKey, number, string[]][] = [
    ['marketing.fx.ocr.item1', 79600, ['Jirka', 'Klára']],
    ['marketing.fx.ocr.item2', 25800, ['Ondra']],
    ['marketing.fx.ocr.item3', 31200, ['Jirka', 'Ondra', 'Klára']],
    ['marketing.fx.ocr.item4', 9800, ['Klára']],
  ];
  const total = items.reduce((s, [, a]) => s + a, 0);
  return (
    <div className="lp-fx-ocr">
      <div className="lp-fx-paper">
        <span className="lp-fx-beam" />
        <p className="lp-fx-paper-head">{tm('marketing.fx.ocr.place')}</p>
        <ul className="lp-fx-lines">
          {items.map(([k, amt, who], i) => (
            <li key={k} style={{ '--i': i } as React.CSSProperties}>
              <span className="lp-fx-line-name">{tm(k)}</span>
              <span className="lp-num">{czk(amt, locale)}</span>
              <span className="lp-fx-who">
                {who.map((w) => (
                  <Av key={w} n={w} />
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="lp-fx-paper-total">
          <span>{tm('marketing.fx.ocr.total')}</span>
          <span className="lp-num">{czk(total, locale)}</span>
        </p>
      </div>
      <p className="lp-fx-chip">
        <span className="lp-fx-dot" />
        {tm('marketing.fx.ocr.read', { count: items.length })}
      </p>
    </div>
  );
}

/** A deterministic 25×25 QR-shaped matrix as one SVG path (decorative). */
const QR_PATH = (() => {
  const N = 25;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const finder = (x: number, y: number) =>
    [
      [0, 0],
      [N - 7, 0],
      [0, N - 7],
    ].some(([fx, fy]) => x >= fx! - 1 && x <= fx! + 7 && y >= fy! - 1 && y <= fy! + 7);
  let d = '';
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) if (!finder(x, y) && rnd() > 0.52) d += `M${x} ${y}h1v1h-1z`;
  for (const [fx, fy] of [
    [0, 0],
    [N - 7, 0],
    [0, N - 7],
  ])
    d += `M${fx} ${fy}h7v7h-7zM${fx! + 1} ${fy! + 1}v5h5v-5zM${fx! + 2} ${fy! + 2}h3v3h-3z`;
  return d;
})();

/** QR: the payment, already filled in, as your bank app reads it. */
function QrPay({ tm, locale }: { tm: Tm; locale: Locale }) {
  return (
    <div className="lp-fx-panel lp-fx-qr">
      <div className="lp-fx-qr-code">
        <svg viewBox="-2 -2 29 29" width="160" height="160" fillRule="evenodd">
          <path d={QR_PATH} fill="currentColor" />
        </svg>
        <span className="lp-fx-qr-scan" />
      </div>
      <dl className="lp-fx-fields">
        <div style={{ '--i': 0 } as React.CSSProperties}>
          <dt>{tm('marketing.fx.qr.to')}</dt>
          <dd>Klára Nováková</dd>
        </div>
        <div style={{ '--i': 1 } as React.CSSProperties}>
          <dt>{tm('marketing.fx.qr.account')}</dt>
          <dd className="lp-num">2400123456 / 2010</dd>
        </div>
        <div style={{ '--i': 2 } as React.CSSProperties}>
          <dt>{tm('marketing.fx.qr.amount')}</dt>
          <dd className="lp-num lp-fx-accent">{czk(124000, locale)}</dd>
        </div>
        <div style={{ '--i': 3 } as React.CSSProperties}>
          <dt>{tm('marketing.fx.qr.message')}</dt>
          <dd>{tm('marketing.fx.qr.note')}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Currency: one expense in euros, landing in the group's korunas. */
function Currency({ tm, locale }: { tm: Tm; locale: Locale }) {
  const eur = 8400;
  const rate = 24.95;
  return (
    <div className="lp-fx-cur">
      <div className="lp-fx-panel lp-fx-cur-from">
        <span className="lp-fx-label">{tm('marketing.fx.cur.paid')}</span>
        <span className="lp-fx-cur-what">{tm('marketing.fx.cur.what')}</span>
        <span className="lp-fx-big lp-num">{formatCurrency(eur, 'EUR', locale)}</span>
      </div>
      <div className="lp-fx-cur-rate">
        <span className="lp-fx-rule" />
        <span className="lp-fx-label lp-num">
          {tm('marketing.fx.cur.rate', { rate: formatNumber(rate, locale) })}
        </span>
      </div>
      <div className="lp-fx-panel lp-fx-cur-to">
        <span className="lp-fx-label">{tm('marketing.fx.cur.group')}</span>
        <span className="lp-fx-big lp-num lp-fx-accent">
          {formatCurrency(Math.round(eur * rate), 'CZK', locale)}
        </span>
      </div>
    </div>
  );
}

/** Guests: members added by name; one links to a real account later. */
function Guests({ tm }: { tm: Tm; locale: Locale }) {
  return (
    <div className="lp-fx-panel lp-fx-guests">
      <ul className="lp-fx-members">
        <li>
          <Av n="Jirka" />
          <span>Jirka</span>
          <span className="lp-fx-tag">{tm('marketing.fx.guests.you')}</span>
        </li>
        <li className="lp-fx-linked">
          <Av n="Klára" />
          <span>Klára</span>
          <span className="lp-fx-tag lp-fx-tag-ok">{tm('marketing.fx.guests.linked')}</span>
        </li>
        <li>
          <Av n="Ondra" tone="guest" />
          <span>Ondra</span>
          <span className="lp-fx-tag">{tm('marketing.fx.guests.guest')}</span>
        </li>
        <li>
          <Av n="Babička" tone="guest" />
          <span>{tm('marketing.fx.guests.granny')}</span>
          <span className="lp-fx-tag">{tm('marketing.fx.guests.guest')}</span>
        </li>
      </ul>
      <div className="lp-fx-add">
        <span className="lp-fx-add-plus">+</span>
        <span className="lp-fx-type">Tomáš</span>
        <span className="lp-fx-caret" />
        <span className="lp-fx-add-hint">{tm('marketing.fx.guests.add')}</span>
      </div>
    </div>
  );
}
