import { Image, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { readableTextColor } from '@evenup/core';
import { useTheme } from '@/ui/theme';

/** Web's `h-5/h-7/h-9/h-11` chip sizes and their `text-*` counterparts. */
const SIZES = {
  xs: { box: 20, font: 9 },
  sm: { box: 28, font: 12 },
  md: { box: 36, font: 14 },
  lg: { box: 44, font: 16 },
} as const;

export type MemberChipSize = keyof typeof SIZES;

/** Numeric sizes keep the web ratio (`text-sm` inside `h-9` ≈ 0.39). */
function resolveSize(size: MemberChipSize | number) {
  if (typeof size === 'number') return { box: size, font: Math.round(size * 0.39) };
  return SIZES[size];
}

/**
 * Colored member chip with initials — mirrors web's `MemberChip`.
 *
 * Color is never the only signal (the initials + accessibility label accompany
 * it) and the text color is computed for contrast (PRD §9.4). The monogram sits
 * *under* the photo so a transparent or late-loading image still shows initials
 * rather than an empty circle.
 */
export function MemberChip({
  initials,
  color,
  name,
  selected,
  size = 'md',
  onPress,
  imageUrl,
  style,
}: {
  initials: string;
  color: string;
  name?: string;
  selected?: boolean;
  /** Web's named steps, or a raw pixel diameter for bespoke call sites. */
  size?: MemberChipSize | number;
  onPress?: () => void;
  /** Profile picture; when set it covers the monogram (which stays as fallback). */
  imageUrl?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const { box, font } = resolveSize(size);
  const textColor = readableTextColor(color);

  const inner = (
    <View
      style={[
        {
          width: box,
          height: box,
          // shrink-0: in a tight flex row a long sibling name would otherwise
          // squeeze the circle into a pill.
          flexShrink: 0,
          borderRadius: c.radii.full,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          // Web's `ring-2` on the selected chip. Drawn inside so selecting a
          // chip never reflows the row it sits in.
          borderWidth: selected ? 2 : 0,
          borderColor: c.text,
        },
        style,
      ]}
    >
      <Text style={{ color: textColor, fontWeight: '600', fontSize: font }}>{initials}</Text>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          accessibilityIgnoresInvertColors
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={name ?? initials}
        // Press feedback is a transient scale, never a hover state — a latched
        // hover leaves an enlarged chip overlapping its neighbours on touch.
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.95 : 1 }] })}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View accessibilityRole="image" accessibilityLabel={name ?? initials}>
      {inner}
    </View>
  );
}

/** Overlapping avatar row with a "+N" overflow badge — web's `AvatarStack`. */
export function AvatarStack({
  members,
  max = 5,
}: {
  members: {
    id: string;
    initials: string;
    color: string;
    displayName: string;
    imageUrl?: string | null;
  }[];
  max?: number;
}) {
  const c = useTheme();
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  // Web's `-ml-1.5` overlap plus a `ring-2` in the surface colour, so adjacent
  // chips stay legible against each other.
  const ring = (first: boolean) => ({
    marginLeft: first ? 0 : -c.spacing[1.5],
    borderRadius: c.radii.full,
    borderWidth: 2,
    borderColor: c.card,
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <View key={m.id} style={ring(i === 0)}>
          <MemberChip
            initials={m.initials}
            color={m.color}
            name={m.displayName}
            imageUrl={m.imageUrl}
            size="sm"
          />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={[
            ring(shown.length === 0),
            {
              width: SIZES.sm.box,
              height: SIZES.sm.box,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.track,
            },
          ]}
        >
          <Text
            style={{
              color: c.textSecondary,
              fontSize: SIZES.sm.font,
              fontWeight: '600',
            }}
          >
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
