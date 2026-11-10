"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { api, setCsrf } from "@/lib/client";
type Context = {
  user: any;
  health: any;
  servers: any[];
  keys: any[];
  nodes: any[];
  domains: any[];
  jobs: any[];
  activity: any[];
  loading: boolean;
  refresh: (options?: { expectedUserId?: string }) => Promise<void>;
  notice: (s: string, error?: boolean) => void;
  auth: (mode?: string) => void;
  requireAuth: () => boolean;
  toast: { text: string; error: boolean } | null;
  authMode: string | null;
  setAuthMode: (v: string | null) => void;
};
const C = createContext<Context>(null!);
export const useWorkspace = () => useContext(C);
export function Provider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<any>({
    user: null,
    health: null,
    servers: [],
    keys: [],
    nodes: [],
    domains: [],
    jobs: [],
    activity: [],
    loading: true,
  });
  const [toast, setToast] = useState<any>(null),
    [authMode, setAuthMode] = useState<string | null>(null);
  const requestNumber = useRef(0);
  const verifyingLogin = useRef(false);
  const notice = useCallback((text: string, error = false) => {
    setToast({ text, error });
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const refresh = useCallback(async (options?: { expectedUserId?: string }) => {
    const expectedUserId = options?.expectedUserId;
    if (!expectedUserId && verifyingLogin.current) return;
    if (expectedUserId) verifyingLogin.current = true;
    const request = ++requestNumber.current;
    try {
      const data = await api("/workspace");
      if (request === requestNumber.current) {
        setCsrf(data.csrf);
        setState({ ...data, loading: false });
      }
      if (expectedUserId && data.user?.id !== expectedUserId)
        throw new Error(
          "Your session could not be verified. Check your browser cookies and that the website and API domains are configured correctly.",
        );
    } catch {
      if (request === requestNumber.current) {
        if (expectedUserId) setCsrf("");
        setState((s: any) => ({
          ...s,
          ...(expectedUserId
            ? {
                user: null,
                servers: [],
                keys: [],
                nodes: [],
                domains: [],
                jobs: [],
                activity: [],
              }
            : {}),
          loading: false,
          health: null,
        }));
      }
      if (expectedUserId)
        throw new Error(
          "Your session could not be verified. Check your browser cookies and that the website and API domains are configured correctly.",
        );
    } finally {
      if (expectedUserId) verifyingLogin.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 6000);
    return () => clearInterval(timer);
  }, [refresh]);
  const auth = (mode = "login") => setAuthMode(mode);
  const requireAuth = () => {
    if (state.loading) {
      notice("Checking your session. Please try again shortly.", true);
      return false;
    }
    if (!state.user) {
      auth("login");
      return false;
    }
    return true;
  };
  return (
    <C.Provider
      value={{
        ...state,
        refresh,
        notice,
        auth,
        requireAuth,
        toast,
        authMode,
        setAuthMode,
      }}
    >
      {children}
    </C.Provider>
  );
}
