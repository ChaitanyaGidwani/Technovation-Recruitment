"use client";

/**
 * Club Recruitment Arcade — faithful port of the design artifact.
 * A single-page, state-driven arcade experience (floor → character → pass → HQ).
 * Pure frontend: no backend wired in yet (Supabase intentionally stubbed).
 * Ported 1:1 from the design's inline styles, keyframes, joystick physics and
 * canvas ticket rendering.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";


// ---- config (edit freely) ----
const CLUB_NAME = "TECHNOVATION";
const SCANLINES = 0.35;
const FLICKER = true;
const SCREEN_TINT = "blue" as "blue" | "green" | "amber";

const DOMAINS = [
  {
    key: "tech", name: "TECHNICAL", stage: "CODE CITADEL", glyph: "Ψ", color: "#00f0ff", cls: "MAGE",
    desc: "The backbone of Technovation — our Technical guild forges the digital infrastructure that powers every initiative. From full-stack web apps and mobile experiences to APIs, databases, and cloud deployments, the Mages of Code Citadel turn ideas into living, breathing software. You'll collaborate on hackathon projects, build internal tools, explore AI/ML pipelines, and push production-grade code. If you think in logic and dream in syntax, this is your stronghold.",
    skills: ["Web & App Development", "Data Structures & Algorithms", "Cloud & DevOps", "AI / ML Prototyping", "Open-Source Contributions"],
    quest: "Build or break things — ship code that matters.",
  },
  {
    key: "graphics", name: "GRAPHICS", stage: "PIXEL STUDIO", glyph: "✦", color: "#ff2bd1", cls: "ARTIFICER",
    desc: "The Pixel Studio is where visual magic is born. Our Artificers craft everything the world sees — event posters, social media creatives, brand identity kits, UI/UX mockups, motion graphics, and animated reels. You'll master design tools, develop a keen eye for typography and color theory, and create scroll-stopping visuals that define Technovation's aesthetic. Every pixel you place tells a story.",
    skills: ["Graphic Design & Illustration", "UI/UX Design", "Motion Graphics & Animation", "Figma & Canva"],
    quest: "Design the visuals that make the world stop scrolling.",
  },
  {
    key: "prod", name: "PRODUCTION", stage: "STAGE MASTER", glyph: "◈", color: "#ffe600", cls: "TANK",
    desc: "The Stage Masters are the visual storytellers behind Technovation's video presence. From shooting and editing event recap videos, promo reels, and cinematic teasers to creating YouTube content, podcast visuals, and behind-the-scenes footage — the Production guild brings every moment to life on screen. You'll work with professional editing software, master color grading, sound design, and pacing to produce content that captures attention and tells compelling stories.",
    skills: ["Video Editing & Post-Production", "Cinematography & Shooting", "Color Grading & Sound Design", "Reels, Shorts & YouTube Content", "Scriptwriting & Storyboarding"],
    quest: "Capture the moments — edit the stories that go viral.",
  },
  {
    key: "events", name: "EVENTS", stage: "BOSS ARENA", glyph: "⚔", color: "#39ff14", cls: "WARRIOR",
    desc: "The Boss Arena is where unforgettable experiences are forged. Warriors of this guild ideate, curate, and execute the club's marquee events — coding competitions, tech talks, gaming nights, and inter-college showdowns. You'll brainstorm wild concepts, design event formats, build engagement mechanics, and ensure every participant walks away with a story. If you live for the thrill of a packed arena, this is your battleground.",
    skills: ["Event Ideation & Curation", "Competition Design", "Participant Engagement", "Speaker & Guest Coordination", "Community Building"],
    quest: "Create legendary events that people talk about for semesters.",
  },
  {
    key: "pr", name: "PR/OUTREACH", stage: "BROADCAST TOWER", glyph: "➤", color: "#ff7a2b", cls: "BARD",
    desc: "Bards of the Broadcast Tower amplify Technovation's voice across every channel. From Instagram reels and LinkedIn posts to campus partnerships, email campaigns, and sponsor outreach — this guild builds the club's public presence. You'll craft narratives, negotiate collaborations, manage social media calendars, analyze engagement metrics, and connect the club with the broader tech ecosystem.",
    skills: ["Social Media Strategy", "Content Marketing", "Sponsorship & Partnerships", "Email Campaigns", "Analytics & Growth Hacking"],
    quest: "Broadcast the signal — make Technovation unmissable.",
  },
  {
    key: "content", name: "CONTENT", stage: "LORE KEEPER", glyph: "✎", color: "#b06bff", cls: "SCRIBE",
    desc: "Scribes of the Lore Keeper chronicle everything Technovation stands for. From blog posts and technical articles to event recaps, newsletters, and scriptwriting — the Content guild is the voice behind the brand. You'll research trending tech topics, interview speakers, document club history, and produce written + multimedia content that educates, entertains, and inspires the community.",
    skills: ["Technical Writing & Blogging", "Copywriting & Scriptwriting", "Newsletter Curation", "Research & Documentation", "Storytelling & Narrative Design"],
    quest: "Write the lore that defines the guild's legacy.",
  },
];

const STAGES = [
  { key: "submitted", label: "FORM SUBMITTED", icon: "✓" },
  { key: "screening", label: "SCREENING", icon: "◉" },
  { key: "task", label: "TASK ROUND", icon: "⚔" },
  { key: "interview", label: "INTERVIEW", icon: "☎" },
  { key: "recruited", label: "RECRUITED", icon: "★" },
];

interface Comm {
  id: string;
  icon: string;
  color: string;
  title: string;
  body: string;
  time: string;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const PS = "'Press Start 2P'";
const VT = "'VT323'";

// Simple deterministic hash for PIN storage (not crypto-grade, but sufficient for
// client-side localStorage where the entire store is already readable).
const hashPin = (pin: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < pin.length; i++) {
    h ^= pin.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

// ---- tactile 3D button (reproduces the design's press effect) ----
function ArcadeButton({
  style,
  activeStyle,
  onClick,
  children,
}: {
  style: CSSProperties;
  activeStyle?: CSSProperties;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const [down, setDown] = useState(false);
  const merged = down && activeStyle ? { ...style, ...activeStyle } : style;
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      style={merged}
    >
      {children}
    </button>
  );
}

// deterministic 8x8 mirrored pixel avatar
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: string,
  cell: number,
  color: string
) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rng = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h >>> 0) / 4294967296;
  };
  const cols = 8,
    rows = 8;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < 4; c++) {
      if (rng() < 0.5) {
        ctx.fillStyle = color;
        ctx.fillRect(x + c * cell, y + r * cell, cell, cell);
        ctx.fillRect(x + (cols - 1 - c) * cell, y + r * cell, cell, cell);
      }
    }
}

export default function ArcadePage() {
  const [page, setPage] = useState<"floor" | "create" | "pass" | "hq">("floor");
  const [progress, setProgress] = useState(0);
  const [jx, setJx] = useState(0);
  const [jy, setJy] = useState(0);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [registrationCount, setRegistrationCount] = useState(0);
  const [playerNo, setPlayerNo] = useState(0);
  const [hover, setHover] = useState("");
  const [error, setError] = useState("");
  const [detailDomain, setDetailDomain] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    branch: "",
    section: "",
    phone: "",
    college: "",
    q1: "",
    q2: "",
    q3: "",
    q4: "",
    q5: "",
    q6: "",
    q7: "",
  });
  const [pin, setPin] = useState("");
  const [stageIdx, setStageIdx] = useState(1);
  const [taskInput, setTaskInput] = useState("");
  const [taskSubmitted, setTaskSubmitted] = useState(false);
  // Rejection / "journey stopped" state (set by the Guild Council admin).
  const [rejected, setRejected] = useState(false);
  const [rejectedAtStage, setRejectedAtStage] = useState(1);
  const [rejectionFeedback, setRejectionFeedback] = useState("");
  // Per-department task submissions (keyed by domain key).
  const [taskLinks, setTaskLinks] = useState<Record<string, string>>({});
  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});
  const [comms, setComms] = useState<Comm[]>([
    { id: "c1", icon: "✓", color: "#39ff14", title: "REGISTRATION CONFIRMED", body: "Welcome, Player 1. Your file is locked in. Stand by for screening.", time: "JUST NOW" },
    { id: "c2", icon: "◉", color: "#00f0ff", title: "SCREENING IN PROGRESS", body: "The guild council is reviewing your player file. ETA 48 hrs.", time: "5 MIN AGO" },
  ]);

  // Returning Candidate Login state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPin, setLoginPin] = useState("");

  // Forgot PIN state
  const [forgotPinMode, setForgotPinMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [resetNewPin, setResetNewPin] = useState("");
  const [resetConfirmPin, setResetConfirmPin] = useState("");
  const [resetStep, setResetStep] = useState<"verify" | "newpin">("verify");
  const [resetErr, setResetErr] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [loginErr, setLoginErr] = useState("");
  // A remembered session shows a one-tap "Resume" on the landing page
  // (instead of force-navigating there).
  const [resumeInfo, setResumeInfo] = useState<{ email: string; name: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const ticketRef = useRef<HTMLCanvasElement | null>(null);
  const hqAvatarRef = useRef<HTMLCanvasElement | null>(null);
  const mt = useRef({ rx: 0, ry: 0 });
  const cur = useRef({ x: 0, y: 0 });

  const selDomain = (idx = 0) => DOMAINS.find((d) => d.key === selectedClasses[idx]);
  const selLabel = () => {
    return selectedClasses.map((k) => {
      const d = DOMAINS.find((dm) => dm.key === k);
      return d ? d.name + " / " + d.cls : "";
    }).filter(Boolean).join(" + ");
  };
  const avatarSeed = () => (form.name || "PLAYER1") + (selectedClasses[0] || "x");
  const toggleClass = (key: string) => {
    setSelectedClasses((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 2) return [prev[1], key]; // replace oldest
      return [...prev, key];
    });
    setError("");
  };
  const club = () => CLUB_NAME || "[REDACTED] GUILD";

  const openDetail = (key: string) => {
    setDetailDomain(key);
    requestAnimationFrame(() => setDetailVisible(true));
  };
  const closeDetail = () => {
    setDetailVisible(false);
    setTimeout(() => setDetailDomain(null), 400);
  };

  // joystick tilt + score ticker
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      mt.current.rx = -ny * 13;
      mt.current.ry = nx * 16;
    };
    window.addEventListener("mousemove", onMove);
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const idleRx = Math.sin(now / 620) * 3.2;
      const idleRy = Math.cos(now / 880) * 3.4;
      const tRx = mt.current.rx + idleRx;
      const tRy = mt.current.ry + idleRy;
      cur.current.x += (tRx - cur.current.x) * 0.12;
      cur.current.y += (tRy - cur.current.y) * 0.12;
      setJx(cur.current.x);
      setJy(cur.current.y);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Sync real candidate registration count
  useEffect(() => {
    const syncCount = () => {
      try {
        const raw = localStorage.getItem("tech_candidates_admin");
        const list = raw ? JSON.parse(raw) : [];
        setRegistrationCount(list.length);
      } catch {
        setRegistrationCount(0);
      }
    };
    syncCount();
    window.addEventListener("storage", syncCount);
    const timer = setInterval(syncCount, 1500);
    return () => {
      window.removeEventListener("storage", syncCount);
      clearInterval(timer);
    };
  }, []);

  // reset scroll on page change
  useEffect(() => {
    setProgress(0);
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [page]);

  // draw ticket / hq avatar when entering those pages
  useEffect(() => {
    if (page !== "pass") return;
    const cvs = ticketRef.current;
    if (!cvs) return;
    const run = () => {
      const W = 780,
        H = 380;
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      cvs.width = W;
      cvs.height = H;
      const name = (form.name || "PLAYER 1").toUpperCase();
      const dom = selDomain(0);
      const dom2 = selDomain(1);
      const cls = [dom, dom2].filter(Boolean).map((d) => d!.stage).join(" + ") || "ROOKIE";
      const clsName = [dom, dom2].filter(Boolean).map((d) => d!.name + " / " + d!.cls).join(" + ") || "UNASSIGNED";
      const accent = dom ? dom.color : "#00f0ff";
      ctx.fillStyle = "#080912";
      ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 6;
      ctx.strokeStyle = accent;
      ctx.strokeRect(10, 10, W - 20, H - 20);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ff2bd1";
      ctx.strokeRect(20, 20, W - 40, H - 40);
      const px = W - 220;
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = "#3a3f66";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, 26);
      ctx.lineTo(px, H - 26);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ffe600";
      ctx.font = `20px ${PS}`;
      ctx.fillText("ARCADE TICKET", 44, 46);
      ctx.fillStyle = accent;
      ctx.font = `10px ${PS}`;
      ctx.fillText("// PLAYER ID PASS · " + club(), 44, 78);
      const fld = (y: number, label: string, val: string, col: string) => {
        ctx.fillStyle = "#7de8ff";
        ctx.font = `9px ${PS}`;
        ctx.fillText(label, 44, y);
        ctx.fillStyle = col;
        ctx.font = `14px ${PS}`;
        ctx.fillText(String(val).slice(0, 20), 44, y + 15);
      };
      fld(118, "PLAYER NAME", name, "#39ff14");
      fld(164, "CLASS", clsName, "#ff2bd1");
      fld(210, "HOME STAGE", cls, accent);
      fld(256, "COMMS", (form.email || "—").toUpperCase(), "#ffffff");
      fld(302, "BRANCH", (form.branch || "—").toUpperCase(), "#ffe600");
      ctx.fillStyle = "#7de8ff";
      ctx.font = `9px ${PS}`;
      ctx.fillText("AVATAR", px + 44, 54);
      drawAvatar(ctx, px + 40, 76, avatarSeed(), 18, accent);
      ctx.fillStyle = "#ffe600";
      ctx.font = `9px ${PS}`;
      ctx.fillText("PLAYER No.", px + 40, 258);
      ctx.fillStyle = accent;
      ctx.font = `20px ${PS}`;
      ctx.fillText("#" + String(playerNo || 1).padStart(4, "0"), px + 40, 280);
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
    else run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    if (page !== "hq") return;
    const cvs = hqAvatarRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    cvs.width = 128;
    cvs.height = 128;
    ctx.fillStyle = "#05060d";
    ctx.fillRect(0, 0, 128, 128);
    const dom = selDomain();
    drawAvatar(ctx, 16, 16, avatarSeed(), 12, dom ? dom.color : "#00f0ff");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const goTo = (p: typeof page) => {
    setError("");
    setPage(p);
  };

  // ---- Session persistence helpers ----
  const loadCandidateByEmail = (email: string): boolean => {
    try {
      const raw = localStorage.getItem("tech_candidates_admin");
      const list = raw ? JSON.parse(raw) : [];
      const match = list.find((c: any) => c.email.toLowerCase() === email.toLowerCase());
      if (!match) return false;

      setForm({
        name: match.name || "",
        email: match.email || "",
        branch: match.branch || "",
        section: match.section || "",
        phone: match.phone || "",
        college: match.collegeId || "",
        q1: match.answers?.q1 || "",
        q2: match.answers?.q2 || "",
        q3: match.answers?.q3 || "",
        q4: match.answers?.q4 || "",
        q5: match.answers?.q5 || "",
        q6: match.answers?.q6 || "",
        q7: match.answers?.q7 || "",
      });
      setSelectedClasses(match.domains || []);
      setPlayerNo(match.playerNo || 1001);
      setStageIdx(match.stageIdx || 1);

      // Rejection / journey-stopped state
      setRejected(!!match.rejected);
      setRejectedAtStage(
        typeof match.rejectedAtStage === "number"
          ? match.rejectedAtStage
          : match.stageIdx && match.stageIdx <= 4 ? match.stageIdx : 1
      );
      setRejectionFeedback(match.rejectionFeedback || "");

      // Per-department task submissions (with legacy single-link fallback)
      const subs: Record<string, string> = { ...(match.submissions || {}) };
      const done: Record<string, boolean> = {};
      Object.keys(subs).forEach((k) => { if (subs[k]) done[k] = true; });
      if (match.submissionLink && Object.keys(subs).length === 0 && (match.domains || [])[0]) {
        subs[match.domains[0]] = match.submissionLink;
        done[match.domains[0]] = true;
      }
      setTaskLinks(subs);
      setTaskDone(done);
      if (match.submissionLink) {
        setTaskSubmitted(true);
        setTaskInput(match.submissionLink);
      }
      return true;
    } catch {
      return false;
    }
  };

  // Session persists across browser restarts so a returning applicant lands
  // straight on their HQ without logging in again.
  const saveSession = (email: string) => {
    try { localStorage.setItem("tech_session", email); } catch { /* ignore */ }
  };

  const clearSession = () => {
    try { localStorage.removeItem("tech_session"); } catch { /* ignore */ }
  };

  const handleLogout = () => {
    clearSession();
    setResumeInfo(null);
    goTo("floor");
  };

  const router = useRouter();

  // Track viewport so the landing page can adapt its absolutely-positioned
  // arcade overlays for phones.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Remember a prior session — but DON'T hijack the landing page. Pre-load the
  // candidate's data and offer a one-tap "Resume" on the floor instead.
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem("tech_session");
      if (savedEmail && loadCandidateByEmail(savedEmail)) {
        const raw = localStorage.getItem("tech_candidates_admin");
        const list = raw ? JSON.parse(raw) : [];
        const m = list.find(
          (c: any) => c.email?.toLowerCase() === savedEmail.toLowerCase()
        );
        setResumeInfo({ email: savedEmail, name: m?.name || "PLAYER" });
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning from /process — land on domain/class selection with the
  // name & email the player entered on the arcade floor still filled in.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("step") === "create") {
        const raw = sessionStorage.getItem("tech_hook");
        if (raw) {
          const h = JSON.parse(raw);
          setForm((s) => ({
            ...s,
            name: h.name ?? s.name,
            email: h.email ?? s.email,
          }));
        }
        setPage("create");
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ---- LIVE SYNC ----
  // Keep the candidate dashboard in lockstep with admin actions (promotions,
  // rejections, task unlocks). Uses cross-tab storage events + focus + a short
  // poll so the HQ updates without a manual refresh.
  const lastSyncStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (page !== "hq") {
      lastSyncStageRef.current = null;
      return;
    }
    const email =
      form.email ||
      (typeof window !== "undefined" ? localStorage.getItem("tech_session") : "") ||
      "";
    if (!email) return;

    const sync = () => {
      try {
        const raw = localStorage.getItem("tech_candidates_admin");
        if (!raw) return;
        const list = JSON.parse(raw);
        const match = list.find(
          (c: any) => c.email?.toLowerCase() === email.toLowerCase()
        );
        if (!match) return;

        const newStage = match.stageIdx || 1;
        if (lastSyncStageRef.current === null) {
          lastSyncStageRef.current = newStage;
        } else if (newStage > lastSyncStageRef.current && newStage <= 4) {
          const lbl = STAGES[Math.min(newStage, STAGES.length - 1)]?.label || "NEXT STAGE";
          setComms((cs) => [
            {
              id: "sync" + Date.now(),
              icon: "★",
              color: "#39ff14",
              title: "STAGE ADVANCED",
              body: `The Guild Council promoted you to ${lbl}.${newStage >= 2 ? " Your domain tasks are now unlocked below." : ""}`,
              time: "JUST NOW",
            },
            ...cs,
          ]);
          lastSyncStageRef.current = newStage;
        } else {
          lastSyncStageRef.current = newStage;
        }

        setStageIdx(newStage);
        setRejected(!!match.rejected);
        if (typeof match.rejectedAtStage === "number") setRejectedAtStage(match.rejectedAtStage);
        setRejectionFeedback(match.rejectionFeedback || "");

        const subs = match.submissions || {};
        if (Object.keys(subs).length) {
          setTaskDone((p) => {
            const n = { ...p };
            Object.keys(subs).forEach((k) => { if (subs[k]) n[k] = true; });
            return n;
          });
          setTaskLinks((p) => {
            const n = { ...p };
            Object.keys(subs).forEach((k) => { if (subs[k]) n[k] = subs[k]; });
            return n;
          });
        }
      } catch {
        /* ignore */
      }
    };

    sync();
    const iv = setInterval(sync, 2500);
    const onStorage = (e: StorageEvent) => { if (e.key === "tech_candidates_admin") sync(); };
    const onFocus = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, form.email]);

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm((s) => ({ ...s, [k]: v }));
  };

  const onPressStart = () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("ENTER NAME & EMAIL TO PRESS START");
      return;
    }
    if (!form.email.trim().toLowerCase().endsWith("@abes.ac.in")) {
      setError("PLEASE USE YOUR COLLEGE EMAIL (@ABES.AC.IN)");
      return;
    }
    // Route through the Recruitment Quest briefing before domain selection.
    try {
      sessionStorage.setItem(
        "tech_hook",
        JSON.stringify({ name: form.name, email: form.email })
      );
    } catch { /* ignore */ }
    router.push("/process");
  };
  const onScrollDomains = () => {
    const sc = scrollerRef.current;
    if (sc) sc.scrollTo({ top: sc.scrollHeight * 0.62, behavior: "smooth" });
  };
  const onSaveData = () => {
    if (!form.name.trim() || !form.email.trim() || !form.branch.trim() || !form.section.trim() || !form.phone.trim() || !form.college.trim()) {
      setError("!! ALL PLAYER FILE FIELDS ARE REQUIRED");
      return;
    }
    if (!form.email.trim().toLowerCase().endsWith("@abes.ac.in")) {
      setError("!! PLEASE USE YOUR OFFICIAL COLLEGE EMAIL (@ABES.AC.IN)");
      return;
    }
    if (selectedClasses.length < 2) {
      setError("!! SELECT 2 GUILD DOMAINS TO PROCEED");
      return;
    }
    if (!form.q1.trim() || !form.q2.trim() || !form.q3.trim() || !form.q4.trim() || !form.q5.trim() || !form.q6.trim() || !form.q7.trim()) {
      setError("!! ANSWER ALL 7 QUEST QUESTIONS TO PROCEED");
      return;
    }

    // Save to real candidate store (tech_candidates_admin)
    try {
      const existingRaw = localStorage.getItem("tech_candidates_admin");
      const list = existingRaw ? JSON.parse(existingRaw) : [];
      const emailKey = form.email.trim().toLowerCase();
      const existing = list.find((c: any) => c.email.toLowerCase() === emailKey);

      // Already applied AND activated → never re-submit. Route to login instead,
      // preserving all their existing progress.
      if (existing && existing.pinHash) {
        setLoginEmail(form.email.trim());
        setLoginErr("YOU'VE ALREADY APPLIED WITH THIS EMAIL — ENTER YOUR PIN TO LOG IN.");
        setShowLoginModal(true);
        return;
      }

      const answers = {
        q1: form.q1.trim(), q2: form.q2.trim(), q3: form.q3.trim(),
        q4: form.q4.trim(), q5: form.q5.trim(), q6: form.q6.trim(), q7: form.q7.trim(),
      };

      if (existing) {
        // Applied but not activated yet → update their file, keep id/progress.
        const updatedCand = {
          ...existing,
          name: form.name.trim(),
          branch: form.branch.trim(),
          section: form.section.trim(),
          phone: form.phone.trim(),
          collegeId: form.college.trim(),
          domains: selectedClasses,
          answers,
          updatedAt: "JUST NOW",
        };
        const merged = list.map((c: any) => (c.email.toLowerCase() === emailKey ? updatedCand : c));
        localStorage.setItem("tech_candidates_admin", JSON.stringify(merged));
        setPlayerNo(existing.playerNo || 1001);
        setRegistrationCount(merged.length);
      } else {
        const newPlayerNo = 1000 + list.length + 1;
        const newCand = {
          id: `cand-${Date.now()}`,
          playerNo: newPlayerNo,
          name: form.name.trim(),
          email: form.email.trim(),
          branch: form.branch.trim(),
          section: form.section.trim(),
          phone: form.phone.trim(),
          collegeId: form.college.trim(),
          domains: selectedClasses,
          answers,
          stageIdx: 1, // SCREENING
          pinHash: "", // set in onEnterHQ
          updatedAt: "JUST NOW",
        };
        list.unshift(newCand);
        localStorage.setItem("tech_candidates_admin", JSON.stringify(list));
        setPlayerNo(newPlayerNo);
        setRegistrationCount(list.length);
      }
    } catch {
      setPlayerNo(1001);
    }

    setError("");
    setPage("pass");
  };

  const onEnterHQ = () => {
    if (pin.length < 4) {
      setError("PIN MUST BE 4-6 DIGITS");
      return;
    }

    // Save the hashed PIN to the candidate record
    try {
      const existingRaw = localStorage.getItem("tech_candidates_admin");
      if (existingRaw) {
        const list = JSON.parse(existingRaw);
        const updated = list.map((c: any) => {
          if (c.email.toLowerCase() === form.email.trim().toLowerCase()) {
            return { ...c, pinHash: hashPin(pin) };
          }
          return c;
        });
        localStorage.setItem("tech_candidates_admin", JSON.stringify(updated));

        // Also sync stage
        const match = updated.find((c: any) => c.email.toLowerCase() === form.email.trim().toLowerCase());
        if (match) {
          setStageIdx(match.stageIdx || 1);
          if (match.submissionLink) {
            setTaskSubmitted(true);
            setTaskInput(match.submissionLink);
          }
        }
      }
    } catch {
      /* fallback */
    }

    saveSession(form.email.trim());
    goTo("hq");
  };

  // Submit the task for one specific department. Stage is NOT self-advanced —
  // only the Guild Council admin promotes candidates between rounds.
  const submitTaskFor = (domainKey: string) => {
    if (taskDone[domainKey]) return; // submissions are final — no resubmit
    const link = (taskLinks[domainKey] || "").trim();
    if (!link) return;
    setTaskDone((p) => ({ ...p, [domainKey]: true }));

    // Persist per-department submissions to the shared candidate store.
    try {
      const existingRaw = localStorage.getItem("tech_candidates_admin");
      if (existingRaw) {
        const list = JSON.parse(existingRaw);
        const updated = list.map((c: any) => {
          if (c.email.toLowerCase() === form.email.trim().toLowerCase()) {
            const submissions = { ...(c.submissions || {}), [domainKey]: link };
            const firstLink = Object.values(submissions).find(Boolean) as string | undefined;
            return { ...c, submissions, submissionLink: firstLink || c.submissionLink, updatedAt: "JUST NOW" };
          }
          return c;
        });
        localStorage.setItem("tech_candidates_admin", JSON.stringify(updated));
      }
    } catch {
      /* fallback */
    }

    const dm = DOMAINS.find((d) => d.key === domainKey);
    setComms((cs) => [
      { id: "c" + Date.now(), icon: "⚔", color: "#39ff14", title: "TASK SUBMITTED", body: `${dm ? dm.name : "Domain"} task received. The council will judge your work soon. +50 XP`, time: "JUST NOW" },
      ...cs,
    ]);
  };

  const handleCandidateLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPin.trim()) {
      setLoginErr("ENTER BOTH REGISTERED EMAIL & PIN");
      return;
    }
    if (!loginEmail.trim().toLowerCase().endsWith("@abes.ac.in")) {
      setLoginErr("PLEASE ENTER YOUR COLLEGE EMAIL (@ABES.AC.IN)");
      return;
    }

    try {
      const raw = localStorage.getItem("tech_candidates_admin");
      const list = raw ? JSON.parse(raw) : [];
      const match = list.find((c: any) => c.email.toLowerCase() === loginEmail.trim().toLowerCase());

      if (!match) {
        setLoginErr("NO APPLICANT FILE FOUND FOR THAT EMAIL. REGISTER FIRST.");
        return;
      }

      // Verify PIN against stored hash
      if (!match.pinHash) {
        setLoginErr("ACCOUNT NOT ACTIVATED. COMPLETE REGISTRATION FIRST.");
        return;
      }
      if (hashPin(loginPin) !== match.pinHash) {
        setLoginErr("INCORRECT PIN. TRY AGAIN OR USE FORGOT PIN.");
        return;
      }

      // PIN verified — load candidate data
      loadCandidateByEmail(loginEmail.trim());
      setPin(loginPin);

      setShowLoginModal(false);
      setLoginErr("");
      saveSession(loginEmail.trim());
      goTo("hq");
    } catch {
      setLoginErr("SYSTEM ERROR ACCESSING PLAYER FILE");
    }
  };

  const handleForgotPinVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim() || !resetPhone.trim()) {
      setResetErr("ENTER BOTH EMAIL & PHONE TO VERIFY IDENTITY");
      return;
    }
    if (!resetEmail.trim().toLowerCase().endsWith("@abes.ac.in")) {
      setResetErr("PLEASE ENTER YOUR COLLEGE EMAIL (@ABES.AC.IN)");
      return;
    }

    try {
      const raw = localStorage.getItem("tech_candidates_admin");
      const list = raw ? JSON.parse(raw) : [];
      const match = list.find((c: any) => c.email.toLowerCase() === resetEmail.trim().toLowerCase());

      if (!match) {
        setResetErr("NO APPLICANT FILE FOUND FOR THAT EMAIL.");
        return;
      }

      // Verify phone number matches (last 4 digits for security)
      const storedPhone = (match.phone || "").replace(/\D/g, "");
      const inputPhone = resetPhone.replace(/\D/g, "");
      if (storedPhone.length < 4 || inputPhone.length < 4 || storedPhone.slice(-4) !== inputPhone.slice(-4)) {
        setResetErr("PHONE VERIFICATION FAILED. LAST 4 DIGITS DON'T MATCH.");
        return;
      }

      // Identity verified — proceed to new PIN step
      setResetErr("");
      setResetStep("newpin");
    } catch {
      setResetErr("SYSTEM ERROR");
    }
  };

  const handleResetPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (resetNewPin.length < 4) {
      setResetErr("NEW PIN MUST BE 4-6 DIGITS");
      return;
    }
    if (resetNewPin !== resetConfirmPin) {
      setResetErr("PINs DO NOT MATCH. RE-ENTER.");
      return;
    }

    try {
      const raw = localStorage.getItem("tech_candidates_admin");
      const list = raw ? JSON.parse(raw) : [];
      const updated = list.map((c: any) => {
        if (c.email.toLowerCase() === resetEmail.trim().toLowerCase()) {
          return { ...c, pinHash: hashPin(resetNewPin) };
        }
        return c;
      });
      localStorage.setItem("tech_candidates_admin", JSON.stringify(updated));

      setResetErr("");
      setResetSuccess("PIN RESET SUCCESSFUL! YOU CAN NOW LOG IN.");
      setTimeout(() => {
        setForgotPinMode(false);
        setResetStep("verify");
        setResetEmail("");
        setResetPhone("");
        setResetNewPin("");
        setResetConfirmPin("");
        setResetSuccess("");
        setResetErr("");
      }, 2500);
    } catch {
      setResetErr("SYSTEM ERROR RESETTING PIN");
    }
  };
  const onDownload = () => {
    const c = ticketRef.current;
    if (!c) return;
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "arcade-player-pass.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };
  const onShareWA = () => {
    const t = `I just joined ${club()} as a ${selLabel()}! Player #${String(playerNo || 1).padStart(4, "0")}. Insert coin & join the arcade!`;
    window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank");
  };
  const onShareIG = () => window.open("https://www.instagram.com/abes_technovation/", "_blank");

  // ---- computed reveal values (floor) ----
  const p = progress;
  const reveal = clamp((p - 0.12) / 0.42, 0, 1);
  const term = clamp((p - 0.3) / 0.2, 0, 1);
  const scan = SCANLINES;
  const tintMap: Record<string, string> = {
    blue: "rgba(40,120,255,.13)",
    green: "rgba(40,255,120,.12)",
    amber: "rgba(255,180,40,.13)",
  };
  const tintColor = tintMap[SCREEN_TINT];
  const scoreStr = String(registrationCount).padStart(6, "0");

  // ---- shared style objects ----
  const fieldStyle: CSSProperties = {
    width: "100%",
    background: "#050a10",
    border: "2px solid #12463f",
    borderRadius: "5px",
    color: "#39ff14",
    fontFamily: VT,
    fontSize: "clamp(16px,1.8vw,21px)",
    padding: "9px 12px",
    textShadow: "0 0 6px #39ff14",
    boxShadow: "inset 0 0 12px rgba(57,255,20,.1)",
  };
  const areaStyle: CSSProperties = { ...fieldStyle, minHeight: "60px", lineHeight: 1.25 };
  const panelBox: CSSProperties = {
    marginTop: "clamp(20px,3vw,34px)",
    background: "rgba(10,14,26,.72)",
    border: "3px solid #1c2540",
    borderRadius: "14px",
    padding: "clamp(18px,2.6vw,30px)",
    boxShadow: "0 0 30px rgba(0,0,0,.4), inset 0 0 24px rgba(0,240,255,.04)",
  };
  const panelBoxTight: CSSProperties = {
    background: "rgba(10,14,26,.72)",
    border: "3px solid #1c2540",
    borderRadius: "14px",
    padding: "clamp(16px,2.2vw,26px)",
    boxShadow: "0 0 26px rgba(0,0,0,.4), inset 0 0 20px rgba(255,43,209,.03)",
  };
  const sectionHdr: CSSProperties = {
    fontFamily: PS,
    fontSize: "clamp(11px,1.4vw,15px)",
    color: "#fff",
    letterSpacing: "1px",
    marginBottom: "clamp(14px,2vw,20px)",
    display: "flex",
    gap: "10px",
    alignItems: "center",
  };
  const startBtnStyle: CSSProperties = {
    cursor: "pointer",
    width: "clamp(84px,10vw,132px)",
    height: "clamp(84px,10vw,132px)",
    borderRadius: "50%",
    border: "none",
    background: "radial-gradient(circle at 38% 30%, #ff9de3, #ff2bd1 55%, #8a0e6d)",
    color: "#2a0020",
    fontFamily: PS,
    fontSize: "clamp(9px,1.2vw,13px)",
    textShadow: "0 1px 0 rgba(255,255,255,.4)",
    boxShadow: "0 8px 0 #4d063d, 0 0 26px rgba(255,43,209,.7), inset 0 4px 8px rgba(255,255,255,.6)",
    animation: "pressstart 1.1s steps(1) infinite",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1.15,
  };
  const errBase: CSSProperties = {
    fontFamily: PS,
    fontSize: "9px",
    color: "#ff3b30",
    textShadow: "0 0 8px #ff3b30",
    minHeight: "10px",
    animation: error ? "blink 0.5s steps(1) 4" : "none",
  };

  const scanOverlay = (opacity: number): CSSProperties => ({
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    opacity,
    zIndex: 50,
    background: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.5) 2px 4px)",
  });

  const labelSm: CSSProperties = {
    fontFamily: PS,
    fontSize: "clamp(8px,1vw,10px)",
    color: "#7de8ff",
    marginBottom: "7px",
    letterSpacing: ".5px",
  };

  // ---- cabinet / badge styles ----
  const cabStyle = (d: (typeof DOMAINS)[number]): CSSProperties => {
    const active = hover === d.key;
    return {
      position: "relative",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      gap: "2px",
      padding: "6% 4%",
      borderRadius: "8px",
      overflow: "hidden",
      minWidth: 0,
      background: active ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.02)",
      border: "2px solid " + (active ? d.color : "rgba(125,232,255,.18)"),
      boxShadow: active ? "0 0 20px " + d.color + "55, inset 0 0 16px rgba(255,255,255,.06)" : "none",
      transform: active ? "translateY(-3px)" : "none",
      transition: "all .12s",
    };
  };
  const badgeStyle = (d: (typeof DOMAINS)[number]): CSSProperties => {
    const on = selectedClasses.includes(d.key);
    return {
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px",
      borderRadius: "10px",
      minWidth: 0,
      position: "relative",
      background: on ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.02)",
      border: "2px solid " + (on ? d.color : "#1c2540"),
      boxShadow: on ? "0 0 22px " + d.color + "44" : "none",
      transform: on ? "translateY(-2px)" : "none",
      transition: "all .12s",
    };
  };
  const tagStyle = (kind: "active" | "done" | "locked"): CSSProperties => {
    const map = {
      active: { c: "#ffe600", b: "rgba(255,230,0,.12)" },
      done: { c: "#39ff14", b: "rgba(57,255,20,.12)" },
      locked: { c: "#4a5a7a", b: "rgba(74,90,122,.12)" },
    };
    const m = map[kind];
    return {
      fontFamily: PS,
      fontSize: "7px",
      color: m.c,
      background: m.b,
      border: "1px solid " + m.c,
      borderRadius: "4px",
      padding: "4px 7px",
      whiteSpace: "nowrap",
    };
  };
  const taskCard = (locked: boolean): CSSProperties => ({
    padding: "14px",
    borderRadius: "8px",
    background: locked ? "rgba(255,255,255,.015)" : "rgba(255,230,0,.04)",
    border: "2px solid " + (locked ? "#1c2540" : "#3a3410"),
    opacity: locked ? 0.65 : 1,
  });

  // ================= FLOOR =================
  const renderFloor = () => {
    const crtStyle: CSSProperties = {
      position: "absolute",
      left: lerp(7, 9, reveal) + "%",
      right: lerp(7, 9, reveal) + "%",
      top: lerp(8, 3, reveal) + "%",
      height: lerp(86, 46, reveal) + "%",
      zIndex: 4,
    };
    const panelStyle: CSSProperties = {
      position: "absolute",
      left: 0,
      right: 0,
      top: lerp(104, 52, reveal) + "%",
      height: "48%",
      zIndex: 3,
    };
    const bootStyle: CSSProperties = {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: 1 - term,
      pointerEvents: term > 0.5 ? "none" : "auto",
      transition: "opacity .2s",
    };
    const termStyle: CSSProperties = {
      position: "absolute",
      inset: "4% 5%",
      display: "flex",
      flexDirection: "column",
      opacity: term,
      pointerEvents: term > 0.5 ? "auto" : "none",
      transition: "opacity .2s",
    };
    const scanStyle: CSSProperties = {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      opacity: scan,
      borderRadius: "22px",
      background: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.55) 2px 4px)",
      animation: "scandrift 0.5s steps(2) infinite",
    };
    const flickerStyle: CSSProperties = {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      borderRadius: "22px",
      background: "rgba(180,240,255,1)",
      mixBlendMode: "soft-light",
      animation: FLICKER ? "crtflicker 4s infinite" : "none",
      opacity: 0.05,
    };
    const joyStyle: CSSProperties = {
      position: "relative",
      width: "100%",
      height: "100%",
      transformOrigin: "50% 100%",
      transform: "rotateX(" + jx + "deg) rotateY(" + jy + "deg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
    };
    const hookInput: CSSProperties = {
      flex: 1,
      minWidth: 0,
      background: "#050a10",
      border: "2px solid #12463f",
      borderRadius: "4px",
      color: "#39ff14",
      fontFamily: VT,
      fontSize: "clamp(15px,1.8vw,21px)",
      padding: "7px 10px",
      textShadow: "0 0 6px #39ff14",
      boxShadow: "inset 0 0 12px rgba(57,255,20,.12)",
    };

    return (
      <div
        ref={scrollerRef}
        onScroll={(e) => {
          const sc = e.currentTarget;
          const max = Math.max(1, sc.scrollHeight - sc.clientHeight);
          setProgress(clamp(sc.scrollTop / max, 0, 1));
        }}
        style={{ height: "100vh", overflowY: "auto", overflowX: "hidden", background: "#04040a", position: "relative" }}
      >
        <div style={{ height: "320vh", position: "relative" }}>
          <div
            style={{
              position: "sticky",
              top: 0,
              height: "100vh",
              overflow: "hidden",
              background: "radial-gradient(140% 90% at 50% -10%, #1a1f36 0%, #0b0d17 45%, #05060d 100%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "radial-gradient(60% 45% at 50% 22%, rgba(0,240,255,.10), transparent 70%), radial-gradient(50% 40% at 50% 78%, rgba(255,43,209,.08), transparent 70%)",
              }}
            />

            {/* top marquee */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: isMobile ? "34px" : "6.5%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: isMobile ? "6px" : "14px",
                padding: isMobile ? "0 8px" : 0,
                background: "linear-gradient(#161a2d,#0d1020)",
                borderBottom: "3px solid #23283c",
                boxShadow: "inset 0 -6px 14px rgba(0,0,0,.6)",
                zIndex: 6,
              }}
            >
              {!isMobile && <span style={{ fontFamily: PS, fontSize: "11px", color: "#00f0ff", textShadow: "0 0 8px #00f0ff" }}>◄</span>}
              <span style={{ fontFamily: PS, fontSize: isMobile ? "8px" : "clamp(11px,1.5vw,18px)", color: "#ff2bd1", letterSpacing: isMobile ? "1px" : "2px", animation: "marqueeglow 2.4s infinite", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                {club()} · ARCADE RECRUITMENT
              </span>
              {!isMobile && <span style={{ fontFamily: PS, fontSize: "11px", color: "#00f0ff", textShadow: "0 0 8px #00f0ff" }}>►</span>}
            </div>

            {/* candidate login / resume */}
            <div style={{ position: "absolute", top: isMobile ? "44px" : "8.2%", left: isMobile ? "2%" : "2.5%", zIndex: 7, textAlign: "left", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", maxWidth: isMobile ? "60%" : undefined }}>
              {resumeInfo && (
                <button
                  onClick={() => goTo("hq")}
                  style={{ cursor: "pointer", fontFamily: PS, fontSize: isMobile ? "7px" : "9px", color: "#04040a", border: "none", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", borderRadius: "4px", padding: isMobile ? "5px 8px" : "6px 10px", boxShadow: "0 3px 0 #006074, 0 0 12px rgba(0,240,255,.5)" }}
                >
                  {isMobile ? "▶ RESUME" : `▶ RESUME AS ${resumeInfo.name.toUpperCase().slice(0, 14)}`}
                </button>
              )}
              <button
                onClick={() => { setLoginEmail(form.email.trim() || loginEmail); setShowLoginModal(true); }}
                style={{ cursor: "pointer", fontFamily: PS, fontSize: isMobile ? "7px" : "9px", color: "#39ff14", border: "1.5px solid #39ff1466", background: "rgba(57,255,20,.1)", borderRadius: "4px", padding: isMobile ? "5px 8px" : "6px 10px", textShadow: "0 0 8px #39ff14" }}
              >
                {isMobile ? "🔑 LOGIN" : "🔑 PLAYER LOGIN"}
              </button>
            </div>

            <div style={{ position: "absolute", top: isMobile ? "44px" : "8.2%", right: isMobile ? "2%" : "2.5%", zIndex: 7, textAlign: "right", fontFamily: PS, lineHeight: 1.5 }}>
              <div style={{ fontSize: isMobile ? "6px" : "9px", color: "#ffe600", textShadow: "0 0 8px #ffe600" }}>HIGH SCORE</div>
              <div style={{ fontSize: isMobile ? "12px" : "clamp(14px,1.8vw,22px)", color: "#39ff14", textShadow: "0 0 10px #39ff14", letterSpacing: "2px" }}>{scoreStr}</div>
              {!isMobile && <div style={{ fontSize: "7px", color: "#7de8ff", marginTop: "2px" }}>▲ LIVE REGISTRATIONS</div>}
            </div>

            {/* CRT */}
            <div style={crtStyle}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "26px", background: "linear-gradient(150deg,#2a2f45,#12141f)", boxShadow: "0 24px 60px rgba(0,0,0,.7), inset 0 0 0 3px #05060d" }} />
              <div
                style={{
                  position: "absolute",
                  inset: "3.5%",
                  borderRadius: "22px",
                  overflow: "hidden",
                  background: "radial-gradient(120% 120% at 50% 42%, #0b1a1e 0%, #05090f 78%)",
                  boxShadow: "inset 0 0 70px rgba(0,0,0,.9), inset 0 0 24px rgba(0,240,255,.14)",
                }}
              >
                <div style={{ position: "absolute", inset: 0, background: tintColor, mixBlendMode: "screen", pointerEvents: "none" }} />

                {/* BOOT */}
                <div style={bootStyle}>
                  <div style={{ textAlign: "center", padding: "0 6%" }}>
                    <div style={{ fontFamily: PS, fontSize: "clamp(20px,4vw,52px)", color: "#00f0ff", textShadow: "2px 0 #ff2bd1, -2px 0 #ffe600, 0 0 24px rgba(0,240,255,.6)", letterSpacing: "3px", lineHeight: 1.3 }}>
                      {club()}
                    </div>
                    <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.4vw,16px)", color: "#ff2bd1", marginTop: "14px", letterSpacing: "4px", textShadow: "0 0 10px #ff2bd1" }}>
                      ◆ CLUB RECRUITMENT ARCADE ◆
                    </div>
                    <div style={{ textAlign: "left", display: "inline-block", marginTop: "34px", fontFamily: VT, fontSize: "clamp(16px,2.2vw,26px)", color: "#39ff14", lineHeight: 1.5, textShadow: "0 0 6px rgba(57,255,20,.6)" }}>
                      <div>&gt; SYSTEM INITIALIZING<span style={{ animation: "blink 1s steps(1) infinite" }}>...</span></div>
                      <div>&gt; CLUB NAME: <span style={{ color: "#ffe600" }}>{club()}</span></div>
                      <div>&gt; WELCOME, PLAYER 1.</div>
                      <div>&gt; 6 GUILD DOMAINS DETECTED.</div>
                      <div style={{ color: "#ffe600", textShadow: "0 0 12px #ffe600", animation: "blink 1.05s steps(1) infinite", marginTop: "6px" }}>&gt; INSERT COIN OR SCROLL TO START ▮</div>
                    </div>
                    {/* Primary landing action -> the Recruitment Quest briefing */}
                    <div style={{ marginTop: "30px" }}>
                      <ArcadeButton
                        onClick={() => router.push("/process")}
                        style={{ cursor: "pointer", fontFamily: PS, fontSize: "clamp(10px,1.5vw,15px)", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", border: "none", borderRadius: "8px", padding: "15px 24px", boxShadow: "0 8px 0 #006074, 0 0 28px rgba(0,240,255,.6), inset 0 3px 8px rgba(255,255,255,.5)", letterSpacing: "1px", textShadow: "0 1px 0 rgba(255,255,255,.4)" }}
                        activeStyle={{ transform: "translateY(6px)", boxShadow: "0 2px 0 #006074, 0 0 18px rgba(0,240,255,.5), inset 0 3px 8px rgba(255,255,255,.5)" }}
                      >
                        ▶ INSERT COIN · VIEW QUEST
                      </ArcadeButton>
                    </div>
                  </div>
                  <div style={{ position: "absolute", bottom: "5%", left: 0, right: 0, textAlign: "center", fontFamily: PS, fontSize: "10px", color: "#7de8ff" }}>
                    <div>SCROLL TO BROWSE DOMAINS</div>
                    <div style={{ fontSize: "18px", animation: "scrollpulse 1.4s infinite", marginTop: "8px" }}>▼</div>
                  </div>
                </div>

                {/* DOMAIN GRID */}
                <div style={termStyle}>
                  <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.3vw,14px)", color: "#ffe600", textShadow: "0 0 8px #ffe600", letterSpacing: "1px", marginBottom: "2.5%" }}>
                    ▶ EXPLORE OUR DOMAINS — 6 GUILD STAGES
                  </div>
                  <div className="crt-domain-grid">
                    {DOMAINS.map((d) => (
                      <div key={d.key} style={cabStyle(d)} onClick={() => openDetail(d.key)} onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover("")}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: d.color, boxShadow: "0 0 10px " + d.color }} />
                        <div style={{ fontFamily: PS, fontSize: "clamp(16px,2.2vw,30px)", color: d.color, textShadow: "0 0 12px " + d.color }}>{d.glyph}</div>
                        <div style={{ fontFamily: PS, fontSize: "clamp(8px,1vw,11px)", color: "#fff", marginTop: "7px", letterSpacing: "1px" }}>{d.name}</div>
                        <div style={{ fontFamily: VT, fontSize: "clamp(13px,1.5vw,19px)", color: d.color, lineHeight: 1 }}>{d.stage}</div>
                        <div style={{ fontFamily: VT, fontSize: "clamp(11px,1.2vw,15px)", color: "#7de8ff", marginTop: "2px" }}>CLASS · {d.cls}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={scanStyle} />
                <div style={flickerStyle} />
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(115deg, rgba(255,255,255,.07) 0%, transparent 30%, transparent 70%, rgba(255,255,255,.03) 100%)", borderRadius: "22px" }} />
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "22px", boxShadow: "inset 0 0 90px 12px rgba(0,0,0,.85)" }} />
              </div>
            </div>

            {/* CONTROL PANEL */}
            <div style={panelStyle}>
              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(96deg, #1c150e 0 26px, #241a11 26px 52px)", boxShadow: "inset 0 8px 24px rgba(0,0,0,.6), inset 0 0 0 4px #0e0a06", borderTop: "4px solid #3a2b1a" }} />
              <div
                style={{
                  position: "absolute",
                  inset: "8% 4% 10% 4%",
                  borderRadius: "14px",
                  background: "linear-gradient(180deg, #2a2f42, #171a29)",
                  boxShadow: "inset 0 2px 0 rgba(255,255,255,.06), inset 0 -6px 20px rgba(0,0,0,.6), 0 10px 30px rgba(0,0,0,.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 4%",
                  gap: "3%",
                }}
              >
                {/* Joystick */}
                <div style={{ perspective: "700px", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ position: "relative", width: "clamp(78px,8vw,130px)", height: "clamp(100px,12vw,180px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                    <div style={{ position: "absolute", bottom: 0, width: "78%", height: "26%", borderRadius: "50%", background: "radial-gradient(circle at 50% 35%, #3a4056, #0c0e18)", boxShadow: "0 8px 18px rgba(0,0,0,.6)" }} />
                    <div style={joyStyle}>
                      <div style={{ width: "22%", height: "64%", margin: "0 auto", background: "linear-gradient(90deg,#5a6072,#c9cfe0 45%,#5a6072)", borderRadius: "6px", boxShadow: "inset 0 0 4px rgba(0,0,0,.4)" }} />
                      <div style={{ position: "absolute", top: "-2%", left: "50%", transform: "translateX(-50%)", width: "56%", aspectRatio: "1", borderRadius: "50%", background: "radial-gradient(circle at 34% 28%, #ff8a80, #ff3b30 45%, #a11208 100%)", boxShadow: "0 0 18px rgba(255,59,48,.7), inset -6px -8px 14px rgba(0,0,0,.4), inset 6px 6px 12px rgba(255,255,255,.35)" }} />
                    </div>
                  </div>
                  <div style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff", textShadow: "0 0 6px #00f0ff" }}>◄ MOVE ►</div>
                </div>

                {/* Hook form */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <div style={{ fontFamily: PS, fontSize: "clamp(8px,1.1vw,14px)", color: "#ff2bd1", textShadow: "0 0 10px #ff2bd1", letterSpacing: "1px", textAlign: "center", lineHeight: 1.35 }}>QUICK HOOK · INSERT PLAYER DATA</div>
                  <div className="hook-form-inputs">
                    <input value={form.name} onChange={setField("name")} placeholder="PLAYER NAME" style={hookInput} />
                    <input value={form.email} onChange={setField("email")} placeholder="COLLEGE EMAIL (@ABES.AC.IN)" style={hookInput} />
                  </div>
                  <div style={{ ...errBase, fontSize: "8px", minHeight: "8px", textAlign: "center" }}>{error}</div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "2px", flexWrap: "wrap", justifyContent: "center" }}>
                    <ArcadeButton
                      onClick={onScrollDomains}
                      style={{ cursor: "pointer", width: "clamp(48px,5.5vw,66px)", height: "clamp(48px,5.5vw,66px)", borderRadius: "50%", border: "none", background: "radial-gradient(circle at 38% 30%, #7de8ff, #0090b8 55%, #003a4d)", boxShadow: "0 8px 0 #002230, 0 0 18px rgba(0,240,255,.6), inset 0 3px 6px rgba(255,255,255,.5)", fontFamily: PS, fontSize: "clamp(7px, 0.9vw, 9px)", color: "#04121a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.15 }}
                      activeStyle={{ transform: "translateY(6px)", boxShadow: "0 2px 0 #002230, inset 0 3px 6px rgba(255,255,255,.5)" }}
                    >
                      A<br />INFO
                    </ArcadeButton>
                    <button
                      onClick={() => { setLoginEmail(form.email.trim() || loginEmail); setShowLoginModal(true); }}
                      style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#ffe600", background: "rgba(255,230,0,.1)", border: "1px solid #ffe60066", borderRadius: "4px", padding: "6px 10px", textShadow: "0 0 6px #ffe600" }}
                    >
                      RETURNING PLAYER LOGIN ▶
                    </button>
                  </div>
                </div>

                {/* PRESS START */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <ArcadeButton
                    onClick={onPressStart}
                    style={startBtnStyle}
                    activeStyle={{ transform: "translateY(9px)", boxShadow: "0 3px 0 #4d063d, 0 0 18px rgba(255,43,209,.6), inset 0 4px 8px rgba(255,255,255,.6)" }}
                  >
                    PRESS<br />START
                  </ArcadeButton>
                  <div style={{ fontFamily: PS, fontSize: "8px", color: "#ff2bd1", textShadow: "0 0 8px #ff2bd1" }}>▲ 1 CREDIT</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ================= CREATE =================
  const renderCreate = () => (
    <div style={{ height: "100vh", overflowY: "auto", overflowX: "hidden", background: "radial-gradient(140% 90% at 50% -10%, #141a30 0%, #0a0d1a 55%, #05060d 100%)", position: "relative" }}>
      <div style={scanOverlay(0.28)} />
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "clamp(24px,4vw,56px) clamp(16px,4vw,40px) 80px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <ArcadeButton onClick={() => goTo("floor")} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#7de8ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "5px", padding: "9px 12px" }} activeStyle={{ transform: "translateY(2px)" }}>◄ ARCADE FLOOR</ArcadeButton>
          <div style={{ fontFamily: PS, fontSize: "9px", color: "#4a5a7a" }}>STEP 2 / 4 · CHARACTER CREATION</div>
        </div>

        <div style={{ textAlign: "center", marginTop: "clamp(18px,3vw,34px)" }}>
          <div style={{ fontFamily: PS, fontSize: "clamp(18px,3.4vw,40px)", color: "#00f0ff", textShadow: "2px 0 #ff2bd1, -2px 0 #ffe600, 0 0 22px rgba(0,240,255,.5)", letterSpacing: "2px" }}>CHARACTER CREATION</div>
          <div style={{ fontFamily: VT, fontSize: "clamp(16px,2vw,24px)", color: "#ff2bd1", marginTop: "8px" }}>◆ forge your player file, pick your class, prove your worth ◆</div>
        </div>

        {/* Section 1 */}
        <div style={panelBox}>
          <div style={sectionHdr}><span style={{ color: "#00f0ff" }}>01</span> PLAYER FILE</div>
          <div className="player-form-grid">
            {[
              { l: "PLAYER NAME", k: "name" as const, ph: "ENTER NAME" },
              { l: "COLLEGE EMAIL", k: "email" as const, ph: "student@abes.ac.in" },
              { l: "BRANCH", k: "branch" as const, ph: "E.G. COMPUTER SCIENCE" },
              { l: "SECTION", k: "section" as const, ph: "E.G. A / 2ND YEAR" },
              { l: "PHONE NUMBER", k: "phone" as const, ph: "+91 00000 00000" },
              { l: "STUDENT ID", k: "college" as const, ph: "STUDENT ID / ROLL NO" },
            ].map((f) => (
              <div key={f.k}>
                <div style={labelSm}>{f.l}</div>
                <input value={form[f.k]} onChange={setField(f.k)} placeholder={f.ph} style={fieldStyle} />
              </div>
            ))}
          </div>
        </div>

        {/* Section 2 — Dual Class Selection */}
        <div style={panelBox}>
          <div style={sectionHdr}><span style={{ color: "#ff2bd1" }}>02</span> CLASS SELECTION <span style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#7de8ff", marginLeft: "8px" }}>— PICK 2 DOMAINS</span></div>
          <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#a9c3d6", marginBottom: "clamp(12px,1.8vw,18px)" }}>
            Select your <span style={{ color: "#00f0ff", textShadow: "0 0 6px #00f0ff" }}>PRIMARY</span> and <span style={{ color: "#ff2bd1", textShadow: "0 0 6px #ff2bd1" }}>SECONDARY</span> guild domains. Your 1st pick is your primary class.
          </div>
          <div className="class-select-grid">
            {DOMAINS.map((d) => {
              const idx = selectedClasses.indexOf(d.key);
              const isPrimary = idx === 0;
              const isSecondary = idx === 1;
              const labelColor = isPrimary ? "#00f0ff" : isSecondary ? "#ff2bd1" : d.color;
              const labelText = isPrimary ? "1ST" : isSecondary ? "2ND" : "";
              return (
                <div key={d.key} style={badgeStyle(d)} onClick={() => toggleClass(d.key)}>
                  <div style={{ width: "clamp(44px,5vw,60px)", height: "clamp(44px,5vw,60px)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", background: "rgba(255,255,255,.03)", border: "2px solid " + d.color, fontFamily: PS, fontSize: "clamp(18px,2.4vw,26px)", color: d.color, textShadow: "0 0 12px " + d.color }}>{d.glyph}</div>
                  <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: PS, fontSize: "clamp(8px,1vw,11px)", color: "#fff" }}>{d.name}</div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,19px)", color: d.color }}>{d.stage}</div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(12px,1.3vw,16px)", color: "#7de8ff" }}>CLASS · {d.cls}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                    {/* Selection badge */}
                    <div style={{
                      position: "absolute", top: "8px", right: "10px",
                      fontFamily: PS, fontSize: "9px",
                      color: "#04040a",
                      background: labelColor,
                      borderRadius: "4px",
                      padding: "3px 7px",
                      boxShadow: `0 0 10px ${labelColor}88`,
                      opacity: idx >= 0 ? 1 : 0,
                      transition: "all .15s",
                    }}>{labelText}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openDetail(d.key); }}
                      style={{ cursor: "pointer", position: "absolute", bottom: "8px", right: "10px", fontFamily: PS, fontSize: "7px", color: d.color, background: `${d.color}11`, border: `1.5px solid ${d.color}44`, borderRadius: "4px", padding: "4px 8px", textShadow: `0 0 6px ${d.color}`, transition: "all .15s", opacity: 0.7 }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = `${d.color}22`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; e.currentTarget.style.background = `${d.color}11`; }}
                    >
                      ⓘ INFO
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Selection summary */}
          {selectedClasses.length > 0 && (
            <div style={{ marginTop: "clamp(12px,1.8vw,18px)", padding: "10px 14px", borderRadius: "8px", background: "rgba(255,255,255,.02)", border: "2px solid #1c2540", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
              {selectedClasses.map((key, i) => {
                const dm = DOMAINS.find((x) => x.key === key);
                if (!dm) return null;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontFamily: PS, fontSize: "9px", color: "#04040a", background: i === 0 ? "#00f0ff" : "#ff2bd1", borderRadius: "3px", padding: "2px 6px" }}>{i === 0 ? "1ST" : "2ND"}</span>
                    <span style={{ fontFamily: PS, fontSize: "clamp(8px,1vw,11px)", color: dm.color, textShadow: `0 0 6px ${dm.color}` }}>{dm.glyph} {dm.name}</span>
                  </div>
                );
              })}
              {selectedClasses.length < 2 && (
                <span style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#ffe600", animation: "blink 1s steps(1) infinite" }}>← PICK {2 - selectedClasses.length} MORE</span>
              )}
            </div>
          )}
        </div>

        {/* Section 3 */}
        <div style={panelBox}>
          <div style={sectionHdr}><span style={{ color: "#39ff14" }}>03</span> QUEST QUESTIONS <span style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#7de8ff", marginLeft: "8px" }}>— 7 GUILD TRIALS</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(16px,2.2vw,24px)" }}>
            {[
              { num: "Q1", q: "What is your biggest strength, and what is one key skill you are actively working to improve?", k: "q1" as const },
              { num: "Q2", q: "What specifically drew you to our club, and what excites you most about becoming a member?", k: "q2" as const },
              { num: "Q3", q: "What core skills or talents (e.g., coding, creative design, video editing, event management, public speaking) do you want to bring to our team?", k: "q3" as const },
              { num: "Q4", q: "What specific goals or skills do you hope to achieve and master through your journey with us this year?", k: "q4" as const },
              { num: "Q5", q: "When working on a group project or event, how do you approach challenges when a task isn't going as planned?", k: "q5" as const },
              { num: "Q6", q: "When given ownership of a project or task, what steps do you take to ensure it gets completed successfully from start to finish?", k: "q6" as const },
              { num: "Q7", q: "If you could launch one new project, event, or initiative with our club this year, what would it be?", k: "q7" as const },
            ].map((q) => (
              <div key={q.k} style={{ background: "rgba(255,255,255,.015)", padding: "14px 16px", borderRadius: "8px", border: "1px solid #12463f" }}>
                <div style={{ ...labelSm, color: "#39ff14", marginBottom: "6px" }}>
                  {q.num}
                </div>
                <div style={{ fontFamily: VT, fontSize: "clamp(16px,1.9vw,22px)", color: "#ffe600", marginBottom: "10px", lineHeight: 1.35 }}>
                  "{q.q}"
                </div>
                <textarea value={form[q.k]} onChange={setField(q.k)} rows={3} placeholder="TYPE YOUR ANSWER..." style={areaStyle} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...errBase, textAlign: "center", marginTop: "18px" }}>{error}</div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: "clamp(24px,4vw,40px)" }}>
          <ArcadeButton
            onClick={onSaveData}
            style={{ cursor: "pointer", fontFamily: PS, fontSize: "clamp(11px,1.5vw,16px)", color: "#053200", background: "radial-gradient(circle at 40% 30%, #eaffb0, #39ff14 55%, #0f8a00)", border: "none", borderRadius: "8px", padding: "clamp(16px,2.2vw,22px) clamp(28px,4vw,44px)", boxShadow: "0 10px 0 #0a5200, 0 0 34px rgba(57,255,20,.6), inset 0 3px 8px rgba(255,255,255,.6)", textShadow: "0 1px 0 rgba(255,255,255,.5)" }}
            activeStyle={{ transform: "translateY(7px)", boxShadow: "0 3px 0 #0a5200, 0 0 18px rgba(57,255,20,.5), inset 0 3px 8px rgba(255,255,255,.6)" }}
          >
            ▶ SAVE PLAYER DATA
          </ArcadeButton>
        </div>
      </div>
    </div>
  );

  // ================= PASS =================
  const renderPass = () => (
    <div style={{ height: "100vh", overflowY: "auto", overflowX: "hidden", background: "radial-gradient(130% 90% at 50% 0%, #101830 0%, #080a16 60%, #05060d 100%)", position: "relative" }}>
      <div style={scanOverlay(0.3)} />
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(16px,2.4vw,26px)", padding: "clamp(28px,5vw,60px) 20px 70px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ fontFamily: PS, fontSize: "clamp(20px,3.6vw,48px)", animation: "gameon 0.7s infinite" }}>LEVEL CLEAR!</div>
          <div style={{ fontFamily: PS, fontSize: "clamp(14px,2vw,26px)", color: "#ffe600", textShadow: "0 0 14px #ffe600", animation: "spin1up 3s linear infinite" }}>1UP</div>
        </div>
        <div style={{ fontFamily: VT, fontSize: "clamp(16px,2vw,24px)", color: "#7de8ff", textAlign: "center" }}>&gt; PLAYER DATA SAVED · GENERATING ARCADE PASS...</div>

        <canvas ref={ticketRef} style={{ width: "100%", maxWidth: "600px", imageRendering: "pixelated", borderRadius: "6px", boxShadow: "0 0 40px rgba(0,240,255,.4)" }} />

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <ArcadeButton onClick={onDownload} style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#04040a", background: "#00f0ff", border: "none", borderRadius: "5px", padding: "12px 16px", boxShadow: "0 5px 0 #007a8a, 0 0 16px rgba(0,240,255,.5)" }} activeStyle={{ transform: "translateY(3px)", boxShadow: "0 2px 0 #007a8a" }}>⤓ DOWNLOAD PASS</ArcadeButton>
          <ArcadeButton onClick={onShareWA} style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#04040a", background: "#39ff14", border: "none", borderRadius: "5px", padding: "12px 16px", boxShadow: "0 5px 0 #0a5200, 0 0 16px rgba(57,255,20,.5)" }} activeStyle={{ transform: "translateY(3px)", boxShadow: "0 2px 0 #0a5200" }}>◈ WHATSAPP</ArcadeButton>
          <ArcadeButton onClick={onShareIG} style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#fff", background: "#ff2bd1", border: "none", borderRadius: "5px", padding: "12px 16px", boxShadow: "0 5px 0 #8a0e6d, 0 0 16px rgba(255,43,209,.5)" }} activeStyle={{ transform: "translateY(3px)", boxShadow: "0 2px 0 #8a0e6d" }}>◉ INSTAGRAM</ArcadeButton>
        </div>

        {/* activation */}
        <div style={{ width: "100%", maxWidth: "600px", marginTop: "8px", background: "rgba(10,14,26,.85)", border: "3px solid #1c2540", borderRadius: "12px", padding: "clamp(18px,2.6vw,28px)", boxShadow: "0 0 30px rgba(0,0,0,.5), inset 0 0 22px rgba(0,240,255,.05)" }}>
          <div style={{ fontFamily: PS, fontSize: "clamp(10px,1.3vw,13px)", color: "#ffe600", textShadow: "0 0 8px #ffe600", letterSpacing: "1px" }}>▶ ACTIVATE ACCOUNT · ENTER PLAYER HQ</div>
          <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,20px)", color: "#7de8ff", marginTop: "6px", marginBottom: "14px" }}>Set a secret PIN to track your quest, tasks &amp; interview slots.</div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: "180px" }}>
              <div style={labelSm}>SET SECRET PIN</div>
              <input value={pin} onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setError(""); }} type="password" maxLength={6} placeholder="4-6 DIGIT PIN" style={fieldStyle} />
            </div>
            <ArcadeButton onClick={onEnterHQ} style={{ cursor: "pointer", fontFamily: PS, fontSize: "clamp(9px,1.2vw,12px)", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", border: "none", borderRadius: "6px", padding: "14px 18px", boxShadow: "0 6px 0 #006074, 0 0 20px rgba(0,240,255,.5)", textShadow: "0 1px 0 rgba(255,255,255,.4)" }} activeStyle={{ transform: "translateY(4px)", boxShadow: "0 2px 0 #006074" }}>ENTER HQ ▶</ArcadeButton>
          </div>
          <div style={{ ...errBase, marginTop: "12px" }}>{error}</div>
        </div>
      </div>
    </div>
  );

  // ================= HQ =================
  // ---- Journey stopped (rejection) outcome screen ----
  const renderRejected = () => {
    const dom = selDomain(0);
    const reachedIdx = Math.min(Math.max(rejectedAtStage, 1), STAGES.length - 1);
    const reachedLabel = STAGES[reachedIdx]?.label || "SCREENING";
    const positive =
      `Reaching the ${reachedLabel} stage is no small feat — it means your skills are real. ` +
      `Every great player has a stack of "Game Over" screens behind them. Keep building, keep shipping, ` +
      `and drop another coin next season. TECHNOVATION would love to see you back. 🎮`;
    return (
      <div style={{ height: "100vh", overflowY: "auto", overflowX: "hidden", background: "radial-gradient(120% 80% at 50% -5%, #2a0e18 0%, #0a0e1c 55%, #05060d 100%)", position: "relative" }}>
        <div style={scanOverlay(0.22)} />
        <div style={{ maxWidth: "760px", margin: "0 auto", padding: "clamp(28px,5vw,60px) clamp(16px,4vw,40px) 80px", display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(18px,3vw,26px)" }}>
          {/* identity */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", border: "3px solid #ff3b30", boxShadow: "0 0 18px #ff3b3066", flexShrink: 0 }}>
              <canvas ref={hqAvatarRef} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
            </div>
            <div>
              <div style={{ fontFamily: PS, fontSize: "clamp(12px,1.8vw,18px)", color: "#fff" }}>{(form.name || "PLAYER 1").toUpperCase()}</div>
              <div style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff", marginTop: "6px" }}>PLAYER No. #{String(playerNo || 1).padStart(4, "0")}</div>
            </div>
          </div>

          {/* GAME OVER */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: PS, fontSize: "clamp(20px,4vw,40px)", color: "#ff3b30", textShadow: "0 0 18px rgba(255,59,48,.6)", letterSpacing: "2px" }}>GAME OVER</div>
            <div style={{ fontFamily: VT, fontSize: "clamp(18px,2.2vw,26px)", color: "#7de8ff", marginTop: "12px" }}>Your quest concluded at the <span style={{ color: "#ffe600" }}>{reachedLabel}</span> stage.</div>
          </div>

          {/* journey tracker (stopped) */}
          <div style={{ ...panelBox, width: "100%", marginTop: 0 }}>
            <div style={sectionHdr}><span style={{ color: "#ff3b30" }}>▮</span> YOUR JOURNEY</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
              {STAGES.map((s, i) => {
                const cleared = i < reachedIdx;
                const stopped = i === reachedIdx;
                const col = cleared ? "#39ff14" : stopped ? "#ff3b30" : "#2a3350";
                return (
                  <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
                    <div style={{ position: "absolute", top: "clamp(16px,2.4vw,22px)", left: "-50%", width: "100%", height: "4px", background: i === 0 ? "transparent" : i <= reachedIdx ? "#39ff14" : "#1c2540", zIndex: 0 }} />
                    <div style={{ position: "relative", zIndex: 1, width: "clamp(34px,4.8vw,48px)", height: "clamp(34px,4.8vw,48px)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: PS, fontSize: "clamp(11px,1.4vw,16px)", color: stopped ? "#04040a" : col, background: stopped ? "#ff3b30" : cleared ? "rgba(57,255,20,.12)" : "rgba(255,255,255,.02)", border: "3px solid " + col, boxShadow: cleared || stopped ? "0 0 16px " + col : "none" }}>{cleared ? "✓" : stopped ? "✕" : s.icon}</div>
                    <div style={{ fontFamily: PS, fontSize: "clamp(6px,.85vw,9px)", color: col, marginTop: "10px", lineHeight: 1.4, textShadow: cleared || stopped ? "0 0 6px " + col : "none" }}>{s.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* council feedback (if provided) */}
          {rejectionFeedback.trim() && (
            <div style={{ ...panelBoxTight, width: "100%" }}>
              <div style={sectionHdr}><span style={{ color: "#ff2bd1" }}>✎</span> COUNCIL FEEDBACK</div>
              <div style={{ fontFamily: VT, fontSize: "clamp(16px,2vw,20px)", color: "#a9c3d6", lineHeight: 1.35 }}>&quot;{rejectionFeedback}&quot;</div>
            </div>
          )}

          {/* positive message */}
          <div style={{ width: "100%", background: "rgba(57,255,20,.05)", border: "2px solid #39ff1466", borderRadius: "14px", padding: "clamp(18px,2.4vw,26px)", textAlign: "center" }}>
            <div style={{ fontFamily: PS, fontSize: "clamp(10px,1.4vw,13px)", color: "#39ff14", textShadow: "0 0 10px #39ff14" }}>▶ 1UP · THIS ISN&apos;T THE END</div>
            <div style={{ fontFamily: VT, fontSize: "clamp(17px,2vw,22px)", color: "#cfe8ff", marginTop: "12px", lineHeight: 1.4 }}>{positive}</div>
          </div>

          {/* actions */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
            <ArcadeButton onClick={() => goTo("pass")} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#00f0ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>◄ VIEW MY PASS</ArcadeButton>
            <ArcadeButton onClick={handleLogout} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#ff3b30", background: "transparent", border: "2px solid #5a1a1a", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>⏻ LOG OUT</ArcadeButton>
          </div>
        </div>
      </div>
    );
  };

  const renderHQ = () => {
    if (rejected) return renderRejected();

    const dom = selDomain(0);
    const dom2 = selDomain(1);
    const selColor = dom ? dom.color : "#00f0ff";
    // Task guild unlocks only once the admin clears the SCREENING round.
    const screeningCleared = stageIdx >= 2;
    const domainTasks = selectedClasses
      .map((k) => DOMAINS.find((d) => d.key === k))
      .filter((d): d is (typeof DOMAINS)[number] => !!d);

    return (
      <div style={{ height: "100vh", overflowY: "auto", overflowX: "hidden", background: "radial-gradient(120% 80% at 80% -5%, #12203a 0%, #0a0e1c 55%, #05060d 100%)", position: "relative" }}>
        <div style={scanOverlay(0.22)} />
        <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "clamp(22px,3.5vw,44px) clamp(16px,4vw,40px) 80px" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", borderBottom: "3px solid #1c2540", paddingBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ width: "clamp(56px,7vw,84px)", height: "clamp(56px,7vw,84px)", borderRadius: "8px", overflow: "hidden", border: "3px solid " + selColor, boxShadow: "0 0 18px " + selColor + "66", flexShrink: 0 }}>
                <canvas ref={hqAvatarRef} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
              </div>
              <div>
                <div style={{ fontFamily: PS, fontSize: "clamp(12px,1.8vw,20px)", color: "#00f0ff", textShadow: "0 0 12px rgba(0,240,255,.5)" }}>{(form.name || "PLAYER 1").toUpperCase()}</div>
                <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,21px)", color: selColor }}>{[dom, dom2].filter(Boolean).map((d) => d!.stage + " · " + d!.cls).join(" + ") || "UNASSIGNED · ROOKIE"}</div>
                <div style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff", marginTop: "4px" }}>PLAYER No. #{String(playerNo || 1).padStart(4, "0")} · LV.01</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: PS, fontSize: "9px", color: "#4a5a7a" }}>PLAYER HQ · COMMAND CENTER</div>
              <div style={{ fontFamily: PS, fontSize: "clamp(13px,1.6vw,18px)", color: "#39ff14", textShadow: "0 0 10px #39ff14", marginTop: "6px" }}>{scoreStr} <span style={{ fontSize: "8px", color: "#7de8ff" }}>RECRUITS</span></div>
            </div>
          </div>

          {/* stage progress */}
          <div style={panelBox}>
            <div style={sectionHdr}><span style={{ color: "#00f0ff" }}>▮</span> STAGE PROGRESS</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
              {STAGES.map((s, i) => {
                const done = i < stageIdx,
                  isCur = i === stageIdx;
                const col = done ? "#39ff14" : isCur ? "#ffe600" : "#2a3350";
                return (
                  <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
                    <div style={{ position: "absolute", top: "clamp(16px,2.4vw,22px)", left: "-50%", width: "100%", height: "4px", background: i === 0 ? "transparent" : i <= stageIdx ? "#39ff14" : "#1c2540", zIndex: 0 }} />
                    <div style={{ position: "relative", zIndex: 1, width: "clamp(34px,4.8vw,48px)", height: "clamp(34px,4.8vw,48px)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: PS, fontSize: "clamp(11px,1.4vw,16px)", color: isCur ? "#04040a" : col, background: isCur ? "#ffe600" : done ? "rgba(57,255,20,.12)" : "rgba(255,255,255,.02)", border: "3px solid " + col, boxShadow: done || isCur ? "0 0 16px " + col : "none", animation: isCur ? "floaty 1.6s ease-in-out infinite" : "none" }}>{s.icon}</div>
                    <div style={{ fontFamily: PS, fontSize: "clamp(6px,.85vw,9px)", color: col, marginTop: "10px", lineHeight: 1.4, textShadow: done || isCur ? "0 0 6px " + col : "none" }}>{s.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,20px)", color: "#ffe600", marginTop: "16px", textAlign: "center" }}>&gt; CURRENT STAGE: <span style={{ textShadow: "0 0 8px #ffe600" }}>{STAGES[stageIdx].label}</span></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "clamp(16px,2.4vw,24px)" }}>
            {/* quest log — locked until SCREENING is cleared by the council */}
            <div style={panelBoxTight}>
              <div style={sectionHdr}><span style={{ color: "#ff2bd1" }}>⚔</span> QUEST LOG</div>

              {!screeningCleared ? (
                <div style={{ ...taskCard(true), textAlign: "center", padding: "clamp(20px,3vw,30px)" }}>
                  <div style={{ fontFamily: PS, fontSize: "clamp(11px,1.4vw,14px)", color: "#4a5a7a" }}>🔒 TASK GUILD LOCKED</div>
                  <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,19px)", color: "#a9c3d6", marginTop: "12px", lineHeight: 1.35 }}>
                    Clear the <span style={{ color: "#00f0ff" }}>SCREENING</span> round first. Once the Guild Council shortlists you, your domain tasks unlock here — one for each guild you enlisted in.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {domainTasks.map((d, i) => {
                    const done = !!taskDone[d.key];
                    return (
                      <div key={d.key} style={taskCard(false)}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                          <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: done ? "#39ff14" : "#ffe600" }}>
                            {i === 0 ? "1ST" : "2ND"} · {d.name} TASK
                          </div>
                          <div style={tagStyle(done ? "done" : "active")}>{done ? "SUBMITTED" : "ACTIVE"}</div>
                        </div>
                        <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#a9c3d6", marginTop: "6px" }}>
                          Build a small artifact for the <span style={{ color: d.color }}>{d.stage}</span>. Submit your proof link below.
                        </div>
                        {done ? (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", flexWrap: "wrap", background: "#050a10", border: "2px solid #12463f", borderRadius: "4px", padding: "7px 10px" }}>
                              <span style={{ fontFamily: PS, fontSize: "8px", color: "#39ff14" }}>🔒</span>
                              <span style={{ fontFamily: VT, fontSize: "16px", color: "#39ff14", wordBreak: "break-all", flex: 1, minWidth: 0, textShadow: "0 0 6px #39ff14" }}>{taskLinks[d.key]}</span>
                            </div>
                            <div style={{ fontFamily: VT, fontSize: "14px", color: "#39ff14", marginTop: "6px" }}>✓ Submitted &amp; locked — the council will review your {d.name} task. Submissions are final.</div>
                          </>
                        ) : (
                          <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                            <input
                              value={taskLinks[d.key] || ""}
                              onChange={(e) => setTaskLinks((p) => ({ ...p, [d.key]: e.target.value }))}
                              placeholder="PASTE SUBMISSION LINK"
                              style={{ flex: 1, minWidth: "150px", background: "#050a10", border: "2px solid #12463f", borderRadius: "4px", color: "#39ff14", fontFamily: VT, fontSize: "16px", padding: "6px 9px", textShadow: "0 0 6px #39ff14" }}
                            />
                            <ArcadeButton onClick={() => submitTaskFor(d.key)} style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#053200", background: "#39ff14", border: "none", borderRadius: "4px", padding: "8px 12px", boxShadow: "0 4px 0 #0a5200" }} activeStyle={{ transform: "translateY(2px)", boxShadow: "0 2px 0 #0a5200" }}>SUBMIT</ArcadeButton>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* interview prep — upcoming */}
                  <div style={taskCard(true)}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                      <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: "#4a5a7a" }}>ROUND 2 · INTERVIEW PREP</div>
                      <div style={tagStyle("locked")}>UPCOMING</div>
                    </div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#a9c3d6", marginTop: "6px" }}>Review guild lore & prepare a 2-min pitch. Unlocks once your tasks are judged.</div>
                  </div>
                </div>
              )}
            </div>

            {/* comms */}
            <div style={panelBoxTight}>
              <div style={sectionHdr}><span style={{ color: "#39ff14" }}>▤</span> COMMS CHANNEL</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "420px", overflowY: "auto" }}>
                {comms.map((c) => (
                  <div key={c.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "11px", borderRadius: "6px", background: "rgba(255,255,255,.02)", borderLeft: "3px solid " + c.color }}>
                    <div style={{ fontFamily: PS, fontSize: "12px", color: c.color, textShadow: "0 0 8px " + c.color }}>{c.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: PS, fontSize: "8px", color: c.color }}>{c.title}</div>
                      <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#a9c3d6", lineHeight: 1.2, marginTop: "3px" }}>{c.body}</div>
                      <div style={{ fontFamily: VT, fontSize: "13px", color: "#4a5a7a", marginTop: "3px" }}>{c.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "clamp(24px,3.5vw,36px)", flexWrap: "wrap" }}>
            <ArcadeButton onClick={() => goTo("pass")} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#00f0ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>◄ VIEW MY PASS</ArcadeButton>
            <ArcadeButton onClick={handleLogout} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#ff3b30", background: "transparent", border: "2px solid #5a1a1a", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>⏻ LOG OUT</ArcadeButton>
          </div>
        </div>
      </div>
    );
  };

  // ================= DOMAIN DETAIL OVERLAY =================
  const renderDomainDetail = () => {
    if (!detailDomain) return null;
    const d = DOMAINS.find((dm) => dm.key === detailDomain);
    if (!d) return null;

    return (
      <div
        onClick={closeDetail}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: detailVisible ? "rgba(4,4,10,0.92)" : "rgba(4,4,10,0)",
          backdropFilter: detailVisible ? "blur(12px)" : "blur(0px)",
          WebkitBackdropFilter: detailVisible ? "blur(12px)" : "blur(0px)",
          transition: "background 0.4s ease, backdrop-filter 0.4s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        {/* Scanline overlay on the modal */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 101, opacity: 0.18, background: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.55) 2px 4px)" }} />

        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            zIndex: 102,
            width: "100%",
            maxWidth: "780px",
            maxHeight: "90vh",
            overflowY: "auto",
            borderRadius: "18px",
            background: "radial-gradient(120% 100% at 50% 0%, #0f1528 0%, #080a16 55%, #050710 100%)",
            border: `3px solid ${d.color}44`,
            boxShadow: `0 0 80px ${d.color}22, 0 0 40px rgba(0,0,0,.8), inset 0 0 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06)`,
            transform: detailVisible ? "scale(1) translateY(0)" : "scale(0.88) translateY(40px)",
            opacity: detailVisible ? 1 : 0,
            transition: "transform 0.4s cubic-bezier(.22,1,.36,1), opacity 0.35s ease",
          }}
        >
          {/* Accent top bar */}
          <div style={{ height: "4px", background: `linear-gradient(90deg, transparent, ${d.color}, transparent)`, borderRadius: "18px 18px 0 0" }} />

          {/* Close button */}
          <button
            onClick={closeDetail}
            style={{
              position: "absolute",
              top: "16px",
              right: "18px",
              cursor: "pointer",
              background: "rgba(255,255,255,.04)",
              border: `2px solid ${d.color}55`,
              borderRadius: "6px",
              padding: "8px 12px",
              fontFamily: PS,
              fontSize: "9px",
              color: d.color,
              textShadow: `0 0 8px ${d.color}`,
              transition: "all .15s",
              zIndex: 5,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${d.color}22`; e.currentTarget.style.transform = "scale(1.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.04)"; e.currentTarget.style.transform = "scale(1)"; }}
          >
            ✕ CLOSE
          </button>

          <div style={{ padding: "clamp(28px,4vw,48px) clamp(24px,4vw,44px)" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "clamp(16px,2.5vw,28px)", marginBottom: "clamp(20px,3vw,32px)" }}>
              <div
                style={{
                  width: "clamp(70px,9vw,100px)",
                  height: "clamp(70px,9vw,100px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "14px",
                  background: `radial-gradient(circle at 40% 35%, ${d.color}18, transparent 70%)`,
                  border: `3px solid ${d.color}66`,
                  boxShadow: `0 0 30px ${d.color}33, inset 0 0 20px ${d.color}11`,
                  fontFamily: PS,
                  fontSize: "clamp(32px,4.5vw,52px)",
                  color: d.color,
                  textShadow: `0 0 20px ${d.color}, 0 0 40px ${d.color}88`,
                  animation: "floaty 2.2s ease-in-out infinite",
                  flexShrink: 0,
                }}
              >
                {d.glyph}
              </div>
              <div>
                <div style={{ fontFamily: PS, fontSize: "clamp(16px,2.6vw,28px)", color: d.color, textShadow: `0 0 14px ${d.color}`, letterSpacing: "2px", lineHeight: 1.3 }}>
                  {d.name}
                </div>
                <div style={{ fontFamily: VT, fontSize: "clamp(18px,2.2vw,26px)", color: d.color, marginTop: "4px", opacity: 0.85 }}>
                  {d.stage}
                </div>
                <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: "#7de8ff", marginTop: "6px", letterSpacing: "1px" }}>
                  CLASS · {d.cls}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: `linear-gradient(90deg, ${d.color}55, ${d.color}11, transparent)`, marginBottom: "clamp(18px,2.5vw,28px)" }} />

            {/* Description */}
            <div style={{ marginBottom: "clamp(22px,3vw,32px)" }}>
              <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: "#ffe600", textShadow: "0 0 8px #ffe600", letterSpacing: "1px", marginBottom: "12px" }}>
                ▶ GUILD BRIEFING
              </div>
              <div style={{
                fontFamily: VT,
                fontSize: "clamp(17px,2vw,23px)",
                color: "#c8dae8",
                lineHeight: 1.45,
                textShadow: "0 0 4px rgba(125,232,255,.15)",
              }}>
                {d.desc}
              </div>
            </div>

            {/* Skills */}
            <div style={{ marginBottom: "clamp(22px,3vw,32px)" }}>
              <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: "#ff2bd1", textShadow: "0 0 8px #ff2bd1", letterSpacing: "1px", marginBottom: "14px" }}>
                ◆ SKILL TREE
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {d.skills.map((skill, i) => (
                  <div
                    key={i}
                    style={{
                      fontFamily: PS,
                      fontSize: "clamp(7px,.9vw,10px)",
                      color: d.color,
                      background: `${d.color}0F`,
                      border: `1.5px solid ${d.color}44`,
                      borderRadius: "6px",
                      padding: "8px 14px",
                      textShadow: `0 0 6px ${d.color}88`,
                      letterSpacing: ".5px",
                      animation: `fadeSlideUp 0.4s ease ${i * 0.07}s both`,
                    }}
                  >
                    {skill}
                  </div>
                ))}
              </div>
            </div>

            {/* Quest motto */}
            <div style={{
              padding: "clamp(14px,2vw,22px) clamp(18px,2.5vw,28px)",
              borderRadius: "10px",
              background: "rgba(255,255,255,.02)",
              border: "2px solid #1c2540",
              boxShadow: "inset 0 0 20px rgba(0,0,0,.3)",
              marginBottom: "clamp(20px,2.5vw,28px)",
            }}>
              <div style={{ fontFamily: PS, fontSize: "clamp(8px,.95vw,10px)", color: "#39ff14", textShadow: "0 0 8px #39ff14", letterSpacing: "1px", marginBottom: "8px" }}>
                ⚡ PRIMARY QUEST
              </div>
              <div style={{
                fontFamily: VT,
                fontSize: "clamp(18px,2.2vw,26px)",
                color: "#ffe600",
                textShadow: "0 0 10px rgba(255,230,0,.4)",
                fontStyle: "italic",
                lineHeight: 1.3,
              }}>
                "{d.quest}"
              </div>
            </div>

            {/* CTA */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              {page !== "floor" && (
                <ArcadeButton
                  onClick={() => {
                    toggleClass(d.key);
                    closeDetail();
                  }}
                  style={{
                    cursor: "pointer",
                    fontFamily: PS,
                    fontSize: "clamp(9px,1.1vw,12px)",
                    color: "#04040a",
                    background: selectedClasses.includes(d.key)
                      ? "radial-gradient(circle at 40% 30%, #ff5555dd, #ff3b30 55%, #ff3b30aa)"
                      : `radial-gradient(circle at 40% 30%, ${d.color}dd, ${d.color} 55%, ${d.color}aa)`,
                    border: "none",
                    borderRadius: "8px",
                    padding: "clamp(12px,1.8vw,18px) clamp(20px,3vw,32px)",
                    boxShadow: selectedClasses.includes(d.key)
                      ? `0 6px 0 #aa000055, 0 0 28px #ff3b3066`
                      : `0 6px 0 ${d.color}55, 0 0 28px ${d.color}66`,
                    textShadow: "0 1px 0 rgba(255,255,255,.4)",
                    letterSpacing: "1px",
                  }}
                  activeStyle={{ transform: "translateY(4px)", boxShadow: `0 2px 0 ${d.color}55, 0 0 14px ${d.color}44` }}
                >
                  {selectedClasses.includes(d.key) ? `✕ DESELECT ${d.cls}` : `▶ SELECT ${d.cls} CLASS`}
                </ArcadeButton>
              )}
              <ArcadeButton
                onClick={closeDetail}
                style={{
                  cursor: "pointer",
                  fontFamily: PS,
                  fontSize: "clamp(9px,1.1vw,12px)",
                  color: "#7de8ff",
                  background: "transparent",
                  border: "2px solid #1c3a4a",
                  borderRadius: "8px",
                  padding: "clamp(12px,1.8vw,18px) clamp(20px,3vw,32px)",
                }}
                activeStyle={{ transform: "translateY(2px)" }}
              >
                ◄ BACK
              </ArcadeButton>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderLoginModal = () => {
    if (!showLoginModal) return null;

    const closeModal = () => {
      setShowLoginModal(false);
      setForgotPinMode(false);
      setResetStep("verify");
      setResetEmail("");
      setResetPhone("");
      setResetNewPin("");
      setResetConfirmPin("");
      setResetErr("");
      setResetSuccess("");
      setLoginErr("");
    };

    return (
      <div
        onClick={closeModal}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 110,
          background: "rgba(4,4,10,0.92)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: "460px",
            background: "radial-gradient(120% 100% at 50% 0%, #12192e 0%, #070914 100%)",
            border: `3px solid ${forgotPinMode ? "#ffe600" : "#39ff14"}`,
            borderRadius: "16px",
            padding: "32px 24px",
            boxShadow: `0 0 50px ${forgotPinMode ? "rgba(255,230,0,.25)" : "rgba(57,255,20,.25)"}`,
            position: "relative",
            textAlign: "center",
          }}
        >
          <button
            onClick={closeModal}
            style={{ position: "absolute", top: "14px", right: "16px", cursor: "pointer", background: "transparent", border: "2px solid #ff3b30", color: "#ff3b30", borderRadius: "6px", padding: "4px 8px", fontFamily: PS, fontSize: "8px" }}
          >
            ✕ CLOSE
          </button>

          {!forgotPinMode ? (
            /* ========== LOGIN VIEW ========== */
            <>
              <div style={{ fontFamily: PS, fontSize: "18px", color: "#39ff14", textShadow: "0 0 12px #39ff14" }}>🔑 PLAYER LOGIN</div>
              <div style={{ fontFamily: VT, fontSize: "18px", color: "#7de8ff", marginTop: "8px" }}>Enter your registered email & PIN to open Player HQ</div>

              <form onSubmit={handleCandidateLogin} style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
                <div>
                  <div style={{ ...labelSm, color: "#39ff14" }}>COLLEGE EMAIL (@ABES.AC.IN)</div>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => { setLoginEmail(e.target.value); setLoginErr(""); }}
                    placeholder="student@abes.ac.in"
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <div style={{ ...labelSm, color: "#ffe600" }}>SECRET PIN (4-6 DIGITS)</div>
                  <input
                    type="password"
                    value={loginPin}
                    onChange={(e) => { setLoginPin(e.target.value.replace(/[^0-9]/g, "")); setLoginErr(""); }}
                    maxLength={6}
                    placeholder="ENTER PIN"
                    style={fieldStyle}
                  />
                </div>

                {loginErr && (
                  <div style={{ ...errBase, textAlign: "center", fontSize: "8px" }}>{loginErr}</div>
                )}

                <button
                  type="submit"
                  style={{
                    cursor: "pointer",
                    fontFamily: PS,
                    fontSize: "10px",
                    color: "#04040a",
                    background: "radial-gradient(circle at 40% 30%, #eaffb0, #39ff14 55%, #0f8a00)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "14px",
                    boxShadow: "0 6px 0 #0a5200, 0 0 20px rgba(57,255,20,.5)",
                    marginTop: "6px",
                  }}
                >
                  ENTER PLAYER HQ ▶
                </button>
              </form>

              <button
                onClick={() => { setForgotPinMode(true); setLoginErr(""); }}
                style={{ cursor: "pointer", fontFamily: PS, fontSize: "7px", color: "#ffe600", background: "transparent", border: "none", marginTop: "18px", textShadow: "0 0 6px #ffe600", textDecoration: "underline", textUnderlineOffset: "4px" }}
              >
                FORGOT PIN? RESET HERE ▶
              </button>
            </>
          ) : (
            /* ========== FORGOT PIN VIEW ========== */
            <>
              <div style={{ fontFamily: PS, fontSize: "16px", color: "#ffe600", textShadow: "0 0 12px #ffe600" }}>🔐 RESET PIN</div>
              <div style={{ fontFamily: VT, fontSize: "18px", color: "#7de8ff", marginTop: "8px" }}>
                {resetStep === "verify" ? "Verify your identity using email & registered phone" : "Set your new secret PIN"}
              </div>

              {resetSuccess ? (
                <div style={{ fontFamily: PS, fontSize: "10px", color: "#39ff14", textShadow: "0 0 10px #39ff14", marginTop: "24px", padding: "16px", border: "2px solid #39ff14", borderRadius: "8px", background: "rgba(57,255,20,.08)" }}>
                  ✓ {resetSuccess}
                </div>
              ) : resetStep === "verify" ? (
                <form onSubmit={handleForgotPinVerify} style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
                  <div>
                    <div style={{ ...labelSm, color: "#ffe600" }}>COLLEGE EMAIL (@ABES.AC.IN)</div>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => { setResetEmail(e.target.value); setResetErr(""); }}
                      placeholder="student@abes.ac.in"
                      style={fieldStyle}
                    />
                  </div>
                  <div>
                    <div style={{ ...labelSm, color: "#ff7a2b" }}>REGISTERED PHONE (LAST 4 DIGITS)</div>
                    <input
                      type="text"
                      value={resetPhone}
                      onChange={(e) => { setResetPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)); setResetErr(""); }}
                      maxLength={4}
                      placeholder="LAST 4 DIGITS"
                      style={fieldStyle}
                    />
                  </div>
                  {resetErr && <div style={{ ...errBase, textAlign: "center", fontSize: "8px" }}>{resetErr}</div>}
                  <button type="submit" style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #fff5b0, #ffe600 55%, #b8a200)", border: "none", borderRadius: "8px", padding: "14px", boxShadow: "0 6px 0 #8a7900, 0 0 20px rgba(255,230,0,.4)", marginTop: "6px" }}>
                    VERIFY IDENTITY ▶
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPinSubmit} style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
                  <div>
                    <div style={{ ...labelSm, color: "#39ff14" }}>NEW PIN (4-6 DIGITS)</div>
                    <input
                      type="password"
                      value={resetNewPin}
                      onChange={(e) => { setResetNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setResetErr(""); }}
                      maxLength={6}
                      placeholder="NEW PIN"
                      style={fieldStyle}
                    />
                  </div>
                  <div>
                    <div style={{ ...labelSm, color: "#00f0ff" }}>CONFIRM NEW PIN</div>
                    <input
                      type="password"
                      value={resetConfirmPin}
                      onChange={(e) => { setResetConfirmPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setResetErr(""); }}
                      maxLength={6}
                      placeholder="RE-ENTER PIN"
                      style={fieldStyle}
                    />
                  </div>
                  {resetErr && <div style={{ ...errBase, textAlign: "center", fontSize: "8px" }}>{resetErr}</div>}
                  <button type="submit" style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #eaffb0, #39ff14 55%, #0f8a00)", border: "none", borderRadius: "8px", padding: "14px", boxShadow: "0 6px 0 #0a5200, 0 0 20px rgba(57,255,20,.5)", marginTop: "6px" }}>
                    SET NEW PIN ▶
                  </button>
                </form>
              )}

              <button
                onClick={() => { setForgotPinMode(false); setResetStep("verify"); setResetErr(""); setResetSuccess(""); }}
                style={{ cursor: "pointer", fontFamily: PS, fontSize: "7px", color: "#7de8ff", background: "transparent", border: "none", marginTop: "18px", textDecoration: "underline", textUnderlineOffset: "4px" }}
              >
                ◄ BACK TO LOGIN
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: "100%", height: "100vh", background: "#04040a" }}>
      {page === "floor" && renderFloor()}
      {page === "create" && renderCreate()}
      {page === "pass" && renderPass()}
      {page === "hq" && renderHQ()}
      {renderDomainDetail()}
      {renderLoginModal()}
    </div>
  );
}
