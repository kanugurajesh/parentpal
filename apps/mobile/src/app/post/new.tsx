import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { POST_MAX, POST_MIN, type GoalSlug, type PostKind, type SafetyNotice, type WorkedOutcome } from "@parentpal/shared";
import { KIND_LABEL, OUTCOME_LABEL } from "@/components/PostCard";
import { SafetyCard } from "@/components/SafetyCard";
import { SubHeader } from "@/components/SubHeader";
import { Button, Chip, ErrorNote, Loading, Screen, T, styles as ui } from "@/components/ui";
import { api } from "@/lib/api";
import { color, radius, space } from "@/theme/tokens";

const PLACEHOLDER: Record<PostKind, string> = {
  question: "What would you like to ask parents who've been there?",
  worked: "What did you do, and what happened? A tip for others helps too.",
  share: "A small win, a hard day, or something you noticed.",
};

/** New post. Opened from a circle, a win ("Share how it went") or a chat answer ("Ask other parents"). */
export default function NewPost() {
  const params = useLocalSearchParams<{ goal?: GoalSlug; kind?: PostKind; winId?: string; body?: string }>();
  const qc = useQueryClient();
  const circles = useQuery({ queryKey: ["circles"], queryFn: api.circles });
  const [goal, setGoal] = useState<GoalSlug | null>(params.goal ?? null);
  const chosenGoal = goal ?? circles.data?.circles[0]?.goalSlug ?? null;
  const [kind, setKind] = useState<PostKind>(params.kind ?? "question");
  const [winId, setWinId] = useState<string | null>(params.winId ?? null);
  const [outcome, setOutcome] = useState<WorkedOutcome | null>(null);
  const [body, setBody] = useState(params.body ?? "");
  const [safety, setSafety] = useState<SafetyNotice | null>(null);
  const [inReview, setInReview] = useState(false);

  const goalDetail = useQuery({ queryKey: ["goal", chosenGoal], queryFn: () => api.goal(chosenGoal!), enabled: kind === "worked" && !!chosenGoal });

  const submit = useMutation({
    mutationFn: () =>
      api.createPost(chosenGoal!, {
        kind,
        body: body.trim(),
        ...(kind === "worked" ? { winId: winId ?? undefined, outcome: outcome ?? undefined } : {}),
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["feed", chosenGoal] });
      await qc.invalidateQueries({ queryKey: ["circles"] });
      if (res.outcome === "safety") return setSafety(res.safety);
      if (res.outcome === "review") return setInReview(true);
      if (res.post) router.replace({ pathname: "/post/[id]", params: { id: res.post.id } });
    },
  });

  const length = body.trim().length;
  const ready = !!chosenGoal && length >= POST_MIN && length <= POST_MAX && (kind !== "worked" || (winId && outcome));

  if (circles.data && !circles.data.canPost) {
    return (
      <Screen>
        <SubHeader title="Join the conversation" />
        <View style={{ gap: space.lg }}>
          <T color={color.inkSoft}>Posting in Circles needs a free account. It keeps the community safe from spam, and you stay anonymous: other parents only see a nickname.</T>
          <Button label="Create free account" onPress={() => router.replace({ pathname: "/sign-in", params: { mode: "create" } })} />
          <Button label="Not now" kind="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (safety) {
    return (
      <Screen>
        <SubHeader title="We're here for you" />
        <View style={{ gap: space.lg }}>
          <T color={color.inkSoft}>We didn't post this to the circle. What you wrote sounds important, and you deserve real support right now.</T>
          <SafetyCard notice={safety} />
          <Button label="Back" kind="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (inReview) {
    return (
      <Screen>
        <SubHeader title="Thanks for sharing" />
        <View style={{ gap: space.lg }}>
          <T color={color.inkSoft}>
            Your post will appear once a moderator has checked it. Posts that mention medicines or other children's health get a second look, to keep advice in Circles safe.
          </T>
          <Button label="Back to the circle" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <SubHeader title="New post" />
      {circles.isLoading ? <Loading /> : null}
      <View style={{ gap: space.xl }}>
        {!params.goal && circles.data ? (
          <View style={{ gap: space.sm }}>
            <T variant="smallStrong" color={color.inkSoft}>
              Circle
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {circles.data.circles.map((c) => (
                <Chip key={c.goalSlug} label={c.title} selected={chosenGoal === c.goalSlug} onPress={() => (setGoal(c.goalSlug), setWinId(null))} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: space.sm }}>
          <T variant="smallStrong" color={color.inkSoft}>
            Type of post
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {(["question", "worked", "share"] as const).map((k) => (
              <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
        </View>

        {kind === "worked" ? (
          <View style={{ gap: space.lg }}>
            <View style={{ gap: space.sm }}>
              <T variant="smallStrong" color={color.inkSoft}>
                Which win did you try?
              </T>
              {goalDetail.isLoading ? <Loading /> : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {goalDetail.data?.wins.map((w) => (
                  <Chip key={w.id} label={`${w.position}. ${w.title}`} selected={winId === w.id} onPress={() => setWinId(w.id)} />
                ))}
              </View>
            </View>
            <View style={{ gap: space.sm }}>
              <T variant="smallStrong" color={color.inkSoft}>
                How did it go?
              </T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {(["helped", "somewhat", "didnt"] as const).map((o) => (
                  <Chip key={o} label={OUTCOME_LABEL[o]} selected={outcome === o} onPress={() => setOutcome(o)} />
                ))}
              </View>
              <T variant="tiny" color={color.inkMuted}>
                Your answer adds to "Parents like you" on the win, so others know what to expect.
              </T>
            </View>
          </View>
        ) : null}

        <View style={{ gap: space.sm }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={PLACEHOLDER[kind]}
            placeholderTextColor={color.inkMuted}
            accessibilityLabel="Your post"
            multiline
            maxLength={POST_MAX}
            style={[ui.input, { minHeight: 140, paddingTop: 14, textAlignVertical: "top" }]}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T variant="tiny" color={color.inkMuted}>
              {length < POST_MIN ? `At least ${POST_MIN} characters` : " "}
            </T>
            <T variant="tiny" color={color.inkMuted}>
              {length}/{POST_MAX}
            </T>
          </View>
        </View>

        <View style={{ backgroundColor: color.paperDeep, borderRadius: radius.inner, padding: space.md }}>
          <T variant="small" color={color.inkSoft}>
            Be kind. No names, numbers or links. Your child's name is replaced automatically. No medicine doses or diagnoses.
          </T>
        </View>

        {submit.error ? <ErrorNote message={(submit.error as Error).message} /> : null}
        <Button label="Post anonymously" disabled={!ready} loading={submit.isPending} onPress={() => submit.mutate()} />
      </View>
    </Screen>
  );
}
