import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { CreateMomentResponse, WorkedOutcome } from "@parentpal/shared";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { PatternCard } from "@/components/PatternCard";
import { OutcomePicker } from "@/components/Progress";
import { SafetyCard } from "@/components/SafetyCard";
import { Button, Chip, ErrorNote, Field, T } from "@/components/ui";
import { api } from "@/lib/api";
import { removeCheckIn, syncNotifications } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { color, space } from "@/theme/tokens";

const PROMPTS = ["What happened just before?", "What did they do?", "How did it end?"];

export default function NewMoment() {
  const qc = useQueryClient();
  const { me, meError, refreshMe } = useSession();
  // Set when opened from a "How did it go?" check-in notification, or from a win on the goal screen.
  const { tried, tryId, goal } = useLocalSearchParams<{ tried?: string; tryId?: string; goal?: string }>();
  const [outcome, setOutcome] = useState<WorkedOutcome | null>(null);
  const kids = me?.children ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  // Derived, not initial state: opened from a notification on cold start, /me may not have loaded yet.
  const childId = picked ?? kids[0]?.id ?? "";
  const [text, setText] = useState(tried ? `Tried "${tried}". ` : "");
  const [result, setResult] = useState<CreateMomentResponse | null>(null);

  const save = useMutation({
    // With a try and an outcome, the note is saved through the try so it also counts as progress.
    mutationFn: async (): Promise<CreateMomentResponse> => {
      if (!tryId || !outcome) return api.addMoment(childId, text.trim());
      const res = await api.reportOutcome(tryId, { outcome, text: text.trim() });
      await removeCheckIn({ tryId });
      return res.moment!;
    },
    onSuccess: async (res) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["moments"] }),
        qc.invalidateQueries({ queryKey: ["patterns"] }),
        qc.invalidateQueries({ queryKey: ["progress"] }),
        ...(goal ? [qc.invalidateQueries({ queryKey: ["goal", goal] })] : []),
      ]);
      void syncNotifications(); // a new moment resets the quiet-days reminder
      if (res.safety || res.newPattern) setResult(res);
      else router.back();
    },
  });

  if (result) {
    return (
      <OnboardingFrame
        title={result.safety ? "Moment saved" : "You found a pattern"}
        footer={<Button label={result.safety ? "Close" : "See it in Story"} onPress={() => (result.safety ? router.back() : (router.back(), router.navigate("/(tabs)/story")))} />}
      >
        {result.safety ? <SafetyCard notice={result.safety} /> : null}
        {result.newPattern ? <PatternCard pattern={result.newPattern} moments={qc.getQueryData<{ moments: never[] }>(["moments"])?.moments ?? [result.moment]} /> : null}
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      title={tried ? "How did it go?" : "Add a moment"}
      subtitle={
        tried
          ? "What happened when you tried it? Even \"it didn't work\" is useful: patterns come from both."
          : "A few lines is plenty. Write it the way you'd tell a friend."
      }
      footer={
        <>
          {!me && meError ? <ErrorNote message={meError.message} onRetry={() => void refreshMe()} /> : null}
          {save.error ? <ErrorNote message={(save.error as Error).message} /> : null}
          <Button label="Save moment" loading={save.isPending} disabled={text.trim().length < 3 || !childId} onPress={() => save.mutate()} />
        </>
      }
    >
      {tryId ? (
        <View style={{ gap: space.sm }}>
          <T variant="smallStrong" color={color.inkSoft}>
            Did it help?
          </T>
          <OutcomePicker value={outcome} onPick={setOutcome} />
        </View>
      ) : null}
      {kids.length > 1 && !tryId ? (
        <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup">
          {kids.map((k) => (
            <Chip key={k.id} label={k.nickname} selected={k.id === childId} onPress={() => setPicked(k.id)} />
          ))}
        </View>
      ) : null}
      <Field
        label="What happened?"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={1000}
        placeholder="We had to leave the park and he lay on the floor screaming. He calmed down after a hug."
        style={{ minHeight: 160, paddingTop: space.md, textAlignVertical: "top" }}
        autoFocus
      />
      <View style={{ gap: space.xs }}>
        <T variant="smallStrong" color={color.inkSoft}>
          It helps to mention
        </T>
        {PROMPTS.map((p) => (
          <T key={p} variant="small" color={color.inkMuted}>
            {p}
          </T>
        ))}
      </View>
      <T variant="tiny" color={color.inkMuted}>
        ParentPal's AI tags each moment (before, what happened, how it ended) to find patterns. AI-generated, not medical advice.
      </T>
    </OnboardingFrame>
  );
}
