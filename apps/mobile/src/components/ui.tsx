import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AI_DISCLAIMER } from "@parentpal/shared";
import { color, GUTTER, radius, space, type as typeScale } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";

/** RN types only declare `pressed`; react-native-web also passes hovered/focused at runtime. */
export type PState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

/* ---------------- Typography ---------------- */

type Variant = keyof typeof typeScale;
export function T({ variant = "body", color: col = color.ink, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...rest} style={[typeScale[variant] as TextStyle, { color: col }, style]} />;
}

/* ---------------- Layout ---------------- */

export function Screen({
  children,
  scroll = true,
  edges = ["top"],
  contentStyle,
  ...rest
}: { children: ReactNode; scroll?: boolean; edges?: ("top" | "bottom")[]; contentStyle?: StyleProp<ViewStyle> } & ScrollViewProps) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.scrollContent, contentStyle]} keyboardShouldPersistTaps="handled" {...rest}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/* ---------------- Buttons ---------------- */

type ButtonKind = "primary" | "accent" | "secondary" | "ghost" | "onDark" | "danger";
export function Button({
  label,
  onPress,
  kind = "primary",
  icon,
  loading,
  disabled,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const palette = {
    primary: { bg: color.moss, fg: color.white, border: color.moss },
    secondary: { bg: color.card, fg: color.ink, border: color.line },
    accent: { bg: color.apricot, fg: color.ink, border: color.apricot },
    ghost: { bg: "transparent", fg: color.moss, border: "transparent" },
    onDark: { bg: "transparent", fg: color.white, border: "transparent" },
    danger: { bg: color.dangerTint, fg: color.danger, border: color.dangerTint },
  }[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed, hovered, focused }: PState) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.5 : 1 },
        kind === "primary" && pressed && { backgroundColor: color.mossDeep },
        kind === "accent" && pressed && { backgroundColor: "#E8913F" },
        (kind === "secondary" || kind === "ghost" || kind === "danger") && (pressed || hovered) && { backgroundColor: kind === "ghost" ? color.mossTint : color.paperDeep },
        kind === "onDark" && (pressed || hovered) && { backgroundColor: "#2A3950" },
        focused && styles.focusRing,
        { transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : icon ? <Icon name={icon} size={20} color={palette.fg} /> : null}
      <T variant="bodyStrong" color={palette.fg}>
        {label}
      </T>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  active,
  tint = color.inkSoft,
  size = 40,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  tint?: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={6}
      style={({ pressed, focused }: PState) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" },
        (pressed || active) && { backgroundColor: active ? color.mossTint : color.paperDeep },
        focused && styles.focusRing,
      ]}
    >
      <Icon name={icon} size={20} color={active ? color.moss : tint} filled={active} />
    </Pressable>
  );
}

/* ---------------- Chips ---------------- */

export function Chip({
  label,
  selected,
  onPress,
  tint = color.mossTint,
  fg = color.moss,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tint?: string;
  fg?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed, focused }: PState) => [
        styles.chip,
        selected ? { backgroundColor: color.ink, borderColor: color.ink } : { backgroundColor: color.card, borderColor: color.line },
        pressed && !selected && { backgroundColor: tint },
        focused && styles.focusRing,
      ]}
    >
      {selected ? <Icon name="check" size={16} color={color.white} /> : null}
      <T variant="smallStrong" color={selected ? color.white : color.ink}>
        {label}
      </T>
    </Pressable>
  );
}

/* ---------------- Inputs ---------------- */

export const Field = forwardRef<TextInput, TextInputProps & { label: string; hint?: string; error?: string | null }>(
  function Field({ label, hint, error, style, ...rest }, ref) {
    return (
      <View style={{ gap: space.sm }}>
        <T variant="smallStrong" color={color.inkSoft}>
          {label}
        </T>
        <TextInput
          ref={ref}
          placeholderTextColor={color.inkMuted}
          accessibilityLabel={label}
          style={[styles.input, error ? { borderColor: color.danger } : null, style]}
          {...rest}
        />
        {error ? (
          <T variant="small" color={color.danger}>
            {error}
          </T>
        ) : hint ? (
          <T variant="small" color={color.inkMuted}>
            {hint}
          </T>
        ) : null}
      </View>
    );
  },
);

/* ---------------- Misc ---------------- */

export function Disclaimer({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.disclaimer, style]} accessibilityRole="text">
      <Icon name="spark" size={14} color={color.inkMuted} />
      <T variant="tiny" color={color.inkMuted}>
        {AI_DISCLAIMER}
      </T>
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorNote} accessibilityRole="alert">
      <T variant="small" color={color.danger} style={{ flex: 1 }}>
        {message}
      </T>
      {onRetry ? <Button label="Try again" kind="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: space.xxl, alignItems: "center" }}>
      <ActivityIndicator color={color.moss} />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>{children}</View>;
}

export function ListRow({
  label,
  detail,
  onPress,
  icon,
  danger,
}: {
  label: string;
  detail?: string;
  onPress?: () => void;
  icon?: IconName;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed, focused }: PState) => [
        styles.listRow,
        pressed && { backgroundColor: color.paperDeep },
        focused && styles.focusRing,
      ]}
    >
      {icon ? <Icon name={icon} size={22} color={danger ? color.danger : color.inkSoft} /> : null}
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong" color={danger ? color.danger : color.ink}>
          {label}
        </T>
        {detail ? (
          <T variant="small" color={color.inkMuted}>
            {detail}
          </T>
        ) : null}
      </View>
      <Icon name="chevronRight" size={18} color={color.inkMuted} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scrollContent: { paddingHorizontal: GUTTER, paddingBottom: space.xxxl },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderWidth: 1.5,
  },
  // Focus is drawn by the global :focus-visible rule on web (keyboard only); see lib/webStyles.
  focusRing: {} as ViewStyle,
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  input: {
    ...typeScale.body,
    color: color.ink,
    backgroundColor: color.card,
    borderWidth: 1.5,
    borderColor: color.line,
    borderRadius: radius.inner,
    paddingHorizontal: space.lg,
    minHeight: 52,
  },
  disclaimer: { flexDirection: "row", alignItems: "center", gap: 6 },
  errorNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: color.dangerTint,
    borderRadius: radius.inner,
    padding: space.md,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: 56,
  },
});
