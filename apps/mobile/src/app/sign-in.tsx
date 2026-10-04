import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { Button, ErrorNote, Field, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { color, space } from "@/theme/tokens";

/**
 * mode=create: a guest saves their profile with email + password (same account, data kept).
 * mode=login (default when signed out): sign in to an existing account.
 */
export default function SignIn() {
  const params = useLocalSearchParams<{ mode?: "create" | "login" }>();
  const { me, hasSession, signIn, refreshMe } = useSession();
  const canCreate = hasSession && me?.user.isGuest;
  const [mode, setMode] = useState<"create" | "login">(params.mode === "create" && canCreate ? "create" : "login");
  // /me may still be loading on first render; honour mode=create once we know this is a guest.
  useEffect(() => {
    if (params.mode === "create" && canCreate) setMode("create");
  }, [params.mode, canCreate]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        const auth = await api.register(email.trim(), password);
        await signIn(auth);
        await refreshMe();
      } else {
        const auth = await api.login(email.trim(), password);
        await signIn(auth);
      }
      router.dismissAll();
      router.replace("/(tabs)");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const creating = mode === "create";
  return (
    <OnboardingFrame
      title={creating ? "Save your profile" : "Welcome back"}
      subtitle={
        creating
          ? "Add an email and password to keep your family profile, moments and chats if you change phones."
          : "Sign in to pick up where you left off."
      }
      footer={
        <>
          {error ? <ErrorNote message={error} /> : null}
          <Button label={creating ? "Create account" : "Sign in"} loading={busy} disabled={!email || password.length < 8} onPress={submit} />
          {canCreate ? (
            <Button
              label={creating ? "I already have an account" : "Create an account instead"}
              kind="ghost"
              onPress={() => {
                setMode(creating ? "login" : "create");
                setError(null);
              }}
            />
          ) : null}
        </>
      }
    >
      <View style={{ gap: space.lg }}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={creating ? "new-password" : "current-password"}
          hint="At least 8 characters."
          onSubmitEditing={() => email && password.length >= 8 && !busy && submit()}
        />
        {!creating && canCreate ? (
          <T variant="small" color={color.inkMuted}>
            Signing in to another account switches this phone to that profile. Your current guest profile stays on our server but you won't be able to reach it.
          </T>
        ) : null}
      </View>
    </OnboardingFrame>
  );
}
