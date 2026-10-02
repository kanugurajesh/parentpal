import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { Button, Chip, ErrorNote, Field, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useOnboarding } from "@/lib/onboarding";
import { useSession } from "@/lib/session";
import { color, space } from "@/theme/tokens";

export default function ParentStep() {
  const { draft, update } = useOnboarding();
  const { signIn, refreshMe } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !!draft.parentRole && draft.firstName.trim().length > 0;

  /** The only network moment in onboarding: create the guest profile and everything in it. */
  async function createPlan() {
    setBusy(true);
    setError(null);
    try {
      const auth = await api.guest();
      await signIn(auth);
      for (const c of draft.children) {
        await api.addChild({ nickname: c.nickname.trim(), sex: c.sex!, birthMonth: c.birth!.month, birthYear: c.birth!.year });
      }
      await api.setGoals(draft.goals);
      await api.updateMe({ parentRole: draft.parentRole!, firstName: draft.firstName.trim() });
      await refreshMe();
      router.replace({ pathname: "/onboarding/ready", params: { name: draft.children[0].nickname.trim() } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <OnboardingFrame
      step={3}
      title="Almost there"
      subtitle="So we know how to talk to you."
      footer={
        <>
          {error ? <ErrorNote message={error} /> : null}
          <Button label="Create my plan" loading={busy} disabled={!ready} onPress={createPlan} />
        </>
      }
    >
      <View style={{ gap: space.sm }}>
        <T variant="smallStrong" color={color.inkSoft}>
          I'm the child's
        </T>
        <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup">
          <Chip label="Mother" selected={draft.parentRole === "mother"} onPress={() => update({ parentRole: "mother" })} />
          <Chip label="Father" selected={draft.parentRole === "father"} onPress={() => update({ parentRole: "father" })} />
        </View>
      </View>
      <Field
        label="Your first name"
        placeholder="e.g. Sam"
        value={draft.firstName}
        onChangeText={(firstName) => update({ firstName })}
        autoCapitalize="words"
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={() => ready && !busy && createPlan()}
      />
    </OnboardingFrame>
  );
}
