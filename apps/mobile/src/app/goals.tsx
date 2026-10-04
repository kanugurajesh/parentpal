import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { GoalSlug } from "@parentpal/shared";
import { GoalPicker } from "@/components/GoalPicker";
import { SubHeader } from "@/components/SubHeader";
import { Button, ErrorNote, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { GOAL_CHOICES } from "@/lib/goals";
import { useSession } from "@/lib/session";
import { color, space } from "@/theme/tokens";

/** Change the goals picked in onboarding. Wins, the Family playbook and daily ideas all follow these. */
export default function EditGoals() {
  const qc = useQueryClient();
  const { me } = useSession();
  const [picked, setPicked] = useState<GoalSlug[] | null>(null);

  // Start from the saved goals once they've loaded.
  useEffect(() => {
    if (me && picked === null) setPicked(me.goals);
  }, [me, picked]);

  const save = useMutation({
    mutationFn: api.setGoals,
    onSuccess: async (next) => {
      qc.setQueryData(["me"], next);
      // Goals feed Home, wins, circles, the playbook and notifications: refresh everything.
      await qc.invalidateQueries();
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)");
    },
  });

  const unchanged = !!me && !!picked && picked.join() === me.goals.join();
  const onlyComingSoon = !!picked?.length && picked.every((s) => !GOAL_CHOICES.find((g) => g.slug === s)?.ready);

  return (
    <Screen>
      <SubHeader title="Your goals" />
      {!picked ? (
        <Loading />
      ) : (
        <View style={{ gap: space.lg }}>
          <T color={color.inkSoft}>Pick one or two. The first one leads your home screen.</T>
          <GoalPicker picked={picked} onChange={setPicked} />
          {onlyComingSoon ? (
            <T variant="small" color={color.inkMuted}>
              Guides for these goals are coming soon, so there are no wins to try or share with family yet. Add a goal with a guide to get started now.
            </T>
          ) : null}
          {save.error ? <ErrorNote message={(save.error as Error).message} /> : null}
          <Button
            label={picked.length ? "Save goals" : "Pick at least one"}
            disabled={!picked.length || unchanged}
            loading={save.isPending}
            onPress={() => save.mutate(picked)}
          />
        </View>
      )}
    </Screen>
  );
}
