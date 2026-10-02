import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

export default function Index() {
  const { hasSession } = useSession();
  return <Redirect href={hasSession ? "/(tabs)" : "/onboarding"} />;
}
