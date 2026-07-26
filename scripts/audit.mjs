#!/usr/bin/env node
/**
 * Post-refactor audit.  `node scripts/audit.mjs`
 *
 * Exists because a security refactor once removed the localStorage→Supabase
 * mirror without replacing the write path. Registration silently stopped
 * reaching the server, so applicants could never log in — and it went unnoticed
 * because `npm run build` passes happily with functions nobody calls, and every
 * check being run at the time was a *negative* one ("no direct table access"),
 * which passed precisely BECAUSE the writes had been deleted.
 *
 * Two positive checks:
 *   A. Every exported API function is actually called from the UI.
 *   B. Every local write to the candidate store has a server counterpart,
 *      except the explicitly allowlisted draft step.
 */

import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const api = read("lib/api.ts");
const pages = ["app/page.tsx", "app/admin/page.tsx"].map((p) => ({ p, src: read(p) }));
const allSrc = pages.map((f) => f.src).join("\n");

let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); failed++; };

// ---- A. dead exports -------------------------------------------------
console.log("\nA. API exports are wired to the UI");
const exports_ = [...api.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
for (const fn of exports_) {
  // matches either a direct call `fn(` or an aliased import `fn as apiFn`
  const alias = allSrc.match(new RegExp(`${fn}\\s+as\\s+(\\w+)`))?.[1];
  const called =
    new RegExp(`\\b${fn}\\s*\\(`).test(allSrc) ||
    (alias && new RegExp(`\\b${alias}\\s*\\(`).test(allSrc));
  called ? ok(fn) : bad(`${fn} is exported but never called — dead code path`);
}

// ---- B. write paths --------------------------------------------------
console.log("\nB. Local writes have a server counterpart");

// Functions permitted to write locally without hitting the server, with why.
const ALLOWLIST = {
  onSaveData: "local draft; the row is created by onEnterHQ once the PIN exists",
  handleCandidateLogin: "caches the row the SERVER just returned — a read path, not a write",
};

const src = pages.find((f) => f.p === "app/page.tsx").src.split("\n");
// Exactly two spaces of indent = a handler declared in the component body.
// (A looser pattern also matches locals like `const link = (x || "").trim()`,
//  which silently mis-attributes the enclosing function.)
const DECL = /^ {2}const (\w+) = (?:async )?\(/;
const enclosing = (lineIdx) => {
  for (let i = lineIdx; i >= 0; i--) {
    const m = src[i].match(DECL);
    if (m) return m[1];
  }
  return "<unknown>";
};

const SERVER_CALL = /\bapi(Register|Save)\s*\(/;
const fnBody = (name) => {
  const start = src.findIndex((l) => new RegExp(`^\\s*const ${name} = (?:async )?\\(`).test(l));
  if (start < 0) return "";
  let depth = 0, out = [];
  for (let i = start; i < src.length; i++) {
    out.push(src[i]);
    depth += (src[i].match(/\{/g) || []).length - (src[i].match(/\}/g) || []).length;
    if (i > start && depth <= 0) break;
  }
  return out.join("\n");
};

const seen = new Set();
src.forEach((line, i) => {
  if (!line.includes('localStorage.setItem("tech_candidates_admin"')) return;
  const fn = enclosing(i);
  if (seen.has(fn)) return;
  seen.add(fn);
  if (SERVER_CALL.test(fnBody(fn))) ok(`${fn} (line ${i + 1}) writes locally AND to the server`);
  else if (ALLOWLIST[fn]) ok(`${fn} (line ${i + 1}) local-only — allowed: ${ALLOWLIST[fn]}`);
  else bad(`${fn} (line ${i + 1}) writes ONLY to localStorage — data will never reach Supabase`);
});

// ---- C. no direct table access from the browser ----------------------
console.log("\nC. No direct table access in client code");
const direct = [...allSrc.matchAll(/\.from\(["']candidates["']\)/g)].length;
direct === 0 ? ok("all data access goes through RPCs") : bad(`${direct} direct .from("candidates") call(s)`);

console.log(failed ? `\n${failed} problem(s) found\n` : "\nAll checks passed\n");
process.exit(failed ? 1 : 0);
