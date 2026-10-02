import { Stack } from "expo-router";
import { OnboardingProvider } from "@/lib/onboarding";
import { color } from "@/theme/tokens";

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper }, animation: "slide_from_right" }} />
    </OnboardingProvider>
  );
}
