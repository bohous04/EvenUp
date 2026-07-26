import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from './theme';

/**
 * Web's `SectionLabel`: `text-[11px] font-semibold uppercase tracking-widest`.
 *
 * `zinc-500`, not `zinc-400` — at this size `zinc-400` on white is 2.6:1 and
 * fails WCAG AA. Dark mode keeps `zinc-400` (6.7:1 on the card).
 */
export function SectionLabel({ children }: { children: string }) {
  const c = useTheme();
  return (
    <Text
      style={{
        color: c.textMuted,
        fontSize: c.type.section.fontSize,
        fontWeight: c.type.section.fontWeight,
        letterSpacing: c.type.section.letterSpacing,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

/** Page title — web `text-2xl font-extrabold tracking-tight`. */
export function Title({ children, numberOfLines }: { children: string; numberOfLines?: number }) {
  const c = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      accessibilityRole="header"
      style={{
        color: c.text,
        fontSize: c.type.title.fontSize,
        fontWeight: c.type.title.fontWeight,
        letterSpacing: c.type.title.letterSpacing,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * The two-tone EvenUp wordmark — `Even` in body colour, `Up` in brand.
 * Web renders this identically in the header and on every auth screen.
 */
export function Wordmark({ size }: { size?: 'lg' | 'sm' }) {
  const c = useTheme();
  const fontSize = size === 'sm' ? c.type.sheetTitle.fontSize : c.type.wordmark.fontSize;
  return (
    <Text
      accessibilityLabel="EvenUp"
      style={{
        color: c.text,
        fontSize,
        fontWeight: '800',
        letterSpacing: fontSize * -0.025,
        textAlign: 'center',
      }}
    >
      Even<Text style={{ color: c.brandText }}>Up</Text>
    </Text>
  );
}

/** Web's `EmptyState`: centred icon over muted 14px text. */
export function EmptyState({ title, icon }: { title: string; icon?: ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: c.spacing[2], paddingVertical: c.spacing[6] }}>
      {icon}
      <Text style={{ color: c.textMuted, fontSize: c.type.label.fontSize, textAlign: 'center' }}>
        {title}
      </Text>
    </View>
  );
}

/** Inline error text — web `text-sm text-red-700 dark:text-red-400`, `role="alert"`. */
export function ErrorText({ children }: { children: string }) {
  const c = useTheme();
  return (
    <Text
      accessibilityRole="alert"
      style={{ color: c.dangerText, fontSize: c.type.label.fontSize }}
    >
      {children}
    </Text>
  );
}
