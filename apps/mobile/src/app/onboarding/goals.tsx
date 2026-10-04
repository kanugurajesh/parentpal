import { router } from "expo-router";
import { GoalPicker } from "@/components/GoalPicker";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { Button } from "@/components/ui";
import { useOnboarding } from "@/lib/onboarding";

export default function GoalsStep() {
  const { draft, update } = useOnboarding();
  const picked = draft.goals;

  return (
    <OnboardingFrame
      step={2}
      title="What should we work on together?"
      subtitle="Pick one or two. You can change these anytime."
      footer={<Button label={picked.length ? `Continue with ${picked.length} goal${picked.length > 1 ? "s" : ""}` : "Pick at least one"} disabled={!picked.length} onPress={() => router.push("/onboarding/parent")} />}
    >
      <GoalPicker picked={picked} onChange={(goals) => update({ goals })} />
    </OnboardingFrame>
  );
}
