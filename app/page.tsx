"use client";

/**
 * Club Recruitment Arcade — faithful port of the design artifact.
 * A single-page, state-driven arcade experience (floor → character → pass → HQ).
 * Pure frontend: no backend wired in yet (Supabase intentionally stubbed).
 * Ported 1:1 from the design's inline styles, keyframes, joystick physics and
 * canvas ticket rendering.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

// ---- config (edit freely) ----
const CLUB_NAME = "TECHNOVATION";
const SCANLINES = 0.35;
const FLICKER = true;
const SCREEN_TINT = "blue" as "blue" | "green" | "amber";

const DOMAINS = [
  { key: "tech", name: "TECHNICAL", stage: "CODE CITADEL", glyph: "Ψ", color: "#00f0ff", cls: "MAGE" },
  { key: "graphics", name: "GRAPHICS", stage: "PIXEL STUDIO", glyph: "✦", color: "#ff2bd1", cls: "ARTIFICER" },
  { key: "prod", name: "PRODUCTION", stage: "STAGE MASTER", glyph: "◈", color: "#ffe600", cls: "TANK" },
  { key: "events", name: "EVENTS", stage: "BOSS ARENA", glyph: "⚔", color: "#39ff14", cls: "WARRIOR" },
  { key: "pr", name: "PR/OUTREACH", stage: "BROADCAST TOWER", glyph: "➤", color: "#ff7a2b", cls: "BARD" },
  { key: "content", name: "CONTENT", stage: "LORE KEEPER", glyph: "✎", color: "#b06bff", cls: "SCRIBE" },
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
  const [selectedClass, setSelectedClass] = useState("");
  const [score, setScore] = useState(1337);
  const [playerNo, setPlayerNo] = useState(0);
  const [hover, setHover] = useState("");
  const [error, setError] = useState("");
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
  });
  const [pin, setPin] = useState("");
  const [stageIdx, setStageIdx] = useState(1);
  const [taskInput, setTaskInput] = useState("");
  const [taskSubmitted, setTaskSubmitted] = useState(false);
  const [comms, setComms] = useState<Comm[]>([
    { id: "c1", icon: "✓", color: "#39ff14", title: "REGISTRATION CONFIRMED", body: "Welcome, Player 1. Your file is locked in. Stand by for screening.", time: "JUST NOW" },
    { id: "c2", icon: "◉", color: "#00f0ff", title: "SCREENING IN PROGRESS", body: "The guild council is reviewing your player file. ETA 48 hrs.", time: "5 MIN AGO" },
  ]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const ticketRef = useRef<HTMLCanvasElement | null>(null);
  const hqAvatarRef = useRef<HTMLCanvasElement | null>(null);
  const mt = useRef({ rx: 0, ry: 0 });
  const cur = useRef({ x: 0, y: 0 });

  const selDomain = () => DOMAINS.find((d) => d.key === selectedClass);
  const selLabel = () => {
    const d = selDomain();
    return d ? d.name + " / " + d.cls : "";
  };
  const avatarSeed = () => (form.name || "PLAYER1") + (selectedClass || "x");
  const club = () => CLUB_NAME || "[REDACTED] GUILD";

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
    const scoreTimer = setInterval(() => {
      setScore((s) => s + (Math.random() < 0.45 ? 1 : 0));
    }, 3600);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
      clearInterval(scoreTimer);
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
      const dom = selDomain();
      const cls = dom ? dom.stage : "ROOKIE";
      const clsName = dom ? dom.name + " / " + dom.cls : "UNASSIGNED";
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
  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm((s) => ({ ...s, [k]: v }));
  };

  const onPressStart = () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("ENTER NAME & EMAIL TO PRESS START");
      return;
    }
    goTo("create");
  };
  const onScrollDomains = () => {
    const sc = scrollerRef.current;
    if (sc) sc.scrollTo({ top: sc.scrollHeight * 0.62, behavior: "smooth" });
  };
  const onSaveData = () => {
    if (!form.name.trim() || !form.email.trim() || !form.branch.trim() || !form.phone.trim() || !selectedClass) {
      setError("!! INCOMPLETE — NAME, EMAIL, BRANCH, PHONE & CLASS REQUIRED");
      return;
    }
    setScore((s) => {
      setPlayerNo(s + 1);
      return s + 1;
    });
    setError("");
    setPage("pass");
  };
  const onEnterHQ = () => {
    if (pin.length < 4) {
      setError("PIN MUST BE 4-6 DIGITS");
      return;
    }
    goTo("hq");
  };
  const onSubmitTask = () => {
    if (!taskInput.trim()) return;
    setTaskSubmitted(true);
    setStageIdx((s) => Math.max(s, 2));
    setComms((cs) => [
      { id: "c" + Date.now(), icon: "⚔", color: "#39ff14", title: "TASK SUBMITTED", body: "Round 1 quest received. The council will judge your work soon. +50 XP", time: "JUST NOW" },
      ...cs,
    ]);
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
  const onShareIG = () => window.open("https://instagram.com", "_blank");

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
  const scoreStr = String(score).padStart(6, "0");

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
    const active = selectedClass === d.key || hover === d.key;
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
      border: "2px solid " + (selectedClass === d.key ? d.color : "rgba(125,232,255,.18)"),
      boxShadow: active ? "0 0 20px " + d.color + "55, inset 0 0 16px rgba(255,255,255,.06)" : "none",
      transform: selectedClass === d.key ? "translateY(-3px)" : "none",
      transition: "all .12s",
    };
  };
  const badgeStyle = (d: (typeof DOMAINS)[number]): CSSProperties => {
    const on = selectedClass === d.key;
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
                height: "6.5%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "14px",
                background: "linear-gradient(#161a2d,#0d1020)",
                borderBottom: "3px solid #23283c",
                boxShadow: "inset 0 -6px 14px rgba(0,0,0,.6)",
                zIndex: 6,
              }}
            >
              <span style={{ fontFamily: PS, fontSize: "11px", color: "#00f0ff", textShadow: "0 0 8px #00f0ff" }}>◄</span>
              <span style={{ fontFamily: PS, fontSize: "clamp(11px,1.5vw,18px)", color: "#ff2bd1", letterSpacing: "2px", animation: "marqueeglow 2.4s infinite" }}>
                {club()} · ARCADE RECRUITMENT
              </span>
              <span style={{ fontFamily: PS, fontSize: "11px", color: "#00f0ff", textShadow: "0 0 8px #00f0ff" }}>►</span>
            </div>

            {/* high score */}
            <div style={{ position: "absolute", top: "8.2%", right: "2.5%", zIndex: 7, textAlign: "right", fontFamily: PS, lineHeight: 1.7 }}>
              <div style={{ fontSize: "9px", color: "#ffe600", textShadow: "0 0 8px #ffe600" }}>HIGH SCORE</div>
              <div style={{ fontSize: "clamp(14px,1.8vw,22px)", color: "#39ff14", textShadow: "0 0 10px #39ff14", letterSpacing: "2px" }}>{scoreStr}</div>
              <div style={{ fontSize: "7px", color: "#7de8ff", marginTop: "2px" }}>▲ LIVE REGISTRATIONS</div>
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
                  </div>
                  <div style={{ position: "absolute", bottom: "5%", left: 0, right: 0, textAlign: "center", fontFamily: PS, fontSize: "10px", color: "#7de8ff" }}>
                    <div>SCROLL DOWN</div>
                    <div style={{ fontSize: "18px", animation: "scrollpulse 1.4s infinite", marginTop: "8px" }}>▼</div>
                  </div>
                </div>

                {/* DOMAIN GRID */}
                <div style={termStyle}>
                  <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.3vw,14px)", color: "#ffe600", textShadow: "0 0 8px #ffe600", letterSpacing: "1px", marginBottom: "2.5%" }}>
                    ▶ SELECT A DOMAIN — 6 GUILD STAGES
                  </div>
                  <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gridTemplateRows: "repeat(2,1fr)", gap: "2.4%" }}>
                    {DOMAINS.map((d) => (
                      <div key={d.key} style={cabStyle(d)} onClick={() => { setSelectedClass(d.key); setError(""); }} onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover("")}>
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
                  <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.2vw,14px)", color: "#ff2bd1", textShadow: "0 0 10px #ff2bd1", letterSpacing: "1px" }}>QUICK HOOK · INSERT PLAYER DATA</div>
                  <div style={{ display: "flex", gap: "10px", width: "100%", maxWidth: "520px" }}>
                    <input value={form.name} onChange={setField("name")} placeholder="PLAYER NAME" style={hookInput} />
                    <input value={form.email} onChange={setField("email")} placeholder="EMAIL" style={hookInput} />
                  </div>
                  <div style={{ ...errBase, fontSize: "8px", minHeight: "8px" }}>{error}</div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "2px" }}>
                    <ArcadeButton
                      onClick={onScrollDomains}
                      style={{ cursor: "pointer", width: "clamp(48px,5.5vw,66px)", height: "clamp(48px,5.5vw,66px)", borderRadius: "50%", border: "none", background: "radial-gradient(circle at 38% 30%, #7de8ff, #0090b8 55%, #003a4d)", boxShadow: "0 8px 0 #002230, 0 0 18px rgba(0,240,255,.6), inset 0 3px 6px rgba(255,255,255,.5)", fontFamily: PS, fontSize: "7px", color: "#04121a" }}
                      activeStyle={{ transform: "translateY(6px)", boxShadow: "0 2px 0 #002230, inset 0 3px 6px rgba(255,255,255,.5)" }}
                    >
                      A<br />INFO
                    </ArcadeButton>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(12px,2vw,20px)" }}>
            {[
              { l: "PLAYER NAME", k: "name" as const, ph: "ENTER NAME" },
              { l: "COLLEGE EMAIL", k: "email" as const, ph: "name@college.edu" },
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

        {/* Section 2 */}
        <div style={panelBox}>
          <div style={sectionHdr}><span style={{ color: "#ff2bd1" }}>02</span> CLASS SELECTION</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "clamp(10px,1.6vw,16px)" }}>
            {DOMAINS.map((d) => (
              <div key={d.key} style={badgeStyle(d)} onClick={() => { setSelectedClass(d.key); setError(""); }}>
                <div style={{ width: "clamp(44px,5vw,60px)", height: "clamp(44px,5vw,60px)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", background: "rgba(255,255,255,.03)", border: "2px solid " + d.color, fontFamily: PS, fontSize: "clamp(18px,2.4vw,26px)", color: d.color, textShadow: "0 0 12px " + d.color }}>{d.glyph}</div>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: PS, fontSize: "clamp(8px,1vw,11px)", color: "#fff" }}>{d.name}</div>
                  <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,19px)", color: d.color }}>{d.stage}</div>
                  <div style={{ fontFamily: VT, fontSize: "clamp(12px,1.3vw,16px)", color: "#7de8ff" }}>CLASS · {d.cls}</div>
                </div>
                <div style={{ position: "absolute", top: "8px", right: "10px", fontFamily: PS, fontSize: "12px", color: d.color, textShadow: "0 0 8px " + d.color, opacity: selectedClass === d.key ? 1 : 0 }}>✓</div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3 */}
        <div style={panelBox}>
          <div style={sectionHdr}><span style={{ color: "#39ff14" }}>03</span> QUEST QUESTIONS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(14px,2vw,20px)" }}>
            {[
              { l: "Q1 · WHY DO YOU SEEK TO JOIN THE GUILD?", k: "q1" as const },
              { l: "Q2 · DESCRIBE YOUR GREATEST QUEST SO FAR", k: "q2" as const },
              { l: "Q3 · WHAT SPECIAL POWER DO YOU BRING TO THE PARTY?", k: "q3" as const },
            ].map((q) => (
              <div key={q.k}>
                <div style={{ ...labelSm, color: "#39ff14" }}>{q.l}</div>
                <textarea value={form[q.k]} onChange={setField(q.k)} rows={2} placeholder="TYPE YOUR ANSWER..." style={areaStyle} />
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
  const renderHQ = () => {
    const dom = selDomain();
    const selColor = dom ? dom.color : "#00f0ff";
    const tasks = [
      {
        id: "t1",
        title: "ROUND 1 · GUILD TASK",
        desc: stageIdx < 2 ? "Unlocks after screening. A domain-specific mini-challenge will appear here." : "Build a small artifact for the " + (dom ? dom.stage : "guild") + ". Submit your link below.",
        tag: stageIdx < 2 ? "LOCKED" : taskSubmitted ? "SUBMITTED" : "ACTIVE",
        titleColor: stageIdx < 2 ? "#4a5a7a" : "#ffe600",
        tagKind: (stageIdx < 2 ? "locked" : taskSubmitted ? "done" : "active") as "locked" | "done" | "active",
        cardLocked: stageIdx < 2,
        showInput: stageIdx >= 2 && !taskSubmitted,
      },
      {
        id: "t2",
        title: "ROUND 2 · INTERVIEW PREP",
        desc: "Review guild lore & prepare a 2-min pitch. Slot booking opens after Round 1.",
        tag: "UPCOMING",
        titleColor: "#4a5a7a",
        tagKind: "locked" as const,
        cardLocked: true,
        showInput: false,
      },
    ];

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
                <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,21px)", color: selColor }}>{dom ? dom.stage : "UNASSIGNED"} · {dom ? dom.cls : "ROOKIE"}</div>
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
            {/* quest log */}
            <div style={panelBoxTight}>
              <div style={sectionHdr}><span style={{ color: "#ff2bd1" }}>⚔</span> QUEST LOG</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {tasks.map((t) => (
                  <div key={t.id} style={taskCard(t.cardLocked)}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                      <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.1vw,12px)", color: t.titleColor }}>{t.title}</div>
                      <div style={tagStyle(t.tagKind)}>{t.tag}</div>
                    </div>
                    <div style={{ fontFamily: VT, fontSize: "clamp(14px,1.6vw,18px)", color: "#a9c3d6", marginTop: "6px" }}>{t.desc}</div>
                    {t.showInput && (
                      <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                        <input value={taskInput} onChange={(e) => setTaskInput(e.target.value)} placeholder="PASTE SUBMISSION LINK" style={{ flex: 1, minWidth: "150px", background: "#050a10", border: "2px solid #12463f", borderRadius: "4px", color: "#39ff14", fontFamily: VT, fontSize: "16px", padding: "6px 9px", textShadow: "0 0 6px #39ff14" }} />
                        <ArcadeButton onClick={onSubmitTask} style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#053200", background: "#39ff14", border: "none", borderRadius: "4px", padding: "8px 12px", boxShadow: "0 4px 0 #0a5200" }} activeStyle={{ transform: "translateY(2px)", boxShadow: "0 2px 0 #0a5200" }}>SUBMIT</ArcadeButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
            <ArcadeButton onClick={() => goTo("floor")} style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#7de8ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "5px", padding: "11px 15px" }} activeStyle={{ transform: "translateY(2px)" }}>↺ ARCADE FLOOR</ArcadeButton>
          </div>
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
    </div>
  );
}
