"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Candidate } from "./types";

interface Draft {
  name: string;
  email: string;
}

interface Session {
  email: string;
  passcode: string;
  candidate: Candidate;
}

interface CandidateContextValue {
  draft: Draft;
  setDraft: (d: Draft) => void;
  session: Session | null;
  setSession: (s: Session | null) => void;
  ready: boolean;
}

const CandidateContext = createContext<CandidateContextValue | null>(null);

const DRAFT_KEY = "arcade:draft";
const SESSION_KEY = "arcade:session";

export function CandidateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [draft, setDraftState] = useState<Draft>({ name: "", email: "" });
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from sessionStorage once on mount.
  useEffect(() => {
    try {
      const d = sessionStorage.getItem(DRAFT_KEY);
      if (d) setDraftState(JSON.parse(d));
      const s = sessionStorage.getItem(SESSION_KEY);
      if (s) setSessionState(JSON.parse(s));
    } catch {
      /* ignore malformed storage */
    }
    setReady(true);
  }, []);

  const setDraft = (d: Draft) => {
    setDraftState(d);
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  };

  const setSession = (s: Session | null) => {
    setSessionState(s);
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo(
    () => ({ draft, setDraft, session, setSession, ready }),
    [draft, session, ready]
  );

  return (
    <CandidateContext.Provider value={value}>
      {children}
    </CandidateContext.Provider>
  );
}

export function useCandidate() {
  const ctx = useContext(CandidateContext);
  if (!ctx)
    throw new Error("useCandidate must be used within a CandidateProvider");
  return ctx;
}

export type { Session, Draft };
