import { router } from "expo-router";
import { View } from "react-native";
import { MAX_CHILDREN } from "@parentpal/shared";
import { BirthDatePicker } from "@/components/BirthDatePicker";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { Button, Chip, Field, T } from "@/components/ui";
import { childIsComplete, useOnboarding } from "@/lib/onboarding";
import { color, radius, space } from "@/theme/tokens";

export default function ChildStep() {
  const { draft, updateChild, addChild, removeChild } = useOnboarding();
  const ready = draft.children.every(childIsComplete);

  return (
    <OnboardingFrame
      step={1}
      title="Let's start with your little one"
      subtitle="A nickname is perfect. We only keep the month and year they were born."
      footer={<Button label="Continue" disabled={!ready} onPress={() => router.push("/onboarding/intro")} />}
    >
      {draft.children.map((child, i) => (
        <View
          key={i}
          style={[{ gap: space.lg }, i > 0 && { borderTopWidth: 1.5, borderColor: color.line, paddingTop: space.xl }]}
        >
          {draft.children.length > 1 ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T variant="h3">{i === 0 ? "First child" : "Second child"}</T>
              {i > 0 ? <Button label="Remove" kind="ghost" onPress={() => removeChild(i)} /> : null}
            </View>
          ) : null}
          <Field
            label="Nickname"
            placeholder="e.g. Mo"
            value={child.nickname}
            onChangeText={(nickname) => updateChild(i, { nickname })}
            maxLength={30}
            autoCapitalize="words"
            returnKeyType="done"
          />
          <View style={{ gap: space.sm }}>
            <T variant="smallStrong" color={color.inkSoft}>
              Your child is a
            </T>
            <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup">
              <Chip label="Girl" selected={child.sex === "girl"} onPress={() => updateChild(i, { sex: "girl" })} />
              <Chip label="Boy" selected={child.sex === "boy"} onPress={() => updateChild(i, { sex: "boy" })} />
            </View>
          </View>
          <BirthDatePicker label="Date of birth" value={child.birth} onChange={(birth) => updateChild(i, { birth })} />
        </View>
      ))}
      {draft.children.length < MAX_CHILDREN ? (
        <View style={{ borderRadius: radius.card, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.line, padding: space.lg, gap: space.sm }}>
          <T variant="small" color={color.inkSoft}>
            Got two little ones? Add them both and switch between their stories later.
          </T>
          <Button label="Add a second child" kind="secondary" icon="plus" onPress={addChild} />
        </View>
      ) : null}
    </OnboardingFrame>
  );
}
