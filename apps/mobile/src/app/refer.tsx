import { Share, View } from "react-native";
import { Pebble } from "@/components/Pebble";
import { SubHeader } from "@/components/SubHeader";
import { Button, Screen, T } from "@/components/ui";
import { categoryColor, color, space } from "@/theme/tokens";

/** Stub: shares a plain invite. No referral codes, tracking or rewards in the MVP. */
export default function Refer() {
  return (
    <Screen>
      <SubHeader title="Refer friends" />
      <View style={{ gap: space.xl }}>
        <View style={{ flexDirection: "row", gap: -10 }} aria-hidden>
          <Pebble width={90} fill={categoryColor.sleep.tint} stroke={color.ink} shape={1} />
          <Pebble width={70} fill={color.apricot} stroke={color.ink} shape={3} />
        </View>
        <T color={color.inkSoft}>Know a parent who'd like a calmer bedtime or fewer meltdowns? Send them ParentPal.</T>
        <Button
          label="Share invite"
          icon="share"
          onPress={() =>
            Share.share({ message: "I've been using ParentPal to log little moments with my kid and spot patterns. Thought you might like it too." }).catch(() => {})
          }
        />
        <T variant="small" color={color.inkMuted}>
          Referral rewards aren't part of this demo.
        </T>
      </View>
    </Screen>
  );
}
