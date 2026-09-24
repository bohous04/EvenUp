import { tMarketing, type Locale } from '@evenup/i18n';

/**
 * The settlement demo — the section the whole landing page is built around.
 *
 * **Server-rendered SVG, animated with CSS only.** No client component, no
 * hydration, no `useEffect`: the markup ships in the HTML response, so a crawler
 * and a visitor with JavaScript disabled both read the finished argument. The
 * CSS in `landing.css` animates it, and every animated element's *base* style is
 * its final state — the animations only ever run toward the resting state, never
 * away from it. That is what makes it safe under `prefers-reduced-motion`: turn
 * motion off and you get the finished diagram, not a blank frame.
 *
 * The figures are the real output of `minimizeDebts` for a three-person chain
 * (two pairwise debts netting into one transfer, with the person in the middle
 * left at zero). They are pinned by `packages/core/src/balance/balance.test.ts`
 * and asserted against the served HTML by `e2e/landing.spec.ts`, so the copy and
 * the algorithm cannot drift apart silently.
 */
export function SettleDemo({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof tMarketing>[1]) => tMarketing(locale, key);

  return (
    <div className="mx-auto w-full max-w-2xl" data-testid="settle-demo">
      <svg
        viewBox="0 0 400 128"
        role="img"
        aria-label={t('marketing.demo.names')}
        className="landing-svg"
        data-demo="before"
      >
        <g className="landing-dim">
          <line
            className="landing-draw landing-e1"
            style={{ '--len': '74px' } as React.CSSProperties}
            x1="98"
            y1="54"
            x2="166"
            y2="54"
            stroke="var(--line-strong)"
            strokeWidth="2"
            strokeDasharray="74"
            markerEnd="url(#demoArrowMuted)"
          />
          <text className="landing-amt landing-e1" x="132" y="36" textAnchor="middle">
            100 Kč
          </text>
          <line
            className="landing-draw landing-e2"
            style={{ '--len': '74px' } as React.CSSProperties}
            x1="234"
            y1="54"
            x2="302"
            y2="54"
            stroke="var(--line-strong)"
            strokeWidth="2"
            strokeDasharray="74"
            markerEnd="url(#demoArrowMuted)"
          />
          <text className="landing-amt landing-e2" x="268" y="36" textAnchor="middle">
            100 Kč
          </text>
        </g>

        <circle
          className="landing-pop landing-n1"
          cx="64"
          cy="54"
          r="32"
          fill="var(--debt-wash)"
          stroke="var(--debt)"
          strokeWidth="2"
        />
        <text
          className="landing-nm landing-n1"
          x="64"
          y="59"
          textAnchor="middle"
          fill="var(--debt)"
        >
          Jirka
        </text>
        <circle
          className="landing-pop landing-n2"
          cx="200"
          cy="54"
          r="32"
          fill="var(--surface)"
          stroke="var(--line-strong)"
          strokeWidth="2"
        />
        <text
          className="landing-nm landing-n2"
          x="200"
          y="59"
          textAnchor="middle"
          fill="var(--ink-soft)"
        >
          Petr
        </text>
        <circle
          className="landing-pop landing-n3"
          cx="336"
          cy="54"
          r="32"
          fill="var(--brand-wash)"
          stroke="var(--brand)"
          strokeWidth="2"
        />
        <text
          className="landing-nm landing-n3"
          x="336"
          y="59"
          textAnchor="middle"
          fill="var(--brand-ink)"
        >
          Honza
        </text>

        <text className="landing-amt" x="200" y="112" textAnchor="middle" fontWeight="700">
          {t('marketing.demo.before')}
        </text>
      </svg>

      <div className="landing-bridge">
        <span>↓ {t('marketing.demo.net')}</span>
      </div>

      <div className="landing-after">
        <svg
          viewBox="0 0 400 170"
          role="img"
          aria-label={t('marketing.demo.after')}
          className="landing-svg"
          data-demo="after"
        >
          <line
            className="landing-after-line"
            style={{ '--len': '212px' } as React.CSSProperties}
            x1="98"
            y1="46"
            x2="302"
            y2="46"
            stroke="var(--brand)"
            strokeWidth="3"
            strokeDasharray="212"
            markerEnd="url(#demoArrowBrand)"
          />
          <text
            className="landing-amt"
            x="200"
            y="26"
            textAnchor="middle"
            fontWeight="700"
            fill="var(--brand-ink)"
          >
            100 Kč
          </text>

          <circle
            className="landing-pop landing-n1"
            cx="64"
            cy="46"
            r="32"
            fill="var(--debt-wash)"
            stroke="var(--debt)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-n1"
            x="64"
            y="51"
            textAnchor="middle"
            fill="var(--debt)"
          >
            Jirka
          </text>
          <circle
            className="landing-pop landing-n3"
            cx="336"
            cy="46"
            r="32"
            fill="var(--brand-wash)"
            stroke="var(--brand)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-n3"
            x="336"
            y="51"
            textAnchor="middle"
            fill="var(--brand-ink)"
          >
            Honza
          </text>

          {/* The person in the middle drops out of the flow entirely — the
              whole point of the section, so it is the one node marked up. */}
          <circle
            className="landing-pop landing-n2"
            data-testid="demo-settled-mid"
            cx="200"
            cy="118"
            r="28"
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth="2"
            strokeDasharray="5 5"
          />
          <text
            className="landing-nm landing-n2"
            x="200"
            y="123"
            textAnchor="middle"
            fill="var(--ink-faint)"
          >
            Petr
          </text>
          <line
            className="landing-strike"
            style={{ '--len': '78px' } as React.CSSProperties}
            x1="173"
            y1="137"
            x2="227"
            y2="99"
            stroke="var(--ink-faint)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="78"
          />
          <text
            className="landing-amt landing-n2"
            x="200"
            y="164"
            textAnchor="middle"
            fill="var(--ink-faint)"
          >
            {t('marketing.demo.zero')}
          </text>
        </svg>

        <div className="landing-count landing-final">
          <span className="landing-count-n">{t('marketing.demo.after')}</span>
        </div>
      </div>
    </div>
  );
}

/** Arrow heads, shared by both states. `orient="auto"` turns them with the line. */
export function SettleDemoDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <marker
          id="demoArrowMuted"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0,1 L9,5 L0,9 z" fill="var(--line-strong)" />
        </marker>
        <marker
          id="demoArrowBrand"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0,1 L9,5 L0,9 z" fill="var(--brand)" />
        </marker>
        <marker
          id="demoArrowDebt"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0,1 L9,5 L0,9 z" fill="var(--debt)" />
        </marker>
      </defs>
    </svg>
  );
}

/**
 * The two scale examples, as real settlement graphs rather than lists. Same
 * component family as the hero demo so they inherit the tokens and the
 * reduced-motion behaviour.
 */
export function ScaleExamples({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof tMarketing>[1]) => tMarketing(locale, key);

  return (
    <div className="mx-auto mt-4 grid max-w-5xl gap-4 sm:grid-cols-2">
      {/* 4 people, 5 expenses: 6 pairwise debts net to 3 payments. */}
      <figure className="landing-card p-4">
        <figcaption className="landing-tally">
          <span className="landing-from">6</span>
          <span className="landing-arrow">→</span>
          <span className="landing-to">3</span>
          <span className="landing-unit">payments</span>
        </figcaption>
        <p className="landing-cap">{t('marketing.examples.cottage')}</p>
        <svg
          viewBox="0 0 200 112"
          role="img"
          aria-label={t('marketing.examples.cottageAlt')}
          className="landing-svg"
        >
          <line
            x1="68"
            y1="34"
            x2="127"
            y2="34"
            stroke="var(--debt)"
            strokeWidth="2.5"
            markerEnd="url(#demoArrowDebt)"
          />
          <line
            x1="65"
            y1="78"
            x2="129"
            y2="39"
            stroke="var(--debt)"
            strokeWidth="2.5"
            markerEnd="url(#demoArrowDebt)"
          />
          <line
            x1="68"
            y1="80"
            x2="127"
            y2="80"
            stroke="var(--debt)"
            strokeWidth="2.5"
            markerEnd="url(#demoArrowDebt)"
          />
          <circle
            cx="46"
            cy="34"
            r="20"
            fill="var(--debt-wash)"
            stroke="var(--debt)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-sm"
            x="46"
            y="38"
            textAnchor="middle"
            fill="var(--debt)"
          >
            Petr
          </text>
          <circle
            cx="46"
            cy="80"
            r="20"
            fill="var(--debt-wash)"
            stroke="var(--debt)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-sm"
            x="46"
            y="84"
            textAnchor="middle"
            fill="var(--debt)"
          >
            Jirka
          </text>
          <circle
            cx="154"
            cy="34"
            r="20"
            fill="var(--brand-wash)"
            stroke="var(--brand)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-sm"
            x="154"
            y="38"
            textAnchor="middle"
            fill="var(--brand-ink)"
          >
            Honza
          </text>
          <circle
            cx="154"
            cy="80"
            r="20"
            fill="var(--brand-wash)"
            stroke="var(--brand)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-sm"
            x="154"
            y="84"
            textAnchor="middle"
            fill="var(--brand-ink)"
          >
            Marka
          </text>
        </svg>
      </figure>

      {/* 7 people, 7 shared costs: 17 pairwise debts net to 5 payments. */}
      <figure className="landing-card p-4">
        <figcaption className="landing-tally">
          <span className="landing-from">17</span>
          <span className="landing-arrow">→</span>
          <span className="landing-to">5</span>
          <span className="landing-unit">payments</span>
        </figcaption>
        <p className="landing-cap">{t('marketing.examples.holiday')}</p>
        <svg
          viewBox="0 0 240 168"
          role="img"
          aria-label={t('marketing.examples.holidayAlt')}
          className="landing-svg"
        >
          <line
            x1="53"
            y1="32"
            x2="183"
            y2="30"
            stroke="var(--debt)"
            strokeWidth="2"
            markerEnd="url(#demoArrowDebt)"
          />
          <line
            x1="49"
            y1="69"
            x2="183"
            y2="33"
            stroke="var(--debt)"
            strokeWidth="2"
            markerEnd="url(#demoArrowDebt)"
          />
          <line
            x1="56"
            y1="106"
            x2="183"
            y2="36"
            stroke="var(--debt)"
            strokeWidth="2"
            markerEnd="url(#demoArrowDebt)"
          />
          <line
            x1="57"
            y1="109"
            x2="189"
            y2="75"
            stroke="var(--debt)"
            strokeWidth="2"
            markerEnd="url(#demoArrowDebt)"
          />
          <line
            x1="57"
            y1="112"
            x2="179"
            y2="112"
            stroke="var(--debt)"
            strokeWidth="2"
            markerEnd="url(#demoArrowDebt)"
          />
          <circle
            cx="30"
            cy="32"
            r="17"
            fill="var(--debt-wash)"
            stroke="var(--debt)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-xs"
            x="30"
            y="35.5"
            textAnchor="middle"
            fill="var(--debt)"
          >
            Pavel
          </text>
          <circle
            cx="26"
            cy="72"
            r="17"
            fill="var(--debt-wash)"
            stroke="var(--debt)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-xs"
            x="26"
            y="75.5"
            textAnchor="middle"
            fill="var(--debt)"
          >
            Jirka
          </text>
          <circle
            cx="34"
            cy="112"
            r="17"
            fill="var(--debt-wash)"
            stroke="var(--debt)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-xs"
            x="34"
            y="115.5"
            textAnchor="middle"
            fill="var(--debt)"
          >
            Petr
          </text>
          <circle
            cx="208"
            cy="30"
            r="17"
            fill="var(--brand-wash)"
            stroke="var(--brand)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-xs"
            x="208"
            y="33.5"
            textAnchor="middle"
            fill="var(--brand-ink)"
          >
            Honza
          </text>
          <circle
            cx="214"
            cy="72"
            r="17"
            fill="var(--brand-wash)"
            stroke="var(--brand)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-xs"
            x="214"
            y="75.5"
            textAnchor="middle"
            fill="var(--brand-ink)"
          >
            Lucie
          </text>
          <circle
            cx="204"
            cy="112"
            r="17"
            fill="var(--brand-wash)"
            stroke="var(--brand)"
            strokeWidth="2"
          />
          <text
            className="landing-nm landing-xs"
            x="204"
            y="115.5"
            textAnchor="middle"
            fill="var(--brand-ink)"
          >
            Katerina
          </text>
          <circle
            cx="120"
            cy="150"
            r="16"
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <text
            className="landing-nm landing-xs"
            x="120"
            y="153.5"
            textAnchor="middle"
            fill="var(--ink-faint)"
          >
            Marka
          </text>
        </svg>
      </figure>
    </div>
  );
}
