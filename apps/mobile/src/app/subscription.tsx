import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { SubHeader } from "@/components/SubHeader";
import { Button, ErrorNote, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { color, radius, space } from "@/theme/tokens";

const PLAN_NAME = { weekly: "Weekly", semiannual: "6 months", annual: "Annual" } as const;

/** Stub: real billing would hand off to the App Store / Play Store subscription settings. */
export default function Subscription() {
  const { me, refreshMe } = useSession();
  const sub = me?.subscription;
  const active = sub?.status === "active_fake";
  const cancel = useMutation({ mutationFn: api.cancelSubscription, onSuccess: () => refreshMe() });

  return (
    <Screen>
      <SubHeader title="Manage subscription" />
      <View style={{ gap: space.xl }}>
        <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space.xl, gap: space.sm, borderWidth: 1.5, borderColor: color.line }}>
          <T variant="smallStrong" color={color.inkMuted}>
            Current plan
          </T>
          <T variant="h2">{active && sub ? `${PLAN_NAME[sub.plan]} (demo)` : "Free"}</T>
          <T color={color.inkSoft}>
            {active && sub
              ? `Started ${new Date(sub.startedAt).toLocaleDateString()}. All wins are unlocked. No real payment was taken.`
              : "The first win in every goal is free. Upgrade to unlock the rest."}
          </T>
        </View>
        {cancel.error ? <ErrorNote message={(cancel.error as Error).message} /> : null}
        {active ? (
          <Button label="Cancel demo subscription" kind="danger" loading={cancel.isPending} onPress={() => cancel.mutate()} />
        ) : (
          <Button label="See plans" onPress={() => router.push("/paywall")} />
        )}
        <T variant="small" color={color.inkMuted}>
          In a production app this screen would link to your App Store or Google Play subscription settings.
        </T>
      </View>
    </Screen>
  );
}
