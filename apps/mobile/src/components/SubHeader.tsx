import { router } from "expo-router";
import { View } from "react-native";
import { space } from "@/theme/tokens";
import { IconButton, T } from "./ui";

export function SubHeader({ title }: { title: string }) {
  return (
    <View style={{ gap: space.sm, marginTop: space.sm, marginBottom: space.lg }}>
      <View style={{ marginLeft: -8 }}>
        <IconButton icon="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))} />
      </View>
      <T variant="h1" accessibilityRole="header">
        {title}
      </T>
    </View>
  );
}
