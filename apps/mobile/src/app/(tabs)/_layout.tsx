import { useQuery } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { api } from "@/lib/api";
import { useNotificationSync, useNotificationTaps } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { color, font } from "@/theme/tokens";

const icon =
  (name: IconName) =>
  ({ color: c, focused }: { color: ColorValue; focused: boolean }) => <Icon name={name} size={24} color={c as string} filled={focused && name !== "story"} />;

export default function TabsLayout() {
  const { hasSession, me } = useSession();
  const notes = useQuery({ queryKey: ["notifications"], queryFn: api.notifications, enabled: hasSession });
  useNotificationSync(hasSession);
  useNotificationTaps(hasSession);
  if (!hasSession) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.moss,
        tabBarInactiveTintColor: color.inkMuted,
        tabBarStyle: { backgroundColor: color.card, borderTopColor: color.line, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: font.bodyBold, fontSize: 11 },
        sceneStyle: { backgroundColor: color.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="story" options={{ title: "Story", tabBarIcon: icon("story") }} />
      <Tabs.Screen name="ask" options={{ title: "Ask", tabBarIcon: icon("ask") }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: icon("bell"),
          tabBarBadge: notes.data?.unread && me?.user.notificationsEnabled !== false ? notes.data.unread : undefined,
          tabBarBadgeStyle: { backgroundColor: color.apricot, color: color.ink, fontFamily: font.bodyBold },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person") }} />
    </Tabs>
  );
}
