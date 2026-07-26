import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTheme } from './theme';

/** Drag distance that dismisses, matching web's `DRAG_CLOSE_PX` in `sheet.tsx`. */
const DRAG_CLOSE_PX = 110;
/** A fast downward flick dismisses even below the distance threshold. */
const FLING_VELOCITY = 0.8;
const OPEN_MS = 260;
const CLOSE_MS = 200;

/**
 * Web's `Sheet`: `rounded-t-2xl` over a `bg-black/40` backdrop, `p-5` body,
 * `h-1 w-9 rounded-full` grab handle, `text-lg font-bold` title.
 *
 * Drag-to-dismiss works from **anywhere on the sheet**, not just the handle — a
 * 36×4pt grabber is a small target, and reaching for it is the slowest way to
 * close a sheet you can already touch.
 *
 * The enter/exit animation is hand-rolled with `animationType="none"`, because
 * the Modal's built-in `slide` translates the *whole* overlay: you'd watch the
 * dim layer's top edge travel up the screen as a hard horizontal cut, instead
 * of it fading in place while only the sheet moves.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  closeLabel = 'Close',
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /**
   * Backdrop label. A prop rather than a `useI18n()` call so the primitive
   * stays renderable without the i18n provider — callers that care pass a
   * translated string.
   */
  closeLabel?: string;
}) {
  const c = useTheme();

  /**
   * Kept separate from `visible` so the exit animation can finish before the
   * Modal unmounts — otherwise every close but the drag would be a hard cut.
   */
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  mountedRef.current = mounted;

  const translateY = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(visible ? 1 : 0)).current;

  /** Slide distance — the sheet's own height once measured, screen until then. */
  const travel = useRef(Dimensions.get('window').height);
  /** Live scroll offset — the drag may only start when the body is at the top. */
  const scrollTop = useRef(0);
  /** `PanResponder` is built once, so read `onClose` through a ref to stay fresh. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (visible) {
      // Park below the screen *before* paint, then animate in once mounted.
      translateY.setValue(travel.current);
      backdrop.setValue(0);
      setMounted(true);
      return;
    }
    if (!mountedRef.current) return;
    // Exit runs from wherever the sheet currently sits, so a drag that crosses
    // the threshold flows straight into the close instead of restarting.
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: travel.current,
        duration: CLOSE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, { toValue: 0, duration: CLOSE_MS, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, translateY, backdrop]);

  useLayoutEffect(() => {
    if (!mounted || !visible) return;
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: OPEN_MS, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 1, duration: OPEN_MS, useNativeDriver: true }),
    ]).start();
  }, [mounted, visible, translateY, backdrop]);

  const pan = useRef(
    PanResponder.create({
      // Deliberately not `onStartShouldSet…`: claiming the responder on touch
      // down would swallow taps meant for buttons and inputs inside the sheet.
      onMoveShouldSetPanResponder: (_evt, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) && scrollTop.current <= 0,
      onPanResponderMove: (_evt, g) => {
        // Downward only — dragging up must not lift the sheet off its edge.
        if (g.dy > 0) {
          translateY.setValue(g.dy);
          // Dim in step with the drag, so the sheet never floats over a fully
          // dark screen on its way out.
          backdrop.setValue(Math.max(0, 1 - g.dy / travel.current));
        }
      },
      onPanResponderRelease: (_evt, g) => {
        if (g.dy > DRAG_CLOSE_PX || g.vy > FLING_VELOCITY) {
          // Hand off to the shared exit path above rather than animating here —
          // one close animation, whatever triggered it.
          onCloseRef.current();
          return;
        }
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
          Animated.timing(backdrop, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
          Animated.timing(backdrop, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
      },
    }),
  ).current;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollTop.current = e.nativeEvent.contentOffset.y;
  };

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) travel.current = h;
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        // While closing, the overlay is still mounted but transparent, and
        // `opacity: 0` does not stop hit-testing — without this it swallows
        // every touch on the screen behind it.
        pointerEvents={visible ? 'auto' : 'none'}
        style={{
          flex: 1,
          backgroundColor: c.overlay,
          justifyContent: 'flex-end',
          opacity: backdrop,
        }}
      >
        {/* The dismiss target sits behind the sheet rather than wrapping it, so
            the dim can animate independently of the sheet's own transform. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <Animated.View
          onLayout={onSheetLayout}
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: c.radii.xl,
            borderTopRightRadius: c.radii.xl,
            maxHeight: '92%',
            transform: [{ translateY }],
          }}
          {...pan.panHandlers}
        >
          {/* Stops a tap on the sheet body from reaching the backdrop. */}
          <Pressable onPress={() => {}}>
            <View
              style={{
                alignSelf: 'center',
                width: 36,
                height: 4,
                borderRadius: c.radii.full,
                backgroundColor: c.borderInput,
                marginTop: c.spacing[2],
              }}
            />
            <ScrollView
              onScroll={onScroll}
              scrollEventThrottle={16}
              // Without this, iOS rubber-banding consumes the downward drag at
              // the top of the list and the sheet never starts moving.
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: c.spacing[5],
                // Clears the home indicator without needing the safe-area
                // provider, matching web's generous `pb` on the mobile sheet.
                paddingBottom: c.spacing[8],
                gap: c.spacing[3],
              }}
            >
              {title ? (
                <Text
                  style={{
                    fontSize: c.type.sheetTitle.fontSize,
                    fontWeight: c.type.sheetTitle.fontWeight,
                    letterSpacing: c.type.sheetTitle.letterSpacing,
                    color: c.text,
                  }}
                >
                  {title}
                </Text>
              ) : null}
              {children}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
