import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { RESET_CODE_MINUTES } from "@parentpal/shared";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { Button, ErrorNote, Field, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { color, space } from "@/theme/tokens";

/**
 * Step 1: email → we send a 6-digit code. Step 2: code + new password → signed in.
 * The server answers the same for unknown emails, so step 2 always follows; a wrong email just
 * never gets a code.
 */
export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { signIn } = useSession();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      setStep("code");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      setResent(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const auth = await api.resetPassword(email.trim(), code.trim(), password);
      await signIn(auth);
      router.dismissAll();
      router.replace("/(tabs)");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <OnboardingFrame
        title="Reset your password"
        subtitle="Enter the email you signed up with. We'll send you a 6-digit code."
        footer={
          <>
            {error ? <ErrorNote message={error} /> : null}
            <Button label="Send code" loading={busy} disabled={!email.includes("@")} onPress={sendCode} />
          </>
        }
      >
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          onSubmitEditing={() => email.includes("@") && !busy && sendCode()}
        />
      </OnboardingFrame>
    );
  }

  const ready = /^\d{6}$/.test(code.trim()) && password.length >= 8;
  return (
    <OnboardingFrame
      title="Check your email"
      subtitle={`If ${email.trim()} has a ParentPal account, a code is on its way. It works for ${RESET_CODE_MINUTES} minutes.`}
      footer={
        <>
          {error ? <ErrorNote message={error} /> : null}
          <Button label="Set new password" loading={busy} disabled={!ready} onPress={reset} />
          <Button label={resent ? "Code sent again" : "Send a new code"} kind="ghost" disabled={resent} onPress={resend} />
        </>
      }
    >
      <View style={{ gap: space.lg }}>
        <Field
          label="6-digit code"
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="123456"
          maxLength={6}
        />
        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          hint="At least 8 characters."
          onSubmitEditing={() => ready && !busy && reset()}
        />
        <T variant="small" color={color.inkMuted}>
          Changing your password signs you out on your other phones.
        </T>
        <Button
          label="Use a different email"
          kind="ghost"
          onPress={() => {
            setStep("email");
            setCode("");
            setResent(false);
            setError(null);
          }}
        />
      </View>
    </OnboardingFrame>
  );
}
