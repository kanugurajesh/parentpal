import type { PState } from "@/components/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Plan } from "@parentpal/shared";
import { Icon } from "@/components/Icon";
import { Button, ErrorNote, IconButton, T, styles as ui } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { color, GUTTER, radius, space } from "@/theme/tokens";

/** Prices are illustrative only. Nothing is charged: checkout writes a demo subscription row. */
const PLANS: { id: Plan; name: string; price: string; per: string; note?: string }[] = [
  { id: "weekly", name: "Weekly", price: "$4.99", per: "per week" },
  { id: "semiannual", name: "6 months", price: "$29.99", per: "about $1.15 a week" },
  { id: "annual", name: "Annual", price: "$39.99", per: "about $0.77 a week", note: "Best value" },
];

const PERKS = ["Every win for every goal", "Unlimited questions in Ask", "Pattern insights from your Story"];

export default function Paywall() {
  const { me } = useSession();
  const qc = useQueryClient();
  const [plan, setPlan] = useState<Plan>("annual");
  const [confirming, setConfirming] = useState(false);
  const child = me?.children[0]?.nickname;
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  const checkout = useMutation({
    mutationFn: () => api.subscribe(plan),
    onSuccess: async () => {
      // Entitlement changes what goals, the playbook and more return, not just /me:
      // refresh everything so the goal screen under this modal unlocks right away.
      await qc.invalidateQueries();
      close();
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.ink }} edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: GUTTER - 8, paddingTop: space.sm }}>
        <IconButton icon="close" label="Close and continue with the free plan" onPress={close} tint={color.white} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: space.xl, gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <T variant="h1" color={color.white} accessibilityRole="header">
            {child ? `Unlock every win for ${child}` : "Unlock every win"}
          </T>
          <T color="#C9D2DD">The first win in each goal is always free. Upgrade for the rest.</T>
        </View>
        <View style={{ gap: space.sm }}>
          {PERKS.map((p) => (
            <View key={p} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
              <Icon name="check" size={20} color={color.apricot} />
              <T color={color.white}>{p}</T>
            </View>
          ))}
        </View>
        <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
          {PLANS.map((p) => {
            const on = plan === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPlan(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${p.name}, ${p.price}, ${p.per}`}
                style={({ focused }: PState) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.md,
                    padding: space.lg,
                    borderRadius: radius.card,
                    borderWidth: 2,
                    borderColor: on ? color.apricot : "#3A475A",
                    backgroundColor: on ? "#2A3950" : "transparent",
                  },
                  focused && ui.focusRing,
                ]}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? color.apricot : "#6B7889", alignItems: "center", justifyContent: "center" }}>
                  {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.apricot }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <T variant="bodyStrong" color={color.white}>
                      {p.name}
                    </T>
                    {p.note ? (
                      <View style={{ backgroundColor: color.apricot, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 }}>
                        <T variant="tiny" color={color.ink}>
                          {p.note}
                        </T>
                      </View>
                    ) : null}
                  </View>
                  <T variant="small" color="#9AA6B5">
                    {p.per}
                  </T>
                </View>
                <T variant="h3" color={color.white}>
                  {p.price}
                </T>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.lg, gap: space.sm }}>
        {checkout.error ? <ErrorNote message={(checkout.error as Error).message} /> : null}
        {confirming ? (
          <View style={{ backgroundColor: "#2A3950", borderRadius: radius.card, padding: space.lg, gap: space.md }}>
            <T variant="bodyStrong" color={color.white}>
              Demo checkout
            </T>
            <T variant="small" color="#C9D2DD">
              This is a portfolio demo. No payment details are collected and nothing is charged. Continuing unlocks all wins on this profile.
            </T>
            <Button label="Unlock (demo)" kind="accent" loading={checkout.isPending} onPress={() => checkout.mutate()} />
            <Button label="Back to plans" kind="onDark" onPress={() => setConfirming(false)} />
          </View>
        ) : (
          <>
            <Button label="Continue" kind="accent" onPress={() => setConfirming(true)} />
            <Button label="Not now, use the free plan" kind="onDark" onPress={close} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
