"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Forces a stale browser onto the current build.
 *
 * Why this exists: during the Task Round an applicant submitted work through
 * an interface that had been replaced days earlier. Her browser was holding a
 * cached HTML document, which kept loading the old (still-served) chunks, so
 * an entire previous version of the app ran with no error and no clue that
 * anything was wrong. Cache headers stop NEW sessions going stale; this
 * catches sessions that are ALREADY stale, including tabs that were opened
 * before the fix shipped and restored from the phone's tab list weeks later.
 *
 * The check is cheap (a few bytes, no-store) and runs at the moments a stale
 * tab actually comes back into use: mount, tab focus, restore from bfcache,
 * and a slow interval for tabs left open for hours.
 */

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "unknown";

/** How long between polls for a tab that just sits open. */
const POLL_MS = 2 * 60 * 1000;

/** Remembers which build we already reloaded for, so we can't loop. */
const RELOAD_KEY = "tech_reloaded_for_build";

/**
 * Pure decision, kept separate so it can be tested without a browser.
 *
 * Deliberately conservative — it only returns true when it is CERTAIN the
 * client is behind. Anything unknown or unreachable means "do nothing",
 * because a wrong reload during a half-finished application form costs an
 * applicant their work, while a missed reload just delays an update.
 */
export function shouldReload(
  clientBuild: string,
  serverBuild: string | null,
  alreadyReloadedFor: string | null
): boolean {
  if (!serverBuild || serverBuild === "unknown") return false; // couldn't tell
  if (!clientBuild || clientBuild === "unknown") return false; // nothing to compare
  if (serverBuild === clientBuild) return false; // up to date
  // We already reloaded once for this exact build and are STILL on the old
  // bundle. Reloading again would just spin, so leave it to the banner.
  if (alreadyReloadedFor === serverBuild) return false;
  return true;
}

/** Drop anything that could re-serve the old bundle after a reload. */
async function purgeCaches() {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }
  try {
    const sw = navigator.serviceWorker;
    if (sw) {
      const regs = await sw.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* best effort */
  }
}

export default function VersionGuard() {
  // Shown only in the case where a reload did NOT fix it — rare, but without
  // it the user would be stuck on an old build with no way to know.
  const [stuck, setStuck] = useState(false);

  const check = useCallback(async () => {
    let serverBuild: string | null = null;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      serverBuild = (await res.json())?.build ?? null;
    } catch {
      return; // offline or blocked — never act on a failed check
    }

    let alreadyReloadedFor: string | null = null;
    try {
      alreadyReloadedFor = sessionStorage.getItem(RELOAD_KEY);
    } catch {
      /* private mode — treat as "haven't reloaded" */
    }

    if (!shouldReload(BUILD, serverBuild, alreadyReloadedFor)) {
      // Still behind after a reload → tell them, don't spin.
      if (serverBuild && serverBuild !== "unknown" && serverBuild !== BUILD) {
        setStuck(true);
      }
      return;
    }

    try {
      sessionStorage.setItem(RELOAD_KEY, serverBuild as string);
    } catch {
      /* if we can't record it, the banner is the fallback */
    }
    await purgeCaches();
    window.location.reload();
  }, []);

  useEffect(() => {
    check();

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    // pageshow with persisted=true is the bfcache restore — the phone-tab case
    // that started all this. No other event fires on that path.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", onPageShow);
    const id = setInterval(check, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", onPageShow);
      clearInterval(id);
    };
  }, [check]);

  if (!stuck) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: "#ffb800",
        color: "#241a11",
        fontFamily: "'VT323', monospace",
        fontSize: "18px",
        padding: "10px 14px",
        textAlign: "center",
        lineHeight: 1.35,
        boxShadow: "0 -4px 18px rgba(0,0,0,.5)",
      }}
    >
      This page is out of date. Close the tab completely and reopen{" "}
      <strong>technovation-recruitment.vercel.app</strong> so you don&apos;t miss
      an update.
    </div>
  );
}
