'use client';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useSession, signOut } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Settings, LogOut, Users, Gem, Languages, Shield, GroupIcon } from '@/components/icons';
import { AppLink } from '@/components/app-link';
import { Painted } from '@/components/ui';
import { useLocaleSwitch } from '@/components/locale-toggle';

export function Header() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const me = trpc.user.me.useQuery(undefined, { enabled: !!session?.user });
  // lg rail: your groups under "Groups" (Linear's team list), one click from
  // anywhere. The same cached query the home list uses; phones never show it.
  const groups = trpc.group.list.useQuery(undefined, { enabled: !!session?.user });
  const railGroups = (groups.data ?? []).slice(0, 8);
  const pathname = usePathname();
  const { other, otherName, go: switchLocale } = useLocaleSwitch();

  const onGroups = /\/groups(\/|$)/.test(pathname ?? '');
  const onSettings = /\/settings(\/|$)/.test(pathname ?? '');
  const onAdmin = /\/admin(\/|$)/.test(pathname ?? '');
  const onVip = /\/vip(\/|$)/.test(pathname ?? '');
  const photo = me.data && !me.data.hideProfilePhoto ? me.data.image : null;

  /*
   * One set of nav items, three layouts (app/app.css, "Bar"):
   *
   *  - phones/tablets, signed in: a bottom tab bar in the thumb's zone —
   *    Groups, VIP, Settings (and Admin for admins), each an icon over its
   *    word. A screen's primary action (Fab) is not a tab: it floats just
   *    above the bar's right end, so the tabs keep the full width. No top bar: the page title is the
   *    top of the screen. Language lives in Settings (LocaleToggle).
   *  - phones/tablets, signed out: a slim top bar, wordmark + language code.
   *  - `lg`: a fixed left rail with labelled rows, the screen's primary action
   *    docked under the wordmark (see Fab) and the account rows at the bottom.
   *    `order-*` re-sequences without a second copy of a link.
   */
  const item =
    'app-nav-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';
  const icon = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const;

  return (
    <header className={`app-bar${session?.user ? ' app-bar-user' : ''}`}>
      <div className="app-bar-inner">
        <AppLink href="/groups" aria-label={t('app.name')} className="app-wordmark">
          <BrandMark />
          <span aria-hidden>{t('app.name')}</span>
        </AppLink>
        <nav className="app-nav">
          {session?.user ? (
            <>
              <AppLink
                href="/groups"
                className={`${item} app-nav-tab order-0`}
                aria-current={onGroups ? 'page' : undefined}
              >
                <Users {...icon} className="app-nav-icon" />
                <span className="app-nav-label">{t('nav.groups')}</span>
              </AppLink>
              {railGroups.length > 0 ? (
                <ul className="app-rail-groups order-0" aria-label={t('groups.list')}>
                  {railGroups.map((g) => {
                    const here = new RegExp(`/groups/${g.id}(/|$)`).test(pathname ?? '');
                    return (
                      <li key={g.id}>
                        <AppLink
                          href={`/groups/${g.id}`}
                          className={`${item} app-rail-group`}
                          aria-label={g.name}
                          aria-current={here ? 'page' : undefined}
                        >
                          <span className="app-nav-icon app-rail-group-icon" aria-hidden>
                            <GroupIcon template={g.template} size={15} strokeWidth={1.9} />
                          </span>
                          <Painted text={g.name} className="app-nav-label truncate" />
                        </AppLink>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <AppLink
                href="/vip"
                className={`${item} app-nav-tab order-1 lg:order-1`}
                data-testid="nav-vip"
                aria-current={onVip ? 'page' : undefined}
              >
                <Gem {...icon} className="app-nav-icon" />
                <span className="app-nav-label">{t('nav.vip')}</span>
              </AppLink>
              {me.data?.isAdmin ? (
                <AppLink
                  href="/admin"
                  className={`${item} app-nav-tab order-3 lg:order-1`}
                  data-testid="nav-admin"
                  aria-current={onAdmin ? 'page' : undefined}
                >
                  <Shield {...icon} className="app-nav-icon" />
                  <span className="app-nav-label">{t('nav.admin')}</span>
                </AppLink>
              ) : null}
            </>
          ) : null}
          <span role="group" aria-label={t('common.language')} className="contents">
            <button
              type="button"
              onClick={switchLocale}
              className={`${item} app-nav-lang order-5 lg:order-4`}
              title={t('common.language')}
              lang={other}
            >
              <span className="app-nav-code">{other.toUpperCase()}</span>
              <Languages {...icon} className="app-nav-icon" />
              <span className="app-nav-label">{otherName}</span>
            </button>
          </span>
          <span aria-hidden className="hidden lg:order-3 lg:block lg:flex-1" />
          {session?.user ? (
            <>
              <AppLink
                href="/settings"
                className={`${item} app-nav-tab app-nav-settings order-2 lg:order-2`}
                aria-current={onSettings ? 'page' : undefined}
              >
                {photo ? (
                  <span className="app-nav-icon app-nav-photo" aria-hidden>
                    <img src={photo} alt="" />
                  </span>
                ) : (
                  <Settings {...icon} className="app-nav-icon" />
                )}
                <span className="app-nav-label">{t('nav.settings')}</span>
              </AppLink>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label={t('nav.signOut')}
                title={t('nav.signOut')}
                className={`${item} app-nav-rail order-6 lg:order-5`}
              >
                <LogOut {...icon} className="app-nav-icon" />
                <span className="app-nav-label">{t('nav.signOut')}</span>
              </button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

/** The product's mark (public/icon.svg): the evened-up "€" in the accent. */
function BrandMark() {
  return (
    <svg viewBox="0 0 512 512" width="26" height="26" aria-hidden className="app-mark">
      <g transform="translate(63.95 437.8) scale(0.5121)">
        <path
          d="M435 16Q349 16 282.5-31.5Q216-79 179.5-163Q143-247 143-354L143-354Q143-461 179.5-546Q216-631 282-678.5Q348-726 435-726L435-726Q496-726 547.5-697.5Q599-669 634.5-618Q670-567 685-502L685-502L595-496Q578-562 535-602Q492-642 435-642L435-642Q370-642 324.5-605Q279-568 256-502.5Q233-437 233-354L233-354Q233-271 256.5-206.5Q280-142 325.5-105Q371-68 435-68L435-68Q495-68 539.5-113Q584-158 599-230L599-230L691-224Q678-154 643.5-99.5Q609-45 555.5-14.5Q502 16 435 16L435 16Z"
          strokeWidth="70"
          strokeLinejoin="round"
        />
        <path
          d="M59-235L59-309L460-309L449-235L59-235ZM59-389L59-463L480-463L469-389L59-389Z"
          strokeWidth="24"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
