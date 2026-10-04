import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthResponse, Me } from "@parentpal/shared";
import { api, ApiError, setToken } from "./api";
import { clearScheduledNotifications, syncNotifications } from "./notifications";
import { storage } from "./storage";

const TOKEN_KEY = "parentpal.token";

interface SessionValue {
  ready: boolean;
  hasSession: boolean;
  me: Me | undefined;
  meLoading: boolean;
  /** Set when /me failed for a reason other than an expired session (401 signs out instead). */
  meError: Error | null;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<unknown>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    storage.get(TOKEN_KEY).then((t) => {
      setToken(t);
      setHasSession(!!t);
      setReady(true);
    });
  }, []);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: ready && hasSession,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
  });

  const signOut = useCallback(async () => {
    await storage.remove(TOKEN_KEY);
    await clearScheduledNotifications().catch(() => {});
    setToken(null);
    setHasSession(false);
    qc.clear();
  }, [qc]);

  // A deleted or expired profile: drop the token and start over.
  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) void signOut();
  }, [meQuery.error, signOut]);

  const signIn = useCallback(
    async (auth: AuthResponse) => {
      // Switching to a different profile (e.g. guest → existing account): the previous profile's alerts
      // must not fire. Registering a guest keeps the same user, so their check-ins stay.
      const currentId = qc.getQueryData<Me>(["me"])?.user.id;
      const switching = hasSession && currentId !== auth.user.id;
      if (switching) await clearScheduledNotifications().catch(() => {});
      await storage.set(TOKEN_KEY, auth.token);
      setToken(auth.token);
      // Not qc.clear(): that drops the cache but screens that stay mounted (the tabs under the sign-in
      // modal) keep their old data and never refetch, e.g. Circles kept "You're reading as a guest".
      // resetQueries wipes every query and refetches the active ones with the new token.
      void qc.resetQueries();
      setHasSession(true);
      // The sync hook only re-runs when the session starts, so reschedule for the new profile here.
      if (switching) void syncNotifications();
    },
    [qc, hasSession],
  );

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      hasSession,
      me: meQuery.data,
      meLoading: meQuery.isLoading,
      meError: meQuery.error instanceof ApiError && meQuery.error.status === 401 ? null : meQuery.error,
      signIn,
      signOut,
      refreshMe: () => qc.invalidateQueries({ queryKey: ["me"] }),
    }),
    [ready, hasSession, meQuery.data, meQuery.isLoading, meQuery.error, signIn, signOut, qc],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}

/** The child the app is focused on (first one for now). */
export function usePrimaryChild() {
  const { me } = useSession();
  return me?.children[0] ?? null;
}
