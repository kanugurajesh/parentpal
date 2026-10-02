import { router } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, GUTTER, radius, space } from "@/theme/tokens";
import { IconButton, T } from "./ui";

const TOTAL = 4;

/** Shared chrome for the onboarding questions: back, step progress, title, sticky footer. */
export function OnboardingFrame({
  step,
  title,
  subtitle,
  children,
  footer,
}: {
  step?: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.paper }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: GUTTER - 8, paddingTop: space.sm }}>
          <IconButton icon="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/onboarding"))} />
          {step ? (
            <View
              style={{ flex: 1, flexDirection: "row", gap: 6, paddingRight: GUTTER - 8 }}
              accessibilityRole="progressbar"
              accessibilityLabel={`Step ${step} of ${TOTAL}`}
            >
              {Array.from({ length: TOTAL }, (_, i) => (
                <View
                  key={i}
                  style={{ flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: i < step ? color.moss : color.line }}
                />
              ))}
            </View>
          ) : null}
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.xxl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.sm, maxWidth: 520 }}>
            <T variant="h1" accessibilityRole="header">
              {title}
            </T>
            {subtitle ? <T color={color.inkSoft}>{subtitle}</T> : null}
          </View>
          {children}
        </ScrollView>
        <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.lg, paddingTop: space.sm, gap: space.sm }}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
