import { tMarketing, formatCurrency, TRIMMED_PRICE_FORMAT, type Locale } from '@evenup/i18n';
import './product.css';

/** The expense the picture shows — the same figures the captures carry. */
const SHOT_EXPENSE_MINOR = 128_000;
const SHOT_SPLIT_WAYS = 5;
const SHOT_CURRENCY = 'CZK';

/**
 * The real product as one staged moment, the page's single full-bleed plate:
 * the add-expense sheet for the chalet at Štrbské Pleso, docked to the plate's
 * foot the way a bottom sheet opens on a phone, and beside it the
 * group's balances with exactly what that expense moved — +1 024 to Lucie,
 * −256 to everyone else, drawn into each bar — set on a photograph of the
 * lake it was spent at. The UI makes the section's claim by itself; there is
 * no annotation chip explaining it.
 *
 * The captures are per-locale `.png` files in `/public/marketing`, rendered
 * from the app's own strings by `.gauntlet/product-shots/render.mjs`, so the
 * Czech page shows Czech UI and the English page English UI, with no
 * truncated names (`e2e/landing.spec.ts` asserts two served `.png`s).
 *
 * Zero layout shift: every image carries intrinsic `width`/`height` and is
 * sized by width only, so the plate's height is known before decode; the
 * backdrop is absolutely placed behind in-flow content. Motion is
 * transform/opacity only, and the base styles are the final state.
 */
export function Product({ locale }: { locale: Locale }) {
  const money = (minor: number) =>
    formatCurrency(minor, SHOT_CURRENCY, locale, TRIMMED_PRICE_FORMAT);
  return (
    <section className="lp-section lp-product" data-gauntlet="product">
      <div className="lp-wrap">
        <div className="lp-product-head lp-reveal">
          <h2 className="lp-h2">{tMarketing(locale, 'marketing.shots.title')}</h2>
          <p className="lp-lede">{tMarketing(locale, 'marketing.shots.lede')}</p>
        </div>
      </div>

      <figure className="lp-product-plate">
        <img
          className="lp-product-scene"
          src="/marketing/tatry-dusk.webp"
          width={1280}
          height={720}
          loading="lazy"
          decoding="async"
          alt=""
        />
        <div className="lp-product-stage" data-testid="app-screenshots">
          <picture>
            <source
              srcSet={`/marketing/add-expense-${locale}-760.webp 760w, /marketing/add-expense-${locale}.webp 1140w`}
              sizes="(max-width: 860px) min(405px, calc(92vw - 30px)), 400px"
              type="image/webp"
            />
            <img
              className="lp-product-shot lp-product-sheet"
              src={`/marketing/add-expense-${locale}.png`}
              width={380}
              height={539}
              loading="lazy"
              decoding="async"
              alt={tMarketing(locale, 'marketing.shots.expenseCaption')}
            />
          </picture>
          {/* The payoff card and its recalculation pass: one hairline that
              runs down the rows once, as each balance takes the expense. */}
          <div className="lp-product-card">
            <picture>
              <source
                srcSet={`/marketing/group-balances-${locale}-690.webp 690w, /marketing/group-balances-${locale}-920.webp 920w, /marketing/group-balances-${locale}.webp 1380w`}
                sizes="(max-width: 860px) min(440px, calc(100vw - 32px)), 580px"
                type="image/webp"
              />
              <img
                className="lp-product-shot lp-product-balances"
                src={`/marketing/group-balances-${locale}.png`}
                width={460}
                height={243}
                loading="lazy"
                decoding="async"
                alt={tMarketing(locale, 'marketing.shots.groupCaption', {
                  amount: money(SHOT_EXPENSE_MINOR),
                  gain: money(SHOT_EXPENSE_MINOR - SHOT_EXPENSE_MINOR / SHOT_SPLIT_WAYS),
                  share: money(SHOT_EXPENSE_MINOR / SHOT_SPLIT_WAYS),
                })}
              />
            </picture>
            <span className="lp-product-sweep" aria-hidden="true" />
          </div>
        </div>
      </figure>
    </section>
  );
}
