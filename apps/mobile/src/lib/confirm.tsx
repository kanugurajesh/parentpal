import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/Icon";
import { Button, T } from "@/components/ui";
import { color, GUTTER, radius, space } from "@/theme/tokens";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** null hides the cancel button, for a plain acknowledgement. */
  cancelLabel?: string | null;
  /** "danger" for actions that delete or lose data: red icon badge and confirm button. */
  tone?: "default" | "danger";
  icon?: IconName;
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((r: Request) => void) | null = null;

/**
 * In-app confirmation dialog, styled like the rest of the app (the native Alert can't be themed,
 * and has no buttons on web). Resolves true only when the confirm button is pressed; the backdrop,
 * Cancel, Android back and Escape on web all resolve false. Needs <DialogHost /> mounted once.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(false);
    show({ ...opts, resolve });
  });
}

export function DialogHost() {
  const [req, setReq] = useState<Request | null>(null);
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    show = (r) => {
      // A dialog already open loses to the new one, as a cancel.
      setReq((prev) => {
        prev?.resolve(false);
        return r;
      });
    };
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    progress.value = reduced ? 1 : 0;
    if (!reduced) progress.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [req, reduced, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.94 + 0.06 * progress.value }, { translateY: 8 * (1 - progress.value) }],
  }));

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  const danger = req?.tone === "danger";
  return (
    <Modal visible={!!req} transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(false)}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: GUTTER }}>
        <Pressable
          onPress={() => close(false)}
          accessibilityLabel="Dismiss"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(30, 42, 58, 0.45)" }}
        />
        {req ? (
          <Animated.View
            accessibilityViewIsModal
            accessibilityRole="alert"
            style={[
              {
                width: "100%",
                maxWidth: 400,
                backgroundColor: color.card,
                borderRadius: radius.hero - 4,
                padding: space.xl,
                gap: space.lg,
                shadowColor: color.ink,
                shadowOpacity: 0.18,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 12 },
                elevation: 12,
              },
              cardStyle,
            ]}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: danger ? color.dangerTint : color.mossTint,
              }}
            >
              <Icon name={req.icon ?? (danger ? "trash" : "spark")} size={24} color={danger ? color.danger : color.moss} />
            </View>
            <View style={{ gap: space.sm }}>
              <T variant="h3" accessibilityRole="header">
                {req.title}
              </T>
              <T color={color.inkSoft}>{req.message}</T>
            </View>
            {/* Stacked, confirm on top: full-width targets, and long labels never truncate. */}
            <View style={{ gap: space.sm, marginTop: space.xs }}>
              <Button
                label={req.confirmLabel}
                kind="primary"
                onPress={() => close(true)}
                style={danger ? { backgroundColor: color.danger, borderColor: color.danger } : undefined}
              />
              {req.cancelLabel !== null ? <Button label={req.cancelLabel ?? "Cancel"} kind="secondary" onPress={() => close(false)} /> : null}
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
