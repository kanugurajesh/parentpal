import { Linking, Pressable, View } from "react-native";
import type { SafetyNotice } from "@parentpal/shared";
import { color, radius, space } from "@/theme/tokens";
import { T } from "./ui";

/** Plain, calm, no AI advice. Shown instead of a normal answer when a red flag is detected. */
export function SafetyCard({ notice }: { notice: SafetyNotice }) {
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: color.dangerTint, borderRadius: radius.card, padding: space.lg, gap: space.md, borderWidth: 1.5, borderColor: "#F1B7B1" }}
    >
      <T variant="h3" color={color.danger}>
        {notice.title}
      </T>
      <T color={color.ink}>{notice.body}</T>
      <View style={{ gap: space.sm }}>
        {notice.actions.map((a) => (
          <Pressable
            key={a.href}
            accessibilityRole="link"
            onPress={() => Linking.openURL(a.href)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#F6CFCA" : color.card,
              borderRadius: radius.pill,
              paddingVertical: space.md,
              paddingHorizontal: space.lg,
              borderWidth: 1.5,
              borderColor: "#F1B7B1",
            })}
          >
            <T variant="bodyStrong" color={color.danger}>
              {a.label}
            </T>
          </Pressable>
        ))}
      </View>
      <T variant="tiny" color={color.inkSoft}>
        ParentPal can't diagnose or give medical advice. When in doubt, contact a professional.
      </T>
    </View>
  );
}
