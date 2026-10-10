import { AlertCircle } from '@/components/icons';

/**
 * The frame every signed-out / first-run screen shares (sign-in, sign-up,
 * onboarding): a left-aligned title and lede, the form, and an optional
 * footer that switches to the sibling screen.
 *
 * Phones (the case that matters): no card — the form sits on the ground
 * under the slim top bar, and the footer is pushed to the bottom of the
 * viewport, into the thumb's zone, above the home indicator. From `sm` the
 * same parts become one composed card in the middle of the screen, the
 * footer a divided strip along its bottom edge (Mercury's log-in panel).
 * See "Auth" in app/app.css.
 */
export function AuthScreen({
  title,
  lede,
  footer,
  children,
  testId,
  icon,
}: {
  icon?: React.ReactNode;
  title: string;
  lede?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="app-auth" data-testid={testId}>
      <div className="app-auth-panel">
        <div className="app-auth-main">
          <header className="app-auth-head">
            {icon ? (
              <span className="app-auth-icon" aria-hidden>
                {icon}
              </span>
            ) : null}
            <h1 className="app-auth-title">{title}</h1>
            {lede ? <p className="app-auth-lede">{lede}</p> : null}
          </header>
          {children}
        </div>
        {footer ? <div className="app-auth-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/** A field's quiet helper line under the input. */
export function FieldHint({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="app-auth-hint">
      {children}
    </p>
  );
}

/** A form-level error: announced, and marked with a glyph as well as colour. */
export function AuthError({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p role="alert" className="app-auth-error" data-testid={testId}>
      <AlertCircle size={16} strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </p>
  );
}
