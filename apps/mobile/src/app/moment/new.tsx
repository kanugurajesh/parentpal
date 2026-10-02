import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { CreateMomentResponse } from "@parentpal/shared";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { PatternCard } from "@/components/PatternCard";
import { SafetyCard } from "@/components/SafetyCard";
import { Button, Chip, ErrorNote, Field, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { color, space } from "@/theme/tokens";

const PROMPTS = ["What happened just before?", "What did they do?", "How did it end?"];

export default function NewMoment() {
  const qc = useQueryClient();
  const { me } = useSession();
  const kids = me?.children ?? [];
  const [childId, setChildId] = useState(kids[0]?.id ?? "");
  const [text, setText] = useState("");
  const [result, setResult] = useState<CreateMomentResponse | null>(null);

  const save = useMutation({
    mutationFn: () => api.addMoment(childId, text.trim()),
    onSuccess: async (res) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["moments"] }), qc.invalidateQueries({ queryKey: ["patterns"] })]);
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
      title="Add a moment"
      subtitle="A few lines is plenty. Write it the way you'd tell a friend."
      footer={
        <>
          {save.error ? <ErrorNote message={(save.error as Error).message} /> : null}
          <Button label="Save moment" loading={save.isPending} disabled={text.trim().length < 3 || !childId} onPress={() => save.mutate()} />
        </>
      }
    >
      {kids.length > 1 ? (
        <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup">
          {kids.map((k) => (
            <Chip key={k.id} label={k.nickname} selected={k.id === childId} onPress={() => setChildId(k.id)} />
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
