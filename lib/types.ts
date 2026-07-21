export const DOMAINS = [
  {
    id: "technical",
    name: "Technical",
    codename: "Code Citadel",
    icon: "⌨",
    color: "#39ff14",
    blurb: "Build the engines. Break the bugs. Rule the stack.",
  },
  {
    id: "graphics",
    name: "Graphics",
    codename: "Pixel Studio",
    icon: "🎨",
    color: "#00f0ff",
    blurb: "Sprites, posters, and neon dreams rendered in style.",
  },
  {
    id: "production",
    name: "Production",
    codename: "Stage Master",
    icon: "🎬",
    color: "#ff00d4",
    blurb: "Lights, camera, logistics. Make the show run.",
  },
  {
    id: "events",
    name: "Events",
    codename: "Boss Arena",
    icon: "⚔",
    color: "#ffe600",
    blurb: "Design the battles. Host the legendary encounters.",
  },
  {
    id: "pr",
    name: "PR & Outreach",
    codename: "Broadcast Tower",
    icon: "📡",
    color: "#ff2e63",
    blurb: "Signal boost the club across every frequency.",
  },
  {
    id: "content",
    name: "Content",
    codename: "Lore Keeper",
    icon: "📜",
    color: "#a020f0",
    blurb: "Words, scripts, and stories that level up the brand.",
  },
] as const;

export type DomainId = (typeof DOMAINS)[number]["id"];

export type Stage =
  | "Form Submitted"
  | "Screening"
  | "Task Round"
  | "Interview"
  | "Recruited";

export const STAGES: Stage[] = [
  "Form Submitted",
  "Screening",
  "Task Round",
  "Interview",
  "Recruited",
];

export interface Candidate {
  id: string;
  name: string;
  email: string;
  college_email: string;
  branch: string | null;
  section: string | null;
  phone: string | null;
  domain: string;
  answers: Record<string, string> | null;
  stage: Stage;
  assigned_task_title: string | null;
  assigned_task_desc: string | null;
  submission_link: string | null;
  created_at: string;
}

export function getDomain(id: string) {
  return DOMAINS.find((d) => d.id === id);
}
