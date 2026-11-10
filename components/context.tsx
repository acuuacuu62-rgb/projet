"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
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
  refresh: () => Promise<void>;
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
  const notice = useCallback((text: string, error = false) => {
    setToast({ text, error });
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const refresh = useCallback(async () => {
    try {
      const data = await api("/workspace");
      setCsrf(data.csrf);
      setState({ ...data, loading: false });
    } catch {
      setState((s: any) => ({ ...s, loading: false, health: null }));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 6000);
    return () => clearInterval(timer);
  }, [refresh]);
  const auth = (mode = "login") => setAuthMode(mode);
  const requireAuth = () => {
    if (!state.user) {
      auth("register");
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
