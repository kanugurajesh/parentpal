import { View, type StyleProp, type ViewStyle } from "react-native";
import { useActiveChild, useSession } from "@/lib/session";
import { space } from "@/theme/tokens";
import { Chip } from "./ui";

/**
 * Which child Home, Story and Ask are about. Only shown with two or more children; the choice is
 * shared by every screen and remembered on this phone.
 */
export function ChildSwitcher({ style }: { style?: StyleProp<ViewStyle> }) {
  const { me, setActiveChild } = useSession();
  const active = useActiveChild();
  const kids = me?.children ?? [];
  if (kids.length < 2) return null;
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }, style]} accessibilityRole="radiogroup" accessibilityLabel="Which child">
      {kids.map((c) => (
        <Chip key={c.id} label={c.nickname} selected={c.id === active?.id} onPress={() => setActiveChild(c.id)} />
      ))}
    </View>
  );
}
