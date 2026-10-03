import { router } from "expo-router";
import { Linking, View } from "react-native";
import { confirm } from "@/lib/confirm";
import { formatAge } from "@parentpal/shared";
import { ListRow, Screen, T } from "@/components/ui";
import { useSession } from "@/lib/session";
import { color, radius, space } from "@/theme/tokens";

const SUPPORT_EMAIL = "support@parentpal.example";


export default function Profile() {
  const { me, signOut } = useSession();
  const user = me?.user;
  const sub = me?.subscription;

  async function startNew() {
    const guest = user?.isGuest;
    const ok = await confirm({
      title: "Start a new profile?",
      message: guest
        ? "This phone will forget the current guest profile. Without an account you won't be able to get back to it."
        : "You'll be signed out. You can sign back in with your email anytime.",
      confirmLabel: "Start new profile",
      // A guest profile is lost for good; a signed-in one can be recovered.
      tone: guest ? "danger" : "default",
      icon: "person",
    });
    if (!ok) return;
    await signOut();
    router.replace("/onboarding");
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.lg, gap: space.xl }}>
        <T variant="h1" accessibilityRole="header">
          Profile
        </T>

        {/* Family */}
        <View style={{ backgroundColor: color.card, borderRadius: radius.hero, padding: space.xl, gap: space.md, borderWidth: 1.5, borderColor: color.line }}>
          <T variant="h3">{user?.firstName ? `${user.firstName}'s family` : "Your family"}</T>
          <T variant="small" color={color.inkSoft}>
            {user?.parentRole ? `${user.parentRole === "mother" ? "Mother" : "Father"}` : "Parent"}
            {user?.isGuest ? ", guest profile" : user?.email ? `, ${user.email}` : ""}
          </T>
          {me?.children.map((c) => (
            <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.apricotTint, alignItems: "center", justifyContent: "center" }}>
                <T variant="bodyStrong">{c.nickname.slice(0, 1).toUpperCase()}</T>
              </View>
              <View>
                <T variant="bodyStrong">{c.nickname}</T>
                <T variant="small" color={color.inkMuted}>
                  {c.sex === "girl" ? "Girl" : "Boy"}, {formatAge(c.ageMonths)}
                </T>
              </View>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: color.card, borderRadius: radius.card, overflow: "hidden", borderWidth: 1.5, borderColor: color.line }}>
          {user?.isGuest ? (
            <ListRow icon="person" label="Create account" detail="Keep your profile if you change phones" onPress={() => router.push({ pathname: "/sign-in", params: { mode: "create" } })} />
          ) : null}
          <ListRow icon="bookmark" label="Bookmarks" detail="Answers you saved from Ask" onPress={() => router.push("/bookmarks")} />
          <ListRow
            icon="spark"
            label="Manage subscription"
            detail={sub?.status === "active_fake" ? `Demo ${sub.plan} plan, active` : "Free plan"}
            onPress={() => router.push("/subscription")}
          />
          <ListRow icon="share" label="Refer friends" detail="Share ParentPal with another parent" onPress={() => router.push("/refer")} />
          <ListRow icon="ask" label="Help & support" detail={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=ParentPal%20help`)} />
          <ListRow icon="home" label="Settings" detail="Notifications, privacy and account" onPress={() => router.push("/settings")} />
        </View>

        <View style={{ backgroundColor: color.card, borderRadius: radius.card, overflow: "hidden", borderWidth: 1.5, borderColor: color.line }}>
          {user?.isGuest ? <ListRow icon="person" label="Sign in" detail="Use an existing account on this phone" onPress={() => router.push({ pathname: "/sign-in", params: { mode: "login" } })} /> : null}
          <ListRow icon="plus" label="Start new profile" onPress={startNew} />
        </View>
      </View>
    </Screen>
  );
}
