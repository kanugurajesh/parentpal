import { createContext, useContext, useState, type ReactNode } from "react";
import type { GoalSlug } from "@parentpal/shared";
import type { MonthYear } from "@/components/BirthDatePicker";

export interface ChildDraft {
  nickname: string;
  sex: "girl" | "boy" | null;
  birth: MonthYear | null;
}

interface Draft {
  children: ChildDraft[];
  goals: GoalSlug[];
  parentRole: "mother" | "father" | null;
  firstName: string;
}

const emptyChild = (): ChildDraft => ({ nickname: "", sex: null, birth: null });

/**
 * Onboarding answers live only in memory until the last step. Nothing is sent to the server
 * (no guest account is even created) until the parent taps "Create my plan".
 */
function useDraftState() {
  const [draft, setDraft] = useState<Draft>({ children: [emptyChild()], goals: [], parentRole: null, firstName: "" });
  return {
    draft,
    update: (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })),
    updateChild: (i: number, patch: Partial<ChildDraft>) =>
      setDraft((d) => ({ ...d, children: d.children.map((c, j) => (i === j ? { ...c, ...patch } : c)) })),
    addChild: () => setDraft((d) => ({ ...d, children: [...d.children, emptyChild()] })),
    removeChild: (i: number) => setDraft((d) => ({ ...d, children: d.children.filter((_, j) => j !== i) })),
  };
}

const Ctx = createContext<ReturnType<typeof useDraftState> | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const value = useDraftState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding outside OnboardingProvider");
  return v;
}

export const childIsComplete = (c: ChildDraft) => c.nickname.trim().length > 0 && !!c.sex && !!c.birth;
