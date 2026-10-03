import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SubHeader } from "@/components/SubHeader";
import { Button, ErrorNote, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { color, radius, space } from "@/theme/tokens";
import { confirm } from "@/lib/confirm";

export default function Settings() {
  const { signOut, me } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    const ok = await confirm({
      title: "Delete your account?",
      message:
        "This permanently deletes your family profile, children, moments, patterns, chats, bookmarks and notifications from our server. This can't be undone.",
      confirmLabel: "Delete everything",
      cancelLabel: "Keep my account",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteMe();
      await signOut();
      router.replace("/onboarding");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <SubHeader title="Settings" />
      <View style={{ gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <T variant="h3">What we store</T>
          <T color={color.inkSoft}>
            Your first name and role, each child's nickname and birth month and year (never the full date), your goals, the moments you log, and your Ask conversations. LLM usage is logged as token counts and cost only, never the text.
          </T>
        </View>
        <View style={{ backgroundColor: color.dangerTint, borderRadius: radius.card, padding: space.xl, gap: space.md }}>
          <T variant="h3" color={color.danger}>
            Delete account
          </T>
          <T color={color.ink}>
            Removes everything above for {me?.user.firstName ?? "this profile"}, immediately and permanently.
          </T>
          {error ? <ErrorNote message={error} /> : null}
          <Button label="Delete account" kind="danger" loading={busy} onPress={deleteAccount} />
        </View>
      </View>
    </Screen>
  );
}
