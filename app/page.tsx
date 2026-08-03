"use client";

/**
 * Club Recruitment Arcade — faithful port of the design artifact.
 * A single-page, state-driven arcade experience (floor → character → pass → HQ).
 * Pure frontend: no backend wired in yet (Supabase intentionally stubbed).
 * Ported 1:1 from the design's inline styles, keyframes, joystick physics and
 * canvas ticket rendering.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import TaskCountdown from "./task-countdown";
import {
  login as apiLogin,
  isRegistered as apiIsRegistered,
  registrationsOpen as apiRegistrationsOpen,
  signOut as apiSignOut,
  register as apiRegister,
  save as apiSave,
  sendResetLink,
  getVerifiedEmail,
  resetPin,
  ApiError,
} from "@/lib/api";
import { candFromRow } from "@/lib/cloud-sync";
import HelpContacts from "./help-contacts";


// ---- config (edit freely) ----
const CLUB_NAME = "TECHNOVATION";

// Task Round links. Submissions run through Google Forms, so the responses land
// in the form's own sheet rather than in sub_link_1 / sub_link_2.
const TASK_FORM_URL = "https://forms.gle/4rN45cGjgHbyv1KZ7";
const FEEDBACK_FORM_URL = "https://forms.gle/ct1pum5fyNYggrNF9";
// Shown in three places on the dashboard — edit here and it changes everywhere.
// The live clock on the arcade floor keeps its own copy of this instant in
// task-countdown.tsx; if you change the date, change it there too.
const TASK_DEADLINE = "5 AUGUST, 11:59 PM";
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
    key: "prod", name: "PRODUCTION", stage: "STAGE MASTER", glyph: "◈", color: "#00f0ff", cls: "TANK",
    desc: "The Stage Masters are the visual storytellers behind Technovation's video presence. From shooting and editing event recap videos, promo reels, and cinematic teasers to creating YouTube content, podcast visuals, and behind-the-scenes footage — the Production guild brings every moment to life on screen. You'll work with professional editing software, master color grading, sound design, and pacing to produce content that captures attention and tells compelling stories.",
    skills: ["Video Editing & Post-Production", "Cinematography & Shooting", "Color Grading & Sound Design", "Reels, Shorts & YouTube Content", "Scriptwriting & Storyboarding"],
    quest: "Capture the moments — edit the stories that go viral.",
  },
  {
    key: "events", name: "EVENTS", stage: "BOSS ARENA", glyph: "⚔", color: "#ff2bd1", cls: "WARRIOR",
    desc: "The Boss Arena is where unforgettable experiences are forged. Warriors of this guild ideate, curate, and execute the club's marquee events — coding competitions, tech talks, gaming nights, and inter-college showdowns. You'll brainstorm wild concepts, design event formats, build engagement mechanics, and ensure every participant walks away with a story. If you live for the thrill of a packed arena, this is your battleground.",
    skills: ["Event Ideation & Curation", "Competition Design", "Participant Engagement", "Speaker & Guest Coordination", "Community Building"],
    quest: "Create legendary events that people talk about for semesters.",
  },
  {
    key: "pr", name: "PR/OUTREACH", stage: "BROADCAST TOWER", glyph: "➤", color: "#00f0ff", cls: "BARD",
    desc: "Bards of the Broadcast Tower amplify Technovation's voice across every channel. From Instagram reels and LinkedIn posts to campus partnerships, email campaigns, and sponsor outreach — this guild builds the club's public presence. You'll craft narratives, negotiate collaborations, manage social media calendars, analyze engagement metrics, and connect the club with the broader tech ecosystem.",
    skills: ["Social Media Strategy", "Content Marketing", "Sponsorship & Partnerships", "Email Campaigns", "Analytics & Growth Hacking"],
    quest: "Broadcast the signal — make Technovation unmissable.",
  },
  {
    key: "content", name: "CONTENT", stage: "LORE KEEPER", glyph: "✎", color: "#ff2bd1", cls: "SCRIBE",
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
  /** Plain status chip ("DONE" / "IN PROGRESS" / "YOUR TURN") — replaces the
   *  old fake relative timestamps, which contradicted each other. */
  status: string;
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

/**
 * PIN field with a show/hide toggle.
 *
 * Typing a PIN blind on a phone is easy to get wrong, and a wrong PIN costs an
 * attempt against the 5-try lockout — so letting people check what they typed
 * prevents real lockouts. Starts hidden; the toggle is per-field.
 */
function PinField({
  value,
  onChange,
  placeholder,
  style,
  maxLength = 6,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  style?: CSSProperties;
  maxLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type={show ? "text" : "password"}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        placeholder={placeholder}
        style={{ ...style, paddingRight: "44px" }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide PIN" : "Show PIN"}
        title={show ? "Hide PIN" : "Show PIN"}
        style={{
          position: "absolute",
          right: "6px",
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "6px",
          fontSize: "15px",
          lineHeight: 1,
          opacity: show ? 1 : 0.65,
        }}
      >
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );
}

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
// Neon palette — each user gets a unique two-tone scheme derived from their seed.
const AVATAR_PALETTE = [
  "#00f0ff", "#ff2bd1", "#ffb800", "#ffb800", "#ffb800",
  "#ff2bd1", "#ff2bd1", "#ffb800", "#7de8ff", "#ff5edb", "#00f0ff", "#f0f0f0",
];

function avatarColors(seed: string): { primary: string; secondary: string } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const h0 = h >>> 0;
  const primary = AVATAR_PALETTE[h0 % AVATAR_PALETTE.length];
  let secondary = AVATAR_PALETTE[Math.floor(h0 / AVATAR_PALETTE.length) % AVATAR_PALETTE.length];
  if (secondary === primary) secondary = AVATAR_PALETTE[(h0 + 5) % AVATAR_PALETTE.length];
  return { primary, secondary };
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: string,
  cell: number,
  _color?: string // ignored — colours are now derived per-user from the seed
) {
  const { primary, secondary } = avatarColors(seed);
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
      const v = rng();
      if (v < 0.5) {
        // ~1 in 4 lit cells uses the accent colour for a two-tone look.
        ctx.fillStyle = v < 0.12 ? secondary : primary;
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
  // ---- COMMS CHANNEL ----------------------------------------------------
  // Derived from the applicant's real state rather than kept as an append-only
  // log. A stored log drifts: it kept showing "SCREENING IN PROGRESS" while the
  // progress bar already read TASK ROUND. Deriving it means the feed can never
  // contradict the current stage. Ordered newest-first, so whatever needs the
  // applicant's attention is always the first thing they read.
  const comms = useMemo<Comm[]>(() => {
    const DONE = { icon: "✓", color: "#ffb800", status: "DONE" };
    const NOW = { icon: "◉", color: "#00f0ff", status: "IN PROGRESS" };
    const ACT = { icon: "⚔", color: "#00f0ff", status: "YOUR TURN" };

    const reg: Comm = {
      id: "reg",
      ...DONE,
      title: "REGISTRATION CONFIRMED",
      body: `You're registered as Player #${String(playerNo || 1).padStart(4, "0")}. Your details and answers are saved.`,
    };

    // Journey stopped — show only what's true, never a "in progress" message
    // alongside a closed application.
    if (rejected) {
      const reachedLbl = STAGES[Math.min(Math.max(rejectedAtStage, 0), 4)]?.label || "SCREENING";
      const fb = (rejectionFeedback || "").trim();
      return [
        {
          id: "closed",
          icon: "✕",
          color: "#ff2bd1",
          status: "CLOSED",
          title: "APPLICATION CLOSED",
          body:
            `Your application isn't moving forward this season. You reached the ${reachedLbl} stage.` +
            (fb ? ` Feedback from the team: "${fb}"` : "") +
            " Thanks for applying — you're welcome to try again next season.",
        },
        reg,
      ];
    }

    const doms = selectedClasses
      .map((k) => DOMAINS.find((d) => d.key === k))
      .filter((d): d is (typeof DOMAINS)[number] => !!d);
    const submitted = doms.filter((d) => !!taskDone[d.key]);
    const pending = doms.filter((d) => !taskDone[d.key]);
    const names = (list: typeof doms) => list.map((d) => d.name).join(" and ");

    // Oldest first while building; reversed at the end.
    const log: Comm[] = [reg];

    if (stageIdx >= 2) {
      log.push({
        id: "screen",
        ...DONE,
        title: "SCREENING CLEARED",
        body: "Your application was accepted. You've moved on to the task round.",
      });
    } else {
      log.push({
        id: "screen",
        ...NOW,
        title: "SCREENING IN PROGRESS",
        body: "We're reviewing your application and answers. Nothing for you to do right now — this feed updates as soon as there's a decision.",
      });
    }

    if (stageIdx === 2) {
      // Submissions go through a Google Form now, so the site can't tell whether
      // a given applicant has submitted — don't claim to know either way.
      log.push({
        id: "task",
        ...ACT,
        title: "SUBMIT YOUR TASK",
        body: `Open the task submission form from the Quest Log on the left${
          doms.length ? ` and complete the task for ${names(doms)}` : ""
        }. Submit it before ${TASK_DEADLINE} — this is compulsory, and late submissions won't be accepted. Use the same college email you registered with. There's also a short website feedback form in the Quest Log.`,
      });
    } else if (stageIdx > 2) {
      log.push({
        id: "task",
        ...DONE,
        title: "TASK ROUND COMPLETE",
        body: "Your task round is done — the team has moved you forward.",
      });
    }

    if (stageIdx === 3) {
      log.push({
        id: "interview",
        ...NOW,
        title: "INTERVIEW ROUND",
        body: "You cleared the task round. We'll reach out on your registered email and phone to set up a short interview, so keep an eye on your inbox.",
      });
    } else if (stageIdx >= 4) {
      log.push({
        id: "interview",
        ...DONE,
        title: "INTERVIEW CLEARED",
        body: "You've cleared the interview round.",
      });
      log.push({
        id: "selected",
        icon: "★",
        color: "#ffb800",
        status: "SELECTED",
        title: "YOU'RE IN — WELCOME TO TECHNOVATION",
        body: "You've been selected. Onboarding details are on their way to your registered email.",
      });
    }

    return log.reverse();
  }, [stageIdx, taskDone, selectedClasses, rejected, rejectedAtStage, rejectionFeedback, playerNo]);

  // Returning Candidate Login state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPin, setLoginPin] = useState("");

  // Forgot PIN state
  const [forgotPinMode, setForgotPinMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetNewPin, setResetNewPin] = useState("");
  const [resetConfirmPin, setResetConfirmPin] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetStep, setResetStep] = useState<"verify" | "sent" | "newpin">("verify");
  const [resetErr, setResetErr] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [enterBusy, setEnterBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  // Whether the drive is accepting new applications. Defaults to open so a
  // slow first response never flashes "closed" at a genuine applicant.
  const [regOpen, setRegOpen] = useState(true);
  // A remembered session shows a one-tap "Resume" on the landing page
  // (instead of force-navigating there).
  const [resumeInfo, setResumeInfo] = useState<{ email: string; name: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Smoothed scroll progress: the raw scrollTop is chunky (wheel/trackpad
  // deliver large discrete deltas), so we ease the rendered value toward it.
  const progTarget = useRef(0);
  const progCur = useRef(0);
  const progRaf = useRef<number | null>(null);
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
  const avatarSeed = () =>
    (form.name || "PLAYER1") + "|" + (form.email || "") + "|" + selectedClasses.join(",");
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

  // (The live registration counter was removed from the UI, so there is no
  //  longer a poll here. app_stats() still exists server-side if it returns.)

  // Ease the rendered progress toward the latest scroll position. Runs only
  // while there's distance left to cover, then parks itself.
  const stepProgress = useCallback(() => {
    const target = progTarget.current;
    const delta = target - progCur.current;
    if (Math.abs(delta) < 0.0006) {
      progCur.current = target;
      setProgress((p) => (Math.abs(p - target) < 0.0005 ? p : target));
      progRaf.current = null;
      return;
    }
    progCur.current += delta * 0.16; // ~critically damped glide
    // Quantise before committing to state. This whole page re-renders on every
    // progress change, so pushing raw float deltas meant a full re-render per
    // frame while scrolling — the main source of stutter on phones. 400 steps
    // is finer than the eye can resolve here but cuts the render count sharply.
    const q = Math.round(progCur.current * 400) / 400;
    setProgress((p) => (p === q ? p : q));
    progRaf.current = requestAnimationFrame(stepProgress);
  }, []);

  useEffect(() => {
    return () => {
      if (progRaf.current !== null) cancelAnimationFrame(progRaf.current);
    };
  }, []);

  // reset scroll on page change
  useEffect(() => {
    if (progRaf.current !== null) {
      cancelAnimationFrame(progRaf.current);
      progRaf.current = null;
    }
    progTarget.current = 0;
    progCur.current = 0;
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
      ctx.fillStyle = "#ffb800";
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
      fld(118, "PLAYER NAME", name, "#ffb800");
      fld(164, "CLASS", clsName, "#ff2bd1");
      fld(210, "HOME STAGE", cls, accent);
      fld(256, "COMMS", (form.email || "—").toUpperCase(), "#ffffff");
      fld(302, "BRANCH", (form.branch || "—").toUpperCase(), "#ffb800");
      ctx.fillStyle = "#7de8ff";
      ctx.font = `9px ${PS}`;
      ctx.fillText("AVATAR", px + 44, 54);
      drawAvatar(ctx, px + 40, 76, avatarSeed(), 18, accent);
      ctx.fillStyle = "#ffb800";
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
    // Returning to the arcade floor re-pulls everything from the server, so the
    // site the applicant comes back to is current rather than a stale snapshot
    // from whenever they logged in.
    if (p === "floor" || p === "hq") void refreshMe();
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
  const saveSession = (email: string, pinValue?: string) => {
    try {
      localStorage.setItem("tech_session", email);
      // The PIN is kept in sessionStorage (this tab only, gone when the tab
      // closes, wiped by logout). Every server call is PIN-gated, so without it
      // a page refresh left the applicant unable to submit a task or pull a
      // fresh stage — the app had their email but no way to authenticate.
      if (pinValue) sessionStorage.setItem("tech_pin", pinValue);
    } catch { /* ignore */ }
  };

  const clearSession = () => {
    try {
      localStorage.removeItem("tech_session");
      sessionStorage.removeItem("tech_pin");
    } catch { /* ignore */ }
  };

  /**
   * Wipe every applicant key from both stores.
   *
   * Prefix scan rather than a fixed list, so a key added later is covered
   * automatically instead of quietly becoming a leak. `tech_sheet_webhook` is
   * kept: it's the ADMIN's Google Sheets config on their own machine, not this
   * applicant's data. Shared by logout and by the fresh-tab reset.
   */
  const clearAppStorage = useCallback(() => {
    try {
      const KEEP = new Set(["tech_sheet_webhook"]);
      for (const store of [window.localStorage, window.sessionStorage]) {
        const doomed: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && k.startsWith("tech_") && !KEEP.has(k)) doomed.push(k);
        }
        doomed.forEach((k) => store.removeItem(k));
      }
    } catch { /* storage may be unavailable in private mode */ }
  }, []);

  /**
   * Pull this applicant's current record from the server and re-hydrate the
   * whole UI from it — stage, task unlocks, submissions, rejection state.
   *
   * The dashboard used to "sync" by re-reading localStorage, but nothing writes
   * the server's state there any more (the old whole-table mirror was removed
   * for security). So an admin promotion never reached the applicant: their
   * stage bar, quest log and comms stayed frozen until they logged out and in.
   */
  const refreshMe = useCallback(async (): Promise<boolean> => {
    let email = "";
    let livePin = "";
    try {
      email = localStorage.getItem("tech_session") || "";
      livePin = sessionStorage.getItem("tech_pin") || "";
    } catch { /* ignore */ }
    if (!email || !livePin) return false;

    try {
      const row = await apiLogin(email, livePin);
      if (!row) return false;
      const cand = candFromRow(row);
      try {
        localStorage.setItem("tech_candidates_admin", JSON.stringify([cand]));
      } catch { /* ignore */ }
      loadCandidateByEmail(email);
      return true;
    } catch {
      return false; // offline or rate-limited — keep showing what we have
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Full sign-out: leaves the browser exactly as a first-time visitor's.
   *
   * This used to clear only `tech_session`, so the applicant's cached record —
   * name, phone, admission number, all 7 answers — stayed in localStorage after
   * logging out. On a shared lab or library machine the next person could still
   * find it, and the app would treat the device as "already applied".
   */
  const handleLogout = async () => {
    // End any Supabase Auth session (created by a Forgot PIN flow).
    await apiSignOut();

    clearAppStorage();

    // Hard navigation to a clean URL. A state reset could leave something
    // behind in a ref or a pending timer; a fresh document cannot.
    window.location.replace("/");
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

  // ---- FRESH-TAB RESET -------------------------------------------------
  // A login is scoped to the browser TAB. sessionStorage survives a refresh but
  // not a tab close, so:
  //   • same tab + refresh      -> marker present  -> session kept, drafts kept
  //   • new tab / reopened app  -> marker missing  -> everything wiped, fresh site
  //   • email on file but no PIN in this tab -> stale login -> wiped
  // This is what stops a shared lab machine handing the next person a logged-in
  // session, without punishing someone who accidentally hits refresh mid-form.
  //
  // Declared BEFORE the session-restore effect below so it runs first — the
  // restore then reads already-cleared storage and shows a first-time site.
  useEffect(() => {
    try {
      const sameTab = sessionStorage.getItem("tech_tab") === "1";
      const staleLogin =
        !!localStorage.getItem("tech_session") && !sessionStorage.getItem("tech_pin");

      if (!sameTab || staleLogin) {
        clearAppStorage();
        setResumeInfo(null);
        setPin("");
      }
      sessionStorage.setItem("tech_tab", "1");
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Is registration open? Re-checked on focus so a pause takes effect for
  // someone already sitting on the page.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const open = await apiRegistrationsOpen();
      if (alive) setRegOpen(open);
    };
    void check();
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.removeEventListener("focus", onFocus); };
  }, []);

  // Remember a prior session — but DON'T hijack the landing page. Pre-load the
  // candidate's data and offer a one-tap "Resume" on the floor instead.
  useEffect(() => {
    try {
      // Restore the PIN into state too, so task submission still works after a
      // refresh (app_save is PIN-gated and would otherwise fail with AUTH_FAILED).
      const savedPin = sessionStorage.getItem("tech_pin");
      if (savedPin) setPin(savedPin);

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
  //
  // The ?step=create parameter is CONSUMED ONCE and then stripped from the URL.
  // Without that, the param lingered in the address bar for the whole session
  // (this is a state-driven SPA — the URL never changes again), so pressing
  // refresh anywhere, even from HQ, threw the applicant back to a blank
  // registration form. Stripping it means a refresh lands on the arcade floor,
  // where "RESUME AS <name>" takes them back to their dashboard.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("step") !== "create") return;

      // Clear it immediately so a later refresh can't replay this.
      window.history.replaceState(null, "", window.location.pathname);

      // Already registered? Never send them back into the form — their
      // application is final. Leave them on the floor to resume or log in.
      const savedEmail = localStorage.getItem("tech_session");
      if (savedEmail) {
        const raw = localStorage.getItem("tech_candidates_admin");
        const list = raw ? JSON.parse(raw) : [];
        const m = list.find((c: any) => c.email?.toLowerCase() === savedEmail.toLowerCase());
        if (m && m.pinHash) return;
      }

      const hook = sessionStorage.getItem("tech_hook");
      if (hook) {
        const h = JSON.parse(hook);
        setForm((s) => ({ ...s, name: h.name ?? s.name, email: h.email ?? s.email }));
      }
      setPage("create");
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

    // Goes to the SERVER now, not to localStorage. 20s rather than the old
    // 2.5s because this is a real network round-trip; focus still forces an
    // immediate pull, so switching back to the tab feels instant.
    const sync = () => { void refreshMe(); };

    sync();
    const iv = setInterval(sync, 20000);
    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, form.email, refreshMe]);

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm((s) => ({ ...s, [k]: v }));
  };

  /**
   * INSERT COIN — the primary landing action.
   *
   * No email has been typed at this point, so there's nothing to look up on the
   * server. What we CAN tell is whether this browser already has an applicant
   * session: if so, starting a fresh application is never what they want. It
   * used to push straight to /process, which walked a registered applicant
   * through the briefing and into a blank, locked form.
   */
  const onInsertCoin = () => {
    if (!regOpen) return;   // server enforces it too; this just avoids a dead end
    if (resumeInfo) {
      goTo("hq");
      return;
    }
    router.push("/process");
  };

  const onPressStart = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("ENTER NAME & EMAIL TO PRESS START");
      return;
    }
    if (!form.email.trim().toLowerCase().endsWith("@abes.ac.in")) {
      setError("PLEASE USE YOUR COLLEGE EMAIL (@ABES.AC.IN)");
      return;
    }
    if (startBusy) return;

    // Ask the SERVER whether this email has already applied, before sending
    // anyone into the form. The check used to read localStorage, which is empty
    // on any other device — so a returning applicant re-typed their whole
    // application and was only turned away at the final step.
    setStartBusy(true);
    try {
      // === true only: if the lookup failed we let them through rather than
      // wrongly turning away a new applicant.
      if ((await apiIsRegistered(form.email.trim())) === true) {
        setLoginEmail(form.email.trim());
        setLoginErr("YOU'VE ALREADY APPLIED WITH THIS EMAIL — ENTER YOUR PIN TO CONTINUE.");
        setShowLoginModal(true);
        setError("");
        return;
      }
    } finally {
      setStartBusy(false);
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
  // Jump past the reveal to the fully-open cabinet (measured against the real
  // scrollable distance, so it stays correct if the track height changes).
  const onScrollDomains = () => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const max = Math.max(1, sc.scrollHeight - sc.clientHeight);
    sc.scrollTo({ top: max * 0.72, behavior: "smooth" });
  };
  const onSaveData = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.branch.trim() || !form.section.trim() || !form.phone.trim() || !form.college.trim()) {
      setError("!! ALL PLAYER FILE FIELDS ARE REQUIRED");
      return;
    }
    if (!form.email.trim().toLowerCase().endsWith("@abes.ac.in")) {
      setError("!! PLEASE USE YOUR OFFICIAL COLLEGE EMAIL (@ABES.AC.IN)");
      return;
    }
    if (!/^\d{10}$/.test(form.phone.trim())) {
      setError("!! PHONE NUMBER MUST BE EXACTLY 10 DIGITS");
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

    // LOCAL DRAFT ONLY — intentionally does not touch the server.
    // The row can't be created yet: app_register writes the record and its PIN
    // together, and the PIN is collected on the next screen. onEnterHQ builds
    // its payload from React state (form / selectedClasses), not from this
    // draft, so nothing is lost if localStorage is empty on another device.
    try {
      const existingRaw = localStorage.getItem("tech_candidates_admin");
      const list = existingRaw ? JSON.parse(existingRaw) : [];
      const emailKey = form.email.trim().toLowerCase();
      const existing = list.find((c: any) => c.email.toLowerCase() === emailKey);

      const answers = {
        q1: form.q1.trim(), q2: form.q2.trim(), q3: form.q3.trim(),
        q4: form.q4.trim(), q5: form.q5.trim(), q6: form.q6.trim(), q7: form.q7.trim(),
      };

      const alreadyRegistered =
        (existing && existing.pinHash) || (await apiIsRegistered(form.email.trim())) === true;

      if (alreadyRegistered) {
        // An activated account with NO answers on file is someone finishing an
        // application that was started for them (or left incomplete). Let them
        // save through app_save, which permits answers while stage_idx <= 1,
        // rather than bouncing them to a login they've already done.
        const storedAnswers = (existing && existing.answers) || {};
        const hasAnswers = ["q1","q2","q3","q4","q5","q6","q7"]
          .some((k) => String((storedAnswers as any)[k] || "").trim() !== "");
        let livePin = pin;
        try { livePin = livePin || sessionStorage.getItem("tech_pin") || ""; } catch { /* ignore */ }

        if (!hasAnswers && livePin) {
          setEnterBusy(true);
          try {
            // Send the whole form, not just the answers. Sending answers alone
            // meant the domain picks, branch and section they had just typed
            // were dropped on the floor — the account ended up submitted but
            // with no domains against it.
            const row = await apiSave(form.email.trim(), livePin, {
              name: form.name.trim(),
              branch: form.branch.trim(),
              section: form.section.trim(),
              phone: form.phone.trim(),
              college_id: form.college.trim(),
              domains: selectedClasses,
              answers,
            });
            const cand = candFromRow(row);
            try {
              localStorage.setItem("tech_candidates_admin", JSON.stringify([cand]));
            } catch { /* ignore */ }
            // Adopt the server's identity for this row. Without this the screen
            // kept the placeholder number invented locally further down
            // (1000 + list.length + 1), so the arcade ticket printed #1002
            // instead of the real player number the database had assigned.
            setPlayerNo(cand.playerNo || 1001);
            setStageIdx(cand.stageIdx || 1);
            setError("");
            goTo("hq");
          } catch {
            setError("COULDN'T SAVE YOUR ANSWERS. CHECK YOUR CONNECTION AND TRY AGAIN.");
          } finally {
            setEnterBusy(false);
          }
          return;
        }

        // Genuinely a repeat application → send them to log in.
        setLoginEmail(form.email.trim());
        setLoginErr("YOU'VE ALREADY APPLIED WITH THIS EMAIL — ENTER YOUR PIN TO LOG IN.");
        setShowLoginModal(true);
        return;
      }

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
      }
    } catch {
      setPlayerNo(1001);
    }

    setError("");
    setPage("pass");
  };

  // Creates the applicant's row ON THE SERVER. This is the only place it is
  // created, because the row and its PIN must be written together.
  //
  // Previously this only wrote to localStorage and relied on the old cloud-sync
  // to mirror it up. That mirror was removed with the security work, so
  // registrations stopped reaching Supabase entirely and those applicants could
  // never log in again — their account existed in one browser and nowhere else.
  const onEnterHQ = async () => {
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN MUST BE 4-6 DIGITS");
      return;
    }
    if (enterBusy) return;

    setEnterBusy(true);
    setError("");
    const email = form.email.trim();
    try {
      const row = await apiRegister(email, pin, {
        app_id: `cand-${Date.now()}`,
        name: form.name.trim(),
        branch: form.branch.trim(),
        section: form.section.trim(),
        phone: form.phone.trim(),
        college_id: form.college.trim(),
        domains: selectedClasses,
        answers: {
          q1: form.q1.trim(), q2: form.q2.trim(), q3: form.q3.trim(),
          q4: form.q4.trim(), q5: form.q5.trim(), q6: form.q6.trim(),
          q7: form.q7.trim(),
        },
      });

      // The server owns the player number, so two devices can't be handed the same one.
      const cand = candFromRow(row);
      setPlayerNo(cand.playerNo || 1001);
      setStageIdx(cand.stageIdx || 1);
      try {
        localStorage.setItem("tech_candidates_admin", JSON.stringify([cand]));
      } catch { /* ignore */ }

      saveSession(email, pin);
      goTo("hq");
    } catch (err) {
      const code = (err as ApiError)?.code || "ERROR";
      if (code === "ALREADY_REGISTERED") {
        setLoginEmail(email);
        setLoginErr("YOU'VE ALREADY APPLIED WITH THIS EMAIL — ENTER YOUR PIN TO LOG IN.");
        setShowLoginModal(true);
      } else if (code === "REGISTRATIONS_CLOSED") {
        setRegOpen(false);
        setError("REGISTRATIONS ARE CLOSED — NEW APPLICATIONS ARE NO LONGER BEING ACCEPTED.");
      } else if (code === "BAD_EMAIL_DOMAIN") {
        setError("PLEASE USE YOUR COLLEGE EMAIL (@ABES.AC.IN)");
      } else if (code === "BAD_PIN_FORMAT") {
        setError("PIN MUST BE 4-6 DIGITS");
      } else if (code === "OFFLINE") {
        setError("CANNOT REACH THE SERVER — CHECK YOUR CONNECTION AND RETRY");
      } else {
        setError("COULD NOT COMPLETE REGISTRATION. PLEASE TRY AGAIN.");
      }
    } finally {
      setEnterBusy(false);
    }
  };

  // Submit the task for one specific department. Stage is NOT self-advanced —
  // only the Guild Council admin promotes candidates between rounds.
  // NOTE: submitTaskFor() lived here. Task submission moved to a Google Form,
  // so the in-app link fields — and the app_save call behind them — are gone.
  // app_save still exists server-side if in-app submission ever returns.


  const handleCandidateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPin.trim()) {
      setLoginErr("ENTER BOTH REGISTERED EMAIL & PIN");
      return;
    }
    if (!loginEmail.trim().toLowerCase().endsWith("@abes.ac.in")) {
      setLoginErr("PLEASE ENTER YOUR COLLEGE EMAIL (@ABES.AC.IN)");
      return;
    }

    // The PIN is checked in Postgres, not here. A client-side comparison was
    // meaningless: the hash it compared against came from a table any visitor
    // could read, and the check itself could be skipped from the console.
    setLoginBusy(true);
    setLoginErr("");
    try {
      const row = await apiLogin(loginEmail.trim(), loginPin);
      if (!row) {
        setLoginErr("INCORRECT EMAIL OR PIN. TRY AGAIN OR USE FORGOT PIN.");
        return;
      }

      // Cache only this applicant's own record for the session.
      try {
        localStorage.setItem("tech_candidates_admin", JSON.stringify([candFromRow(row)]));
      } catch { /* ignore */ }

      loadCandidateByEmail(loginEmail.trim());
      setPin(loginPin);
      setShowLoginModal(false);
      setLoginErr("");
      saveSession(loginEmail.trim(), loginPin);

      // An account with no answers on file hasn't really finished applying —
      // send them to the form to complete it rather than to a dashboard that
      // has nothing to show.
      const a = (row as any).answers || {};
      const hasAnswers = ["q1","q2","q3","q4","q5","q6","q7"]
        .some((k) => String(a[k] || "").trim() !== "");
      goTo(hasAnswers ? "hq" : "create");
    } catch (err) {
      const code = (err as ApiError)?.code || "ERROR";
      if (code === "RATE_LIMITED") {
        const mins = Math.ceil(((err as ApiError).retryIn || 900) / 60);
        setLoginErr(`TOO MANY FAILED ATTEMPTS. TRY AGAIN IN ${mins} MIN.`);
      } else if (code === "OFFLINE") {
        setLoginErr("CANNOT REACH THE SERVER RIGHT NOW.");
      } else {
        setLoginErr("SYSTEM ERROR ACCESSING PLAYER FILE");
      }
    } finally {
      setLoginBusy(false);
    }
  };

  // ---- PIN RESET (emailed magic link) ----------------------------------
  // This used to accept email + last 4 digits of phone. Both were readable by
  // anyone via the public table, so any applicant could take over another
  // account. Recovery now requires opening a link sent to the college mailbox.
  //
  // A link rather than a typed code, deliberately: Supabase's built-in mailer
  // can't have its templates edited, so it can only send {{ .ConfirmationURL }}.
  // Using the link means no SMTP provider is needed at all.

  /** Step 1 — email the reset link. */
  const handleForgotPinVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = resetEmail.trim().toLowerCase();
    if (!em) {
      setResetErr("ENTER YOUR REGISTERED COLLEGE EMAIL");
      return;
    }
    if (!em.endsWith("@abes.ac.in")) {
      setResetErr("PLEASE ENTER YOUR COLLEGE EMAIL (@ABES.AC.IN)");
      return;
    }
    setResetBusy(true);
    setResetErr("");
    try {
      // Check the application exists BEFORE emailing anything. Without this,
      // someone who abandoned registration half-way gets a link, clicks it,
      // types a new PIN twice — and only then hits "no applicant registered
      // with that email", because there was never a row to reset.
      // === false only. A failed lookup returns null, and accusing a real
      // applicant of never registering is far worse than sending them a link
      // that harmlessly fails at the last step.
      if ((await apiIsRegistered(em)) === false) {
        setResetErr(
          "NO COMPLETED APPLICATION FOR THAT EMAIL. CHECK THE SPELLING — IT MUST MATCH EXACTLY WHAT YOU REGISTERED WITH."
        );
        return;
      }
      await sendResetLink(em);
      setResetStep("sent");
      setResetSuccess("");
    } catch (err) {
      const e = err as ApiError;
      const detail = (e?.detail || "").toLowerCase();
      // Distinguish the real causes instead of showing one catch-all message —
      // "check the address" sent people hunting for a typo when the actual
      // problem was SMTP or a provider rate limit.
      if (e?.code === "RATE_LIMITED" || detail.includes("rate limit") || detail.includes("too many")) {
        setResetErr("TOO MANY REQUESTS — WAIT A FEW MINUTES AND TRY AGAIN.");
      } else if (detail.includes("smtp") || detail.includes("sending") || detail.includes("email")) {
        setResetErr("EMAIL SERVICE ISN'T SET UP YET. PLEASE CONTACT THE TECHNOVATION TEAM.");
      } else if (e?.code === "OFFLINE") {
        setResetErr("CANNOT REACH THE SERVER — CHECK YOUR CONNECTION.");
      } else {
        setResetErr("COULDN'T SEND THE LINK. PLEASE TRY AGAIN IN A MOMENT.");
      }
    } finally {
      setResetBusy(false);
    }
  };

  /**
   * Step 2 — the applicant came back by clicking the emailed link.
   *
   * The Supabase client parses the tokens out of the URL as it loads, so a
   * session existing here is proof this browser opened that mailbox. When we
   * see one, jump straight to "set a new PIN".
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      const verified = await getVerifiedEmail();
      if (!alive || !verified) return;

      // Strip the auth tokens from the address bar so they aren't left sitting
      // in history or copied into a shared link.
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch { /* ignore */ }

      setResetEmail(verified);
      setForgotPinMode(true);
      setShowLoginModal(true);
      setResetStep("newpin");
      setResetErr("");
      setResetSuccess("");
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Step 3 — set the new PIN. The server identifies the account from the
   *  verified session, not from anything this form sends. */
  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(resetNewPin)) {
      setResetErr("NEW PIN MUST BE 4-6 DIGITS");
      return;
    }
    if (resetNewPin !== resetConfirmPin) {
      setResetErr("PINs DO NOT MATCH. RE-ENTER.");
      return;
    }

    setResetBusy(true);
    try {
      await resetPin(resetNewPin);
      setResetErr("");
      setResetSuccess("PIN RESET SUCCESSFUL! YOU CAN NOW LOG IN.");
      setTimeout(() => {
        setForgotPinMode(false);
        setResetStep("verify");
        setResetEmail("");
        setResetNewPin("");
        setResetConfirmPin("");
        setResetSuccess("");
        setResetErr("");
      }, 2500);
    } catch (err) {
      const code = (err as ApiError)?.code || "ERROR";
      setResetErr(
        code === "NOT_VERIFIED"
          ? "VERIFICATION EXPIRED. START THE RESET AGAIN."
          : code === "NO_SUCH_APPLICANT"
            ? "THIS EMAIL HAS NO COMPLETED APPLICATION — YOUR REGISTRATION WASN'T FINISHED. PLEASE REGISTER AGAIN FROM THE HOME PAGE."
            : "COULD NOT RESET THE PIN. TRY AGAIN."
      );
    } finally {
      setResetBusy(false);
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
    window.open("https://chat.whatsapp.com/Cx4pjOV9cBQGWUNBuUeEKn?mode=gi_t", "_blank");
  };
  const onShareIG = () => window.open("https://www.instagram.com/abes_technovation/", "_blank");

  // ---- computed reveal values (floor) ----
  const p = progress;
  // Reveal responds almost immediately and finishes in the first half of the
  // track, so a single trackpad swipe visibly moves the cabinet forward.
  const reveal = clamp((p - 0.03) / 0.44, 0, 1);
  const term = clamp((p - 0.16) / 0.2, 0, 1);
  const scan = SCANLINES;
  const tintMap: Record<string, string> = {
    blue: "rgba(0,240,255,.13)",
    green: "rgba(255,180,40,.12)",
    amber: "rgba(255,180,40,.13)",
  };
  const tintColor = tintMap[SCREEN_TINT];

  // ---- shared style objects ----
  const fieldStyle: CSSProperties = {
    width: "100%",
    background: "#050a10",
    border: "2px solid #3a3410",
    borderRadius: "5px",
    color: "#ffb800",
    fontFamily: VT,
    fontSize: "clamp(16px,1.8vw,21px)",
    padding: "9px 12px",
    textShadow: "0 0 6px #ffb800",
    boxShadow: "inset 0 0 12px rgba(255,180,40,.1)",
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
    color: "#2a0e18",
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
    color: "#ff2bd1",
    textShadow: "0 0 8px #ff2bd1",
    minHeight: "10px",
    animation: error ? "blink 0.5s steps(1) 4" : "none",
  };

  // NOTE: pair this with className="gpu-layer" so the fixed overlay composites
  // on its own layer instead of repainting the full page on every scroll frame.
  const scanOverlay = (opacity: number): CSSProperties => ({
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    opacity,
    zIndex: 50,
    background: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.5) 2px 4px)",
    transform: "translateZ(0)",
    backfaceVisibility: "hidden",
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
  // NOTE: tagStyle() lived here, producing the ACTIVE / DONE / UPCOMING chips on
  // the quest cards. Those cards were replaced by the Google Form links, whose
  // REQUIRED chips are styled inline, so nothing called it any more.
  const taskCard = (locked: boolean): CSSProperties => ({
    padding: "14px",
    borderRadius: "8px",
    background: locked ? "rgba(255,255,255,.015)" : "rgba(255,180,40,.04)",
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
      flexDirection: "column",
      // Centred by `margin: auto` on the child rather than justifyContent.
      // justifyContent:center clips an overflowing column at BOTH ends, which
      // is what pushed the screen title out of frame; auto margins centre when
      // there is room and fall back to scrolling when there isn't.
      overflowY: "auto",
      padding: "clamp(20px,3.5vh,42px) 0 clamp(16px,2.5vh,26px)",
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
      transform: "translateZ(0)",
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
      border: "2px solid #3a3410",
      borderRadius: "4px",
      color: "#ffb800",
      fontFamily: VT,
      fontSize: "clamp(15px,1.8vw,21px)",
      padding: "7px 10px",
      textShadow: "0 0 6px #ffb800",
      boxShadow: "inset 0 0 12px rgba(255,180,40,.12)",
    };

    return (
      <div
        ref={scrollerRef}
        onScroll={(e) => {
          const sc = e.currentTarget;
          const max = Math.max(1, sc.scrollHeight - sc.clientHeight);
          progTarget.current = clamp(sc.scrollTop / max, 0, 1);
          if (progRaf.current === null) {
            progRaf.current = requestAnimationFrame(stepProgress);
          }
        }}
        className="screen-h" style={{ overflowY: "auto", overflowX: "hidden", background: "#04040a", position: "relative" }}
      >
        <div className="track-h" style={{ position: "relative" }}>
          {/* Candidate login / resume.

              Deliberately a SIBLING of the sticky CRT stage, not a child of it.
              Inside the stage it inherited the stage's stickiness and stayed
              glued to the viewport for the entire scroll — and position:fixed
              did exactly the same thing. Anchored to the scroll track instead,
              it sits at the top of the page and scrolls out of view like
              ordinary content: visible on the first screen only, which is
              where a returning applicant looks for it. */}
          <div style={{ position: "absolute", top: isMobile ? "42px" : "calc(6.5vh + 14px)", left: isMobile ? "10px" : "22px", zIndex: 30, textAlign: "left", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", maxWidth: isMobile ? "62vw" : undefined }}>
            {resumeInfo && (
              <button
                onClick={() => goTo("hq")}
                style={{ cursor: "pointer", fontFamily: PS, fontSize: isMobile ? "7px" : "9px", color: "#04040a", border: "none", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", borderRadius: "4px", padding: isMobile ? "5px 8px" : "6px 10px", boxShadow: "0 3px 0 #006074, 0 0 12px rgba(0,240,255,.5)" }}
              >
                {isMobile ? "▶ RESUME" : `▶ RESUME AS ${resumeInfo.name.toUpperCase().slice(0, 14)}`}
              </button>
            )}
            {/* Returning applicants land here, so this is a primary action —
              sized to be findable rather than tucked into the corner. */}
            <button
              onClick={() => { setLoginEmail(form.email.trim() || loginEmail); setShowLoginModal(true); }}
              style={{
                cursor: "pointer",
                fontFamily: PS,
                fontSize: isMobile ? "10px" : "13px",
                color: "#241a11",
                border: "none",
                background: "radial-gradient(circle at 40% 30%, #fff5b0, #ffb800 55%, #b8a200)",
                borderRadius: "6px",
                padding: isMobile ? "11px 16px" : "14px 24px",
                letterSpacing: "1px",
                boxShadow: "0 5px 0 #8a7900, 0 0 20px rgba(255,180,40,.55)",
                textShadow: "0 1px 0 rgba(255,255,255,.45)",
              }}
            >
              {isMobile ? "🔑 LOGIN" : "🔑 PLAYER LOGIN"}
            </button>
          </div>
          <div
            className="screen-h"
            style={{
              position: "sticky",
              top: 0,
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
                  <div style={{ textAlign: "center", padding: "0 6%", margin: "auto auto 0", width: "100%" }}>
                    <div style={{ fontFamily: PS, fontSize: "clamp(20px,4vw,52px)", color: "#00f0ff", textShadow: "2px 0 #ff2bd1, -2px 0 #ffb800, 0 0 24px rgba(0,240,255,.6)", letterSpacing: "3px", lineHeight: 1.3 }}>
                      {club()}
                    </div>
                    <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.4vw,16px)", color: "#ff2bd1", marginTop: "14px", letterSpacing: "4px", textShadow: "0 0 10px #ff2bd1" }}>
                      ◆ CLUB RECRUITMENT ARCADE ◆
                    </div>
                    <div style={{ textAlign: "left", display: "inline-block", marginTop: "34px", fontFamily: VT, fontSize: "clamp(16px,2.2vw,26px)", color: "#ffb800", lineHeight: 1.5, textShadow: "0 0 6px rgba(255,180,40,.6)" }}>
                      <div>&gt; SYSTEM INITIALIZING<span style={{ animation: "blink 1s steps(1) infinite" }}>...</span></div>
                      <div>&gt; CLUB NAME: <span style={{ color: "#ffb800" }}>{club()}</span></div>
                      <div>&gt; WELCOME, PLAYER 1.</div>
                      <div>&gt; 6 GUILD DOMAINS DETECTED.</div>
                      <div style={{ color: "#ffb800", textShadow: "0 0 12px #ffb800", animation: "blink 1.05s steps(1) infinite", marginTop: "6px" }}>
                        {regOpen ? "> INSERT COIN OR SCROLL TO START ▮" : "> REGISTRATIONS CLOSED ▮"}
                      </div>
                    </div>
                    {/* Primary landing action -> the Recruitment Quest briefing.
                        Replaced by a closed notice when the drive is paused. The
                        real block is server-side in app_register; this is just
                        what the applicant sees. */}
                    <div style={{ marginTop: "30px" }}>
                      {regOpen ? (
                        <ArcadeButton
                          onClick={onInsertCoin}
                          style={{ cursor: "pointer", fontFamily: PS, fontSize: "clamp(10px,1.5vw,15px)", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", border: "none", borderRadius: "8px", padding: "15px 24px", boxShadow: "0 8px 0 #006074, 0 0 28px rgba(0,240,255,.6), inset 0 3px 8px rgba(255,255,255,.5)", letterSpacing: "1px", textShadow: "0 1px 0 rgba(255,255,255,.4)" }}
                          activeStyle={{ transform: "translateY(6px)", boxShadow: "0 2px 0 #006074, 0 0 18px rgba(0,240,255,.5), inset 0 3px 8px rgba(255,255,255,.5)" }}
                        >
                          ▶ INSERT COIN · VIEW QUEST
                        </ArcadeButton>
                      ) : (
                        // Registrations being shut is already reported by the
                        // "> REGISTRATIONS CLOSED" terminal line above, so this
                        // slot goes to the live task deadline instead.
                        <div style={{ maxWidth: "540px", margin: "0 auto" }}>
                          <TaskCountdown size="large" heading="⏰ TASK SUBMISSION CLOSES IN" />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* In normal flow, not absolutely pinned.
                      Pinned to the bottom it sat on whatever the boot screen
                      rendered above it, and reserving space with padding only
                      worked while the content was short enough to fit — once
                      it wasn't, the content simply ran through the reserve.
                      As a flex item with `auto` margins it takes the leftover
                      space when there is any and stacks normally when there
                      isn't, so it can't be overlapped at any height. */}
                  <div style={{ margin: "clamp(14px,2.5vh,26px) auto auto", textAlign: "center", fontFamily: PS, fontSize: "10px", color: "#7de8ff", flexShrink: 0 }}>
                    <div>SCROLL TO BROWSE DOMAINS</div>
                    <div style={{ fontSize: "18px", animation: "scrollpulse 1.4s infinite", marginTop: "8px" }}>▼</div>
                  </div>
                </div>

                {/* DOMAIN GRID */}
                <div style={termStyle}>
                  <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.3vw,14px)", color: "#ffb800", textShadow: "0 0 8px #ffb800", letterSpacing: "1px", marginBottom: "2.5%" }}>
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
                <div className="crt-flicker gpu-layer" style={flickerStyle} />
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(115deg, rgba(255,255,255,.07) 0%, transparent 30%, transparent 70%, rgba(255,255,255,.03) 100%)", borderRadius: "22px" }} />
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "22px", boxShadow: "inset 0 0 90px 12px rgba(0,0,0,.85)" }} />
              </div>
            </div>

            {/* CONTROL PANEL */}
            <div style={panelStyle}>
              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(96deg, #1c150e 0 26px, #241a11 26px 52px)", boxShadow: "inset 0 8px 24px rgba(0,0,0,.6), inset 0 0 0 4px #0e0a06", borderTop: "4px solid #3a3410" }} />
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
                      <div style={{ position: "absolute", top: "-2%", left: "50%", transform: "translateX(-50%)", width: "56%", aspectRatio: "1", borderRadius: "50%", background: "radial-gradient(circle at 34% 28%, #ff9de3, #ff2bd1 45%, #8a0e6d 100%)", boxShadow: "0 0 18px rgba(255,43,209,.7), inset -6px -8px 14px rgba(0,0,0,.4), inset 6px 6px 12px rgba(255,255,255,.35)" }} />
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
                      style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#ffb800", background: "rgba(255,180,40,.1)", border: "1px solid #ffb80066", borderRadius: "4px", padding: "6px 10px", textShadow: "0 0 6px #ffb800" }}
                    >
                      RETURNING PLAYER LOGIN ▶
                    </button>
                  </div>
                </div>

                {/* PRESS START */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <ArcadeButton
                    onClick={() => { if (regOpen) void onPressStart(); }}
                    style={regOpen ? startBtnStyle : { ...startBtnStyle, filter: "grayscale(1)", opacity: 0.45, cursor: "not-allowed" }}
                    activeStyle={regOpen ? { transform: "translateY(9px)", boxShadow: "0 3px 0 #4d063d, 0 0 18px rgba(255,43,209,.6), inset 0 4px 8px rgba(255,255,255,.6)" } : {}}
                  >
                    {regOpen ? <>PRESS<br />START</> : <>REG<br />CLOSED</>}
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
  const renderCreate = () => {
    // Once a candidate has fully submitted (activated account with a PIN), their
    // application — including the 7 questionnaire answers — is locked read-only.
    // Locked once the account is activated AND answers actually exist.
    // Keying it on the PIN alone meant an account created without answers (e.g.
    // one added manually) opened a read-only, empty form the applicant could
    // never fill in. You can't lock answers that were never given.
    const answersLocked = (() => {
      try {
        const raw = localStorage.getItem("tech_candidates_admin");
        const list = raw ? JSON.parse(raw) : [];
        const m = list.find(
          (c: any) => c.email?.toLowerCase() === (form.email || "").trim().toLowerCase()
        );
        if (!m || !m.pinHash) return false;
        const a = m.answers || {};
        return ["q1", "q2", "q3", "q4", "q5", "q6", "q7"]
          .some((k) => String(a[k] || "").trim() !== "");
      } catch {
        return false;
      }
    })();

    // Locked, but their application isn't actually loaded into the form. That
    // produced the worst of both worlds: a blank form they couldn't type into.
    // Send them somewhere useful instead of rendering an empty read-only shell.
    const lockedButEmpty =
      answersLocked && !["q1", "q2", "q3", "q4", "q5", "q6", "q7"]
        .some((k) => (form[k as keyof typeof form] || "").toString().trim() !== "");

    if (lockedButEmpty) {
      return (
        <div className="screen-h" style={{ overflowY: "auto", overflowX: "hidden", background: "radial-gradient(140% 90% at 50% -10%, #141a30 0%, #0a0d1a 55%, #05060d 100%)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={scanOverlay(0.28)} />
          <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "560px", textAlign: "center", background: "rgba(10,14,26,.85)", border: "3px solid #ffb800", borderRadius: "14px", padding: "clamp(26px,4vw,40px)", boxShadow: "0 0 40px rgba(255,180,40,.2)" }}>
            <div style={{ fontFamily: PS, fontSize: "clamp(12px,1.8vw,17px)", color: "#ffb800", textShadow: "0 0 12px #ffb800" }}>
              🔒 YOU&apos;VE ALREADY APPLIED
            </div>
            <div style={{ fontFamily: VT, fontSize: "clamp(16px,2vw,20px)", color: "#a9c3d6", marginTop: "14px", lineHeight: 1.4 }}>
              This email already has a submitted application, so the form is closed.
              Log in with your PIN to see your answers and track your progress.
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "26px" }}>
              <ArcadeButton
                onClick={() => { setLoginEmail(form.email.trim()); setShowLoginModal(true); goTo("floor"); }}
                style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#241a11", background: "radial-gradient(circle at 40% 30%, #fff5b0, #ffb800 55%, #b8a200)", border: "none", borderRadius: "8px", padding: "14px 22px", boxShadow: "0 6px 0 #8a7900, 0 0 20px rgba(255,180,40,.5)" }}
                activeStyle={{ transform: "translateY(4px)", boxShadow: "0 2px 0 #8a7900" }}
              >
                🔑 LOG IN WITH PIN
              </ArcadeButton>
              <ArcadeButton
                onClick={() => goTo("floor")}
                style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#7de8ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "8px", padding: "14px 18px" }}
                activeStyle={{ transform: "translateY(2px)" }}
              >
                ◄ ARCADE FLOOR
              </ArcadeButton>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="screen-h" style={{ overflowY: "auto", overflowX: "hidden", background: "radial-gradient(140% 90% at 50% -10%, #141a30 0%, #0a0d1a 55%, #05060d 100%)", position: "relative" }}>
        <div style={scanOverlay(0.28)} />
        {answersLocked && (
          <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,180,40,.12)", borderBottom: "2px solid #ffb800", padding: "10px 16px", textAlign: "center", fontFamily: PS, fontSize: "clamp(8px,1.1vw,11px)", color: "#ffb800", textShadow: "0 0 8px #ffb800" }}>
            🔒 APPLICATION SUBMITTED — YOUR ANSWERS ARE LOCKED &amp; CANNOT BE CHANGED
          </div>
        )}
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "clamp(24px,4vw,56px) clamp(16px,4vw,40px) 80px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <ArcadeButton onClick={() => goTo("floor")} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#7de8ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "5px", padding: "9px 12px" }} activeStyle={{ transform: "translateY(2px)" }}>◄ ARCADE FLOOR</ArcadeButton>
            <div style={{ fontFamily: PS, fontSize: "9px", color: "#4a5a7a" }}>
              {answersLocked ? "VIEWING YOUR SUBMITTED APPLICATION · READ ONLY" : "STEP 2 / 4 · CHARACTER CREATION"}
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: "clamp(18px,3vw,34px)" }}>
            <div style={{ fontFamily: PS, fontSize: "clamp(18px,3.4vw,40px)", color: "#00f0ff", textShadow: "2px 0 #ff2bd1, -2px 0 #ffb800, 0 0 22px rgba(0,240,255,.5)", letterSpacing: "2px" }}>CHARACTER CREATION</div>
            <div style={{ fontFamily: VT, fontSize: "clamp(16px,2vw,24px)", color: "#ff2bd1", marginTop: "8px" }}>◆ forge your player file, pick your class, prove your worth ◆</div>
          </div>

          {/* Section 1 */}
          <div style={panelBox}>
            <div style={sectionHdr}><span style={{ color: "#00f0ff" }}>01</span> PLAYER FILE</div>
            <div className="player-form-grid">
              {([
                { l: "PLAYER NAME", k: "name", ph: "ENTER NAME" },
                { l: "COLLEGE EMAIL", k: "email", ph: "student@abes.ac.in" },
                { l: "BRANCH", k: "branch", ph: "E.G. COMPUTER SCIENCE" },
                { l: "SECTION", k: "section", ph: "E.G. CSE-14" },
                { l: "PHONE NUMBER", k: "phone", ph: "10-DIGIT MOBILE", numeric: true, maxLen: 10 },
                { l: "ADMISSION NUMBER", k: "college", ph: "E.G. 24B0101010" },
              ] as { l: string; k: keyof typeof form; ph: string; numeric?: boolean; maxLen?: number }[]).map((f) => (
                <div key={f.k}>
                  <div style={labelSm}>{f.l}</div>
                  <input
                    value={form[f.k]}
                    readOnly={answersLocked}
                    onChange={
                      f.numeric
                        ? (e) => setForm((s) => ({ ...s, [f.k]: e.target.value.replace(/\D/g, "").slice(0, f.maxLen || 10) }))
                        : setField(f.k)
                    }
                    placeholder={f.ph}
                    inputMode={f.numeric ? "numeric" : undefined}
                    maxLength={f.numeric ? f.maxLen : undefined}
                    style={{ ...fieldStyle, opacity: answersLocked ? 0.65 : 1, cursor: answersLocked ? "not-allowed" : "text" }}
                  />
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
                  <div key={d.key} style={{ ...badgeStyle(d), opacity: answersLocked && idx < 0 ? 0.5 : 1, pointerEvents: answersLocked ? "none" : "auto" }} onClick={() => { if (!answersLocked) toggleClass(d.key); }}>
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
                  <span style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#ffb800", animation: "blink 1s steps(1) infinite" }}>← PICK {2 - selectedClasses.length} MORE</span>
                )}
              </div>
            )}
          </div>

          {/* Section 3 */}
          <div style={panelBox}>
            <div style={sectionHdr}><span style={{ color: "#ffb800" }}>03</span> QUEST QUESTIONS <span style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#7de8ff", marginLeft: "8px" }}>— 7 GUILD TRIALS</span></div>
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
                <div key={q.k} style={{ background: "rgba(255,255,255,.015)", padding: "14px 16px", borderRadius: "8px", border: "1px solid #3a3410" }}>
                  <div style={{ ...labelSm, color: "#ffb800", marginBottom: "6px" }}>
                    {q.num}
                  </div>
                  <div style={{ fontFamily: VT, fontSize: "clamp(16px,1.9vw,22px)", color: "#ffb800", marginBottom: "10px", lineHeight: 1.35 }}>
                    "{q.q}"
                  </div>
                  <textarea value={form[q.k]} onChange={setField(q.k)} rows={3} readOnly={answersLocked} placeholder="TYPE YOUR ANSWER..." style={{ ...areaStyle, opacity: answersLocked ? 0.7 : 1, cursor: answersLocked ? "not-allowed" : "text" }} />
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...errBase, textAlign: "center", marginTop: "18px" }}>{error}</div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: "clamp(24px,4vw,40px)" }}>
            {answersLocked ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,20px)", color: "#ffb800", marginBottom: "12px" }}>
                  🔒 You&apos;ve already submitted. Your answers are final.
                </div>
                <ArcadeButton
                  onClick={() => goTo("hq")}
                  style={{ cursor: "pointer", fontFamily: PS, fontSize: "clamp(10px,1.3vw,14px)", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", border: "none", borderRadius: "8px", padding: "14px 22px", boxShadow: "0 6px 0 #006074, 0 0 20px rgba(0,240,255,.5)" }}
                  activeStyle={{ transform: "translateY(4px)", boxShadow: "0 2px 0 #006074" }}
                >
                  ▶ GO TO PLAYER HQ
                </ArcadeButton>
              </div>
            ) : (
              <ArcadeButton
                onClick={() => void onSaveData()}
                style={{ cursor: "pointer", fontFamily: PS, fontSize: "clamp(11px,1.5vw,16px)", color: "#241a11", background: "radial-gradient(circle at 40% 30%, #fff5b0, #ffb800 55%, #b8a200)", border: "none", borderRadius: "8px", padding: "clamp(16px,2.2vw,22px) clamp(28px,4vw,44px)", boxShadow: "0 10px 0 #3a3410, 0 0 34px rgba(255,180,40,.6), inset 0 3px 8px rgba(255,255,255,.6)", textShadow: "0 1px 0 rgba(255,255,255,.5)" }}
                activeStyle={{ transform: "translateY(7px)", boxShadow: "0 3px 0 #3a3410, 0 0 18px rgba(255,180,40,.5), inset 0 3px 8px rgba(255,255,255,.6)" }}
              >
                ▶ SAVE PLAYER DATA
              </ArcadeButton>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ================= PASS =================
  const renderPass = () => {
    // Already activated (a PIN is on file)? Then this is the "VIEW MY PASS"
    // route from HQ, not the end of registration — so the account-activation
    // panel has nothing left to do and is only confusing. Show the ticket alone.
    const alreadyActivated = (() => {
      try {
        const raw = localStorage.getItem("tech_candidates_admin");
        const list = raw ? JSON.parse(raw) : [];
        const m = list.find(
          (c: any) => c.email?.toLowerCase() === (form.email || "").trim().toLowerCase()
        );
        return !!(m && m.pinHash);
      } catch {
        return false;
      }
    })();

    return (
      <div className="screen-h" style={{ overflowY: "auto", overflowX: "hidden", background: "radial-gradient(130% 90% at 50% 0%, #101830 0%, #080a16 60%, #05060d 100%)", position: "relative" }}>
        <div style={scanOverlay(0.3)} />
        <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(16px,2.4vw,26px)", padding: "clamp(28px,5vw,60px) 20px 70px", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ fontFamily: PS, fontSize: "clamp(20px,3.6vw,48px)", animation: alreadyActivated ? "none" : "gameon 0.7s infinite", color: alreadyActivated ? "#00f0ff" : undefined, textShadow: alreadyActivated ? "0 0 16px #00f0ff" : undefined }}>
              {alreadyActivated ? "ARCADE PASS" : "LEVEL CLEAR!"}
            </div>
            {!alreadyActivated && (
              <div style={{ fontFamily: PS, fontSize: "clamp(14px,2vw,26px)", color: "#ffb800", textShadow: "0 0 14px #ffb800", animation: "spin1up 3s linear infinite" }}>1UP</div>
            )}
          </div>
          <div style={{ fontFamily: VT, fontSize: "clamp(16px,2vw,24px)", color: "#7de8ff", textAlign: "center" }}>
            {alreadyActivated ? "> YOUR PLAYER ID PASS" : "> PLAYER DATA SAVED · GENERATING ARCADE PASS..."}
          </div>

          <canvas ref={ticketRef} style={{ width: "100%", maxWidth: "600px", imageRendering: "pixelated", borderRadius: "6px", boxShadow: "0 0 40px rgba(0,240,255,.4)" }} />

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
            <ArcadeButton onClick={onDownload} style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#04040a", background: "#00f0ff", border: "none", borderRadius: "5px", padding: "12px 16px", boxShadow: "0 5px 0 #007a8a, 0 0 16px rgba(0,240,255,.5)" }} activeStyle={{ transform: "translateY(3px)", boxShadow: "0 2px 0 #007a8a" }}>⤓ DOWNLOAD PASS</ArcadeButton>
            <ArcadeButton onClick={onShareWA} style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#04040a", background: "#ffb800", border: "none", borderRadius: "5px", padding: "12px 16px", boxShadow: "0 5px 0 #3a3410, 0 0 16px rgba(255,180,40,.5)" }} activeStyle={{ transform: "translateY(3px)", boxShadow: "0 2px 0 #3a3410" }}>◈ WHATSAPP</ArcadeButton>
            <ArcadeButton onClick={onShareIG} style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#fff", background: "#ff2bd1", border: "none", borderRadius: "5px", padding: "12px 16px", boxShadow: "0 5px 0 #8a0e6d, 0 0 16px rgba(255,43,209,.5)" }} activeStyle={{ transform: "translateY(3px)", boxShadow: "0 2px 0 #8a0e6d" }}>◉ INSTAGRAM</ArcadeButton>
          </div>

          {/* Activation — first-time registration only. Once the account exists
            this whole panel is gone; the pass is just a pass. */}
          {alreadyActivated ? (
            <ArcadeButton
              onClick={() => goTo("hq")}
              style={{ cursor: "pointer", fontFamily: PS, fontSize: "clamp(9px,1.2vw,12px)", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", border: "none", borderRadius: "6px", padding: "14px 20px", boxShadow: "0 6px 0 #006074, 0 0 20px rgba(0,240,255,.5)", textShadow: "0 1px 0 rgba(255,255,255,.4)", marginTop: "4px" }}
              activeStyle={{ transform: "translateY(4px)", boxShadow: "0 2px 0 #006074" }}
            >
              ◄ BACK TO PLAYER HQ
            </ArcadeButton>
          ) : (
            <div style={{ width: "100%", maxWidth: "600px", marginTop: "8px", background: "rgba(10,14,26,.85)", border: "3px solid #1c2540", borderRadius: "12px", padding: "clamp(18px,2.6vw,28px)", boxShadow: "0 0 30px rgba(0,0,0,.5), inset 0 0 22px rgba(0,240,255,.05)" }}>
              <div style={{ fontFamily: PS, fontSize: "clamp(10px,1.3vw,13px)", color: "#ffb800", textShadow: "0 0 8px #ffb800", letterSpacing: "1px" }}>▶ ACTIVATE ACCOUNT · ENTER PLAYER HQ</div>
              <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,20px)", color: "#7de8ff", marginTop: "6px", marginBottom: "14px" }}>Set a secret PIN to track your quest, tasks &amp; interview slots.</div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <div style={labelSm}>SET SECRET PIN</div>
                  <PinField value={pin} onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setError(""); }} placeholder="4-6 DIGIT PIN" style={fieldStyle} />
                </div>
                <ArcadeButton onClick={onEnterHQ} style={{ cursor: enterBusy ? "wait" : "pointer", opacity: enterBusy ? 0.7 : 1, fontFamily: PS, fontSize: "clamp(9px,1.2vw,12px)", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", border: "none", borderRadius: "6px", padding: "14px 18px", boxShadow: "0 6px 0 #006074, 0 0 20px rgba(0,240,255,.5)", textShadow: "0 1px 0 rgba(255,255,255,.4)" }} activeStyle={{ transform: "translateY(4px)", boxShadow: "0 2px 0 #006074" }}>{enterBusy ? "SAVING…" : "ENTER HQ ▶"}</ArcadeButton>
              </div>
              <div style={{ ...errBase, marginTop: "12px" }}>{error}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

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
      <div className="screen-h" style={{ overflowY: "auto", overflowX: "hidden", background: "radial-gradient(120% 80% at 50% -5%, #2a0e18 0%, #0a0e1c 55%, #05060d 100%)", position: "relative" }}>
        <div style={scanOverlay(0.22)} />
        <div style={{ maxWidth: "760px", margin: "0 auto", padding: "clamp(28px,5vw,60px) clamp(16px,4vw,40px) 80px", display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(18px,3vw,26px)" }}>
          {/* identity */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "8px", overflow: "hidden", border: "3px solid #ff2bd1", boxShadow: "0 0 18px #ff2bd166", flexShrink: 0 }}>
              <canvas ref={hqAvatarRef} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
            </div>
            <div>
              <div style={{ fontFamily: PS, fontSize: "clamp(12px,1.8vw,18px)", color: "#fff" }}>{(form.name || "PLAYER 1").toUpperCase()}</div>
              <div style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff", marginTop: "6px" }}>PLAYER No. #{String(playerNo || 1).padStart(4, "0")}</div>
            </div>
          </div>

          {/* GAME OVER */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: PS, fontSize: "clamp(20px,4vw,40px)", color: "#ff2bd1", textShadow: "0 0 18px rgba(255,43,209,.6)", letterSpacing: "2px" }}>GAME OVER</div>
            <div style={{ fontFamily: VT, fontSize: "clamp(18px,2.2vw,26px)", color: "#7de8ff", marginTop: "12px" }}>Your quest concluded at the <span style={{ color: "#ffb800" }}>{reachedLabel}</span> stage.</div>
          </div>

          {/* journey tracker (stopped) */}
          <div style={{ ...panelBox, width: "100%", marginTop: 0 }}>
            <div style={sectionHdr}><span style={{ color: "#ff2bd1" }}>▮</span> YOUR JOURNEY</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
              {STAGES.map((s, i) => {
                const cleared = i < reachedIdx;
                const stopped = i === reachedIdx;
                const col = cleared ? "#ffb800" : stopped ? "#ff2bd1" : "#2a3350";
                return (
                  <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
                    <div style={{ position: "absolute", top: "clamp(16px,2.4vw,22px)", left: "-50%", width: "100%", height: "4px", background: i === 0 ? "transparent" : i <= reachedIdx ? "#ffb800" : "#1c2540", zIndex: 0 }} />
                    <div style={{ position: "relative", zIndex: 1, width: "clamp(34px,4.8vw,48px)", height: "clamp(34px,4.8vw,48px)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: PS, fontSize: "clamp(11px,1.4vw,16px)", color: stopped ? "#04040a" : col, background: stopped ? "#ff2bd1" : cleared ? "rgba(255,180,40,.12)" : "rgba(255,255,255,.02)", border: "3px solid " + col, boxShadow: cleared || stopped ? "0 0 16px " + col : "none" }}>{cleared ? "✓" : stopped ? "✕" : s.icon}</div>
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
          <div style={{ width: "100%", background: "rgba(255,180,40,.05)", border: "2px solid #ffb80066", borderRadius: "14px", padding: "clamp(18px,2.4vw,26px)", textAlign: "center" }}>
            <div style={{ fontFamily: PS, fontSize: "clamp(10px,1.4vw,13px)", color: "#ffb800", textShadow: "0 0 10px #ffb800" }}>▶ 1UP · THIS ISN&apos;T THE END</div>
            <div style={{ fontFamily: VT, fontSize: "clamp(17px,2vw,22px)", color: "#cfe8ff", marginTop: "12px", lineHeight: 1.4 }}>{positive}</div>
          </div>

          {/* actions */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
            <ArcadeButton onClick={() => goTo("pass")} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#00f0ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>◄ VIEW MY PASS</ArcadeButton>
            <ArcadeButton onClick={() => void handleLogout()} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#ff2bd1", background: "transparent", border: "2px solid #4d063d", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>⏻ LOG OUT</ArcadeButton>
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

    // Level derived from the stage. A rejected applicant keeps the level they
    // reached (rejectedAtStage), since stage_idx is set to 5 on rejection and
    // would otherwise read as a level beyond anything they actually cleared.
    const playerLevel = (() => {
      const reached = rejected ? rejectedAtStage : stageIdx;
      const lvl = Math.min(Math.max(reached, 1), 4);
      return lvl >= 4 ? "LV.MAX" : `LV.0${lvl}`;
    })();
    const domainTasks = selectedClasses
      .map((k) => DOMAINS.find((d) => d.key === k))
      .filter((d): d is (typeof DOMAINS)[number] => !!d);

    return (
      <div className="screen-h" style={{ overflowY: "auto", overflowX: "hidden", background: "radial-gradient(120% 80% at 80% -5%, #12203a 0%, #0a0e1c 55%, #05060d 100%)", position: "relative" }}>
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
                {/* Level tracks the stage rather than being pinned at 01:
                    Screening = LV.01, Task Round = LV.02, Interview = LV.03,
                    Recruited = LV.MAX. A stopped application shows the level it
                    actually reached, not a level it never got to. */}
                <div style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff", marginTop: "4px" }}>
                  PLAYER No. #{String(playerNo || 1).padStart(4, "0")} · {playerLevel}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: PS, fontSize: "9px", color: "#4a5a7a" }}>PLAYER HQ · COMMAND CENTER</div>
            </div>
          </div>

          {/* stage progress */}
          <div style={panelBox}>
            <div style={sectionHdr}><span style={{ color: "#00f0ff" }}>▮</span> STAGE PROGRESS</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
              {STAGES.map((s, i) => {
                const done = i < stageIdx,
                  isCur = i === stageIdx;
                const col = done ? "#ffb800" : isCur ? "#ffb800" : "#2a3350";
                return (
                  <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
                    <div style={{ position: "absolute", top: "clamp(16px,2.4vw,22px)", left: "-50%", width: "100%", height: "4px", background: i === 0 ? "transparent" : i <= stageIdx ? "#ffb800" : "#1c2540", zIndex: 0 }} />
                    <div style={{ position: "relative", zIndex: 1, width: "clamp(34px,4.8vw,48px)", height: "clamp(34px,4.8vw,48px)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: PS, fontSize: "clamp(11px,1.4vw,16px)", color: isCur ? "#04040a" : col, background: isCur ? "#ffb800" : done ? "rgba(255,180,40,.12)" : "rgba(255,255,255,.02)", border: "3px solid " + col, boxShadow: done || isCur ? "0 0 16px " + col : "none", animation: isCur ? "floaty 1.6s ease-in-out infinite" : "none" }}>{s.icon}</div>
                    <div style={{ fontFamily: PS, fontSize: "clamp(6px,.85vw,9px)", color: col, marginTop: "10px", lineHeight: 1.4, textShadow: done || isCur ? "0 0 6px " + col : "none" }}>{s.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,20px)", color: "#ffb800", marginTop: "16px", textAlign: "center" }}>&gt; CURRENT STAGE: <span style={{ textShadow: "0 0 8px #ffb800" }}>{STAGES[stageIdx].label}</span></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "clamp(16px,2.4vw,24px)" }}>
            {/* quest log — locked until SCREENING is cleared by the council */}
            <div style={panelBoxTight}>
              <div style={sectionHdr}><span style={{ color: "#ff2bd1" }}>⚔</span> QUEST LOG</div>

              {/* Three distinct states, driven by the applicant's real stage:
                    rejected      -> outcome + feedback form only
                    task round+   -> congratulations + task form + feedback form
                    still screening -> locked notice
                  Submissions now go through a Google Form rather than link
                  fields, so review happens in the form's responses sheet. */}
              {rejected ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ ...taskCard(false), borderColor: "#ff2bd1", background: "rgba(255,43,209,.06)" }}>
                    <div style={{ fontFamily: PS, fontSize: "clamp(10px,1.3vw,13px)", color: "#ff2bd1", textShadow: "0 0 10px #ff2bd1", lineHeight: 1.5 }}>
                      APPLICATION NOT SHORTLISTED
                    </div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,19px)", color: "#a9c3d6", marginTop: "10px", lineHeight: 1.45 }}>
                      Unfortunately you didn&apos;t make it through to the Task Round this time.
                      We had a huge number of applications and a limited number of places, so this
                      isn&apos;t a reflection of your potential.
                    </div>
                    {rejectionFeedback.trim() && (
                      <div style={{ marginTop: "12px", padding: "11px 13px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,43,209,.3)", borderRadius: "8px" }}>
                        <div style={{ fontFamily: PS, fontSize: "8px", color: "#ff2bd1" }}>NOTE FROM THE TEAM</div>
                        <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#ffb800", marginTop: "6px", lineHeight: 1.4 }}>
                          &ldquo;{rejectionFeedback.trim()}&rdquo;
                        </div>
                      </div>
                    )}
                    <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#7de8ff", marginTop: "12px", lineHeight: 1.4 }}>
                      Please do apply again next season — we&apos;d genuinely like to see you back.
                    </div>
                  </div>

                  {/* Feedback form only. The task form is deliberately NOT shown
                      to applicants who weren't shortlisted. */}
                  <div style={taskCard(false)}>
                    <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: "#00f0ff" }}>ONE LAST FAVOUR</div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#a9c3d6", marginTop: "8px", lineHeight: 1.4 }}>
                      Tell us what you thought of this recruitment site — it genuinely helps us
                      improve it for next year.
                    </div>
                    <a
                      href={FEEDBACK_FORM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "block", textAlign: "center", marginTop: "12px", fontFamily: PS, fontSize: "clamp(9px,1.1vw,11px)", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", borderRadius: "6px", padding: "13px", textDecoration: "none", boxShadow: "0 5px 0 #006074, 0 0 18px rgba(0,240,255,.45)" }}
                    >
                      ▶ SHARE WEBSITE FEEDBACK
                    </a>
                  </div>
                </div>
              ) : !screeningCleared ? (
                <div style={{ ...taskCard(true), textAlign: "center", padding: "clamp(20px,3vw,30px)" }}>
                  <div style={{ fontFamily: PS, fontSize: "clamp(11px,1.4vw,14px)", color: "#4a5a7a" }}>🔒 TASK GUILD LOCKED</div>
                  <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,19px)", color: "#a9c3d6", marginTop: "12px", lineHeight: 1.35 }}>
                    Clear the <span style={{ color: "#00f0ff" }}>SCREENING</span> round first. Once the Guild Council shortlists you, your domain tasks unlock here.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Congratulations */}
                  <div style={{ ...taskCard(false), borderColor: "#ffb800", background: "rgba(255,180,40,.07)" }}>
                    <div style={{ fontFamily: PS, fontSize: "clamp(10px,1.4vw,14px)", color: "#ffb800", textShadow: "0 0 12px #ffb800", lineHeight: 1.5 }}>
                      🎉 CONGRATULATIONS — SCREENING CLEARED!
                    </div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,20px)", color: "#a9c3d6", marginTop: "10px", lineHeight: 1.45 }}>
                      You&apos;ve made it through to the <span style={{ color: "#ffb800" }}>TASK ROUND</span>
                      {domainTasks.length > 0 && (
                        <> for <span style={{ color: "#00f0ff" }}>{domainTasks.map((d) => d.name).join(" and ")}</span></>
                      )}. Complete the task and submit it using the form below.
                    </div>

                    {/* The TASK form is mandatory. The feedback form is
                        encouraged but optional — don't imply otherwise. */}
                    <div
                      style={{
                        marginTop: "13px",
                        padding: "11px 13px",
                        background: "rgba(255,43,209,.1)",
                        border: "2px solid #ff2bd1",
                        borderRadius: "8px",
                      }}
                    >
                      <div style={{ fontFamily: PS, fontSize: "clamp(8px,1.1vw,11px)", color: "#ff2bd1", textShadow: "0 0 10px #ff2bd1", lineHeight: 1.5 }}>
                        ⚠ TASK SUBMISSION IS COMPULSORY
                      </div>
                      <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.7vw,19px)", color: "#ffe9b8", marginTop: "7px", lineHeight: 1.45 }}>
                        You must submit the <span style={{ color: "#ffb800" }}>Task Submission</span> form
                        to be considered for further evaluation. Applications without it will not be
                        taken forward.
                      </div>
                      <div style={{ fontFamily: PS, fontSize: "clamp(8px,1.1vw,11px)", color: "#ffb800", textShadow: "0 0 10px #ffb800", marginTop: "10px", lineHeight: 1.6 }}>
                        ⏰ DEADLINE &mdash; {TASK_DEADLINE}
                      </div>
                      <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.7vw,19px)", color: "#ffe9b8", marginTop: "5px", lineHeight: 1.45 }}>
                        Submissions after this time will not be accepted.
                      </div>
                    </div>
                  </div>

                  {/* Task submission form */}
                  <div style={taskCard(false)}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: "#ffb800" }}>1 · TASK SUBMISSION</div>
                      <div style={{ fontFamily: PS, fontSize: "7px", color: "#ff2bd1", border: "1px solid #ff2bd188", background: "rgba(255,43,209,.14)", borderRadius: "3px", padding: "3px 7px", whiteSpace: "nowrap" }}>REQUIRED</div>
                    </div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#a9c3d6", marginTop: "8px", lineHeight: 1.4 }}>
                      Open the form, read the task for your domain, and submit your work there.
                      Use the same college email you registered with.
                    </div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#ffb800", marginTop: "8px", lineHeight: 1.4 }}>
                      ⏰ Submit before <span style={{ fontFamily: PS, fontSize: "clamp(8px,1vw,10px)" }}>{TASK_DEADLINE}</span>
                    </div>
                    <a
                      href={TASK_FORM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "block", textAlign: "center", marginTop: "12px", fontFamily: PS, fontSize: "clamp(9px,1.2vw,12px)", color: "#241a11", background: "radial-gradient(circle at 40% 30%, #fff5b0, #ffb800 55%, #b8a200)", borderRadius: "6px", padding: "14px", textDecoration: "none", boxShadow: "0 5px 0 #8a7900, 0 0 20px rgba(255,180,40,.5)", textShadow: "0 1px 0 rgba(255,255,255,.45)" }}
                    >
                      ▶ OPEN TASK SUBMISSION FORM
                    </a>
                  </div>

                  {/* Feedback form */}
                  <div style={taskCard(false)}>
                    <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: "#00f0ff" }}>2 · WEBSITE FEEDBACK</div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#a9c3d6", marginTop: "8px", lineHeight: 1.4 }}>
                      How was this recruitment site to use? Your feedback shapes next year&apos;s.
                    </div>
                    <a
                      href={FEEDBACK_FORM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "block", textAlign: "center", marginTop: "12px", fontFamily: PS, fontSize: "clamp(9px,1.1vw,11px)", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #b6f5ff, #00f0ff 60%, #0090b8)", borderRadius: "6px", padding: "13px", textDecoration: "none", boxShadow: "0 5px 0 #006074, 0 0 18px rgba(0,240,255,.45)" }}
                    >
                      ▶ SHARE WEBSITE FEEDBACK
                    </a>
                  </div>

                </div>
              )}
            </div>

            {/* comms */}
            <div style={panelBoxTight}>
              <div style={sectionHdr}><span style={{ color: "#ffb800" }}>▤</span> COMMS CHANNEL</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "420px", overflowY: "auto" }}>
                {comms.map((c) => (
                  <div key={c.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "11px", borderRadius: "6px", background: "rgba(255,255,255,.02)", borderLeft: "3px solid " + c.color }}>
                    <div style={{ fontFamily: PS, fontSize: "12px", color: c.color, textShadow: "0 0 8px " + c.color }}>{c.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ fontFamily: PS, fontSize: "8px", color: c.color }}>{c.title}</div>
                        <div style={{ fontFamily: PS, fontSize: "7px", color: c.color, border: `1px solid ${c.color}66`, background: `${c.color}14`, borderRadius: "3px", padding: "3px 6px", whiteSpace: "nowrap" }}>{c.status}</div>
                      </div>
                      <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#a9c3d6", lineHeight: 1.3, marginTop: "5px" }}>{c.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "clamp(24px,3.5vw,36px)", flexWrap: "wrap" }}>
            <ArcadeButton onClick={() => goTo("pass")} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#00f0ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>◄ VIEW MY PASS</ArcadeButton>
            <ArcadeButton onClick={onShareWA} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#25d366", background: "transparent", border: "2px solid #1d5732", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>◈ WHATSAPP GROUP</ArcadeButton>
            {/* Read-only view of the submitted application. The create form
                locks itself once the account is activated, so nothing here is
                editable — it exists so applicants can re-read what they sent. */}
            <ArcadeButton onClick={() => goTo("create")} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#ffb800", background: "transparent", border: "2px solid #3a3410", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>&#128196; MY APPLICATION</ArcadeButton>
            <ArcadeButton onClick={() => void handleLogout()} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#ff2bd1", background: "transparent", border: "2px solid #4d063d", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>⏻ LOG OUT</ArcadeButton>
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
              <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: "#ffb800", textShadow: "0 0 8px #ffb800", letterSpacing: "1px", marginBottom: "12px" }}>
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
              <div style={{ fontFamily: PS, fontSize: "clamp(8px,.95vw,10px)", color: "#ffb800", textShadow: "0 0 8px #ffb800", letterSpacing: "1px", marginBottom: "8px" }}>
                ⚡ PRIMARY QUEST
              </div>
              <div style={{
                fontFamily: VT,
                fontSize: "clamp(18px,2.2vw,26px)",
                color: "#ffb800",
                textShadow: "0 0 10px rgba(255,180,40,.4)",
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
                      ? "radial-gradient(circle at 40% 30%, #ff5edbdd, #ff2bd1 55%, #ff2bd1aa)"
                      : `radial-gradient(circle at 40% 30%, ${d.color}dd, ${d.color} 55%, ${d.color}aa)`,
                    border: "none",
                    borderRadius: "8px",
                    padding: "clamp(12px,1.8vw,18px) clamp(20px,3vw,32px)",
                    boxShadow: selectedClasses.includes(d.key)
                      ? `0 6px 0 #8a0e6d55, 0 0 28px #ff2bd166`
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
            border: `3px solid ${forgotPinMode ? "#ffb800" : "#ffb800"}`,
            borderRadius: "16px",
            padding: "32px 24px",
            boxShadow: `0 0 50px ${forgotPinMode ? "rgba(255,180,40,.25)" : "rgba(255,180,40,.25)"}`,
            position: "relative",
            textAlign: "center",
          }}
        >
          <button
            onClick={closeModal}
            style={{ position: "absolute", top: "14px", right: "16px", cursor: "pointer", background: "transparent", border: "2px solid #ff2bd1", color: "#ff2bd1", borderRadius: "6px", padding: "4px 8px", fontFamily: PS, fontSize: "8px" }}
          >
            ✕ CLOSE
          </button>

          {!forgotPinMode ? (
            /* ========== LOGIN VIEW ========== */
            <>
              <div style={{ fontFamily: PS, fontSize: "18px", color: "#ffb800", textShadow: "0 0 12px #ffb800" }}>🔑 PLAYER LOGIN</div>
              <div style={{ fontFamily: VT, fontSize: "18px", color: "#7de8ff", marginTop: "8px" }}>Enter your registered email & PIN to open Player HQ</div>

              <form onSubmit={handleCandidateLogin} style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
                <div>
                  <div style={{ ...labelSm, color: "#ffb800" }}>COLLEGE EMAIL (@ABES.AC.IN)</div>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => { setLoginEmail(e.target.value); setLoginErr(""); }}
                    placeholder="student@abes.ac.in"
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <div style={{ ...labelSm, color: "#ffb800" }}>SECRET PIN (4-6 DIGITS)</div>
                  <PinField
                    value={loginPin}
                    onChange={(e) => { setLoginPin(e.target.value.replace(/[^0-9]/g, "")); setLoginErr(""); }}
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
                    background: "radial-gradient(circle at 40% 30%, #fff5b0, #ffb800 55%, #b8a200)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "14px",
                    boxShadow: "0 6px 0 #3a3410, 0 0 20px rgba(255,180,40,.5)",
                    marginTop: "6px",
                  }}
                >
                  ENTER PLAYER HQ ▶
                </button>
              </form>

              <button
                onClick={() => { setForgotPinMode(true); setLoginErr(""); }}
                style={{ cursor: "pointer", fontFamily: PS, fontSize: "7px", color: "#ffb800", background: "transparent", border: "none", marginTop: "18px", textShadow: "0 0 6px #ffb800", textDecoration: "underline", textUnderlineOffset: "4px" }}
              >
                FORGOT PIN? RESET HERE ▶
              </button>
            </>
          ) : (
            /* ========== FORGOT PIN VIEW ========== */
            <>
              <div style={{ fontFamily: PS, fontSize: "16px", color: "#ffb800", textShadow: "0 0 12px #ffb800" }}>🔐 RESET PIN</div>
              <div style={{ fontFamily: VT, fontSize: "18px", color: "#7de8ff", marginTop: "8px" }}>
                {resetStep === "verify"
                  ? "We'll email a secure link to your college address"
                  : resetStep === "sent"
                    ? "Check your inbox and open the link we just sent"
                    : "Set your new secret PIN"}
              </div>

              {resetSuccess ? (
                <div style={{ fontFamily: PS, fontSize: "10px", color: "#ffb800", textShadow: "0 0 10px #ffb800", marginTop: "24px", padding: "16px", border: "2px solid #ffb800", borderRadius: "8px", background: "rgba(255,180,40,.08)" }}>
                  ✓ {resetSuccess}
                </div>
              ) : resetStep === "verify" ? (
                <form onSubmit={handleForgotPinVerify} style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
                  <div>
                    <div style={{ ...labelSm, color: "#ffb800" }}>COLLEGE EMAIL (@ABES.AC.IN)</div>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => { setResetEmail(e.target.value); setResetErr(""); }}
                      placeholder="student@abes.ac.in"
                      style={fieldStyle}
                    />
                  </div>
                  <div style={{ fontFamily: VT, fontSize: "15px", color: "#7de8ff", lineHeight: 1.35 }}>
                    Only the person who can open this inbox can reset the PIN.
                  </div>
                  {resetErr && <div style={{ ...errBase, textAlign: "center", fontSize: "8px" }}>{resetErr}</div>}
                  <button type="submit" disabled={resetBusy} style={{ cursor: resetBusy ? "not-allowed" : "pointer", fontFamily: PS, fontSize: "10px", color: "#04040a", background: resetBusy ? "#4a5a7a" : "radial-gradient(circle at 40% 30%, #fff5b0, #ffb800 55%, #b8a200)", border: "none", borderRadius: "8px", padding: "14px", boxShadow: resetBusy ? "none" : "0 6px 0 #8a7900, 0 0 20px rgba(255,180,40,.4)", marginTop: "6px" }}>
                    {resetBusy ? "SENDING…" : "EMAIL ME A RESET LINK ▶"}
                  </button>
                </form>
              ) : resetStep === "sent" ? (
                <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontFamily: PS, fontSize: "26px", color: "#ffb800", textShadow: "0 0 14px #ffb800" }}>📬</div>
                  <div style={{ fontFamily: VT, fontSize: "18px", color: "#a9c3d6", lineHeight: 1.4 }}>
                    We&apos;ve emailed a reset link to
                    <div style={{ color: "#ffb800", marginTop: "4px", wordBreak: "break-all" }}>{resetEmail.trim().toLowerCase()}</div>
                  </div>
                  <div style={{ fontFamily: VT, fontSize: "16px", color: "#7de8ff", lineHeight: 1.4 }}>
                    Open it on this device and you&apos;ll come straight back here to choose a new PIN.
                    Check your spam folder if it hasn&apos;t arrived within a minute.
                  </div>
                  {resetErr && <div style={{ ...errBase, textAlign: "center", fontSize: "8px" }}>{resetErr}</div>}
                  <button type="button" onClick={() => { setResetStep("verify"); setResetErr(""); setResetSuccess(""); }} style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#7de8ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "6px", padding: "10px" }}>
                    ◄ USE A DIFFERENT EMAIL
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPinSubmit} style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
                  <div>
                    <div style={{ ...labelSm, color: "#ffb800" }}>NEW PIN (4-6 DIGITS)</div>
                    <PinField
                      value={resetNewPin}
                      onChange={(e) => { setResetNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setResetErr(""); }}
                      placeholder="NEW PIN"
                      style={fieldStyle}
                    />
                  </div>
                  <div>
                    <div style={{ ...labelSm, color: "#00f0ff" }}>CONFIRM NEW PIN</div>
                    <PinField
                      value={resetConfirmPin}
                      onChange={(e) => { setResetConfirmPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setResetErr(""); }}
                      placeholder="RE-ENTER PIN"
                      style={fieldStyle}
                    />
                  </div>
                  {resetErr && <div style={{ ...errBase, textAlign: "center", fontSize: "8px" }}>{resetErr}</div>}
                  <button type="submit" style={{ cursor: "pointer", fontFamily: PS, fontSize: "10px", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #fff5b0, #ffb800 55%, #b8a200)", border: "none", borderRadius: "8px", padding: "14px", boxShadow: "0 6px 0 #3a3410, 0 0 20px rgba(255,180,40,.5)", marginTop: "6px" }}>
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
    <div className="screen-h" style={{ width: "100%", background: "#04040a" }}>
      {page === "floor" && renderFloor()}
      {page === "create" && renderCreate()}
      {page === "pass" && renderPass()}
      {page === "hq" && renderHQ()}
      {renderDomainDetail()}
      {renderLoginModal()}
      {/* Rendered once here rather than per-screen, so the contacts are
          reachable from the floor, the form, the pass and HQ alike. */}
      <HelpContacts />
    </div>
  );
}
