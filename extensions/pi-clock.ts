/**
 * pi-clock — terminal clock, timer, stopwatch, and pomodoro.
 *
 * /clock           Big beautiful clock
 * /timer 5m        Countdown timer
 * /stopwatch       Stopwatch with laps
 * /pomodoro        25/5 pomodoro cycles
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";

// ─── BIG DIGIT FONT (3×5 per digit, using block chars) ──────────────────────

const DIGITS: Record<string, string[]> = {
  "0": ["█▀█", "█ █", "█ █", "█ █", "█▄█"],
  "1": [" ▀█", "  █", "  █", "  █", "  █"],
  "2": ["█▀█", "  █", "█▀█", "█  ", "█▄█"],
  "3": ["█▀█", "  █", "█▀█", "  █", "█▄█"],
  "4": ["█ █", "█ █", "█▀█", "  █", "  █"],
  "5": ["█▀█", "█  ", "█▀█", "  █", "█▄█"],
  "6": ["█▀█", "█  ", "█▀█", "█ █", "█▄█"],
  "7": ["█▀█", "  █", "  █", "  █", "  █"],
  "8": ["█▀█", "█ █", "█▀█", "█ █", "█▄█"],
  "9": ["█▀█", "█ █", "█▀█", "  █", "█▄█"],
  ":": ["   ", " █ ", "   ", " █ ", "   "],
  ".": ["   ", "   ", "   ", "   ", " █ "],
  " ": ["   ", "   ", "   ", "   ", "   "],
};

// ─── COLOR THEMES ────────────────────────────────────────────────────────────

const THEMES = [
  { name: "Cyan",    fg: "38;2;0;220;255",   dim: "38;2;0;80;100",   accent: "38;2;0;255;200" },
  { name: "Amber",   fg: "38;2;255;180;0",   dim: "38;2;100;70;0",   accent: "38;2;255;220;60" },
  { name: "Green",   fg: "38;2;0;255;100",   dim: "38;2;0;80;40",    accent: "38;2;100;255;150" },
  { name: "Rose",    fg: "38;2;255;100;150",  dim: "38;2;100;40;60",  accent: "38;2;255;150;200" },
  { name: "Purple",  fg: "38;2;180;100;255",  dim: "38;2;70;40;100",  accent: "38;2;200;150;255" },
  { name: "White",   fg: "38;2;240;240;250",  dim: "38;2;60;60;70",   accent: "38;2;255;255;255" },
];

function renderBigText(text: string, colorCode: string): string[] {
  const lines: string[] = ["", "", "", "", ""];
  for (const ch of text) {
    const glyph = DIGITS[ch] || DIGITS[" "];
    for (let row = 0; row < 5; row++) {
      lines[row] += `\x1b[${colorCode}m${glyph[row]}\x1b[0m `;
    }
  }
  return lines;
}

function centerLines(lines: string[], width: number): string[] {
  return lines.map(l => {
    const vis = visibleWidth(l);
    const pad = Math.max(0, Math.floor((width - vis) / 2));
    return " ".repeat(pad) + l;
  });
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseDuration(s: string): number {
  const m2 = s.match(/^(\d+)\s*m(?:in)?$/i);
  if (m2) return parseInt(m2[1]) * 60 * 1000;
  const s2 = s.match(/^(\d+)\s*s(?:ec)?$/i);
  if (s2) return parseInt(s2[1]) * 1000;
  const h2 = s.match(/^(\d+)\s*h(?:r)?$/i);
  if (h2) return parseInt(h2[1]) * 3600 * 1000;
  const hm = s.match(/^(\d+):(\d+)$/);
  if (hm) return (parseInt(hm[1]) * 60 + parseInt(hm[2])) * 1000;
  const hms = s.match(/^(\d+):(\d+):(\d+)$/);
  if (hms) return (parseInt(hms[1]) * 3600 + parseInt(hms[2]) * 60 + parseInt(hms[3])) * 1000;
  const n = parseInt(s);
  if (!isNaN(n)) return n * 60 * 1000; // bare number = minutes
  return 25 * 60 * 1000; // default 25min
}

// ─── PROGRESS BAR ────────────────────────────────────────────────────────────

function progressBar(frac: number, width: number, colorCode: string, dimCode: string): string {
  const filled = Math.round(frac * width);
  const empty = width - filled;
  return `\x1b[${colorCode}m${"█".repeat(filled)}\x1b[${dimCode}m${"░".repeat(empty)}\x1b[0m`;
}

// ─── CLOCK COMPONENT ────────────────────────────────────────────────────────

type ClockMode = "clock" | "timer" | "stopwatch" | "pomodoro";

class ClockComponent {
  private mode: ClockMode;
  private theme = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private version = 0;
  private cachedLines: string[] = [];
  private cachedWidth = 0;
  private cachedVersion = -1;

  // Timer state
  private timerDuration = 0;
  private timerStart = 0;
  private timerPaused = false;
  private timerPausedAt = 0;

  // Stopwatch state
  private swStart = 0;
  private swRunning = false;
  private swElapsed = 0;
  private swLaps: number[] = [];

  // Pomodoro state
  private pomoDuration = 25 * 60 * 1000;
  private pomoBreak = 5 * 60 * 1000;
  private pomoStart = 0;
  private pomoOnBreak = false;
  private pomoCycles = 0;
  private pomoPaused = false;
  private pomoPausedAt = 0;

  constructor(
    private tui: any,
    private done: (v: undefined) => void,
    mode: ClockMode,
    duration?: number,
  ) {
    this.mode = mode;
    if (mode === "timer" && duration) {
      this.timerDuration = duration;
      this.timerStart = Date.now();
    }
    if (mode === "stopwatch") { this.swStart = Date.now(); this.swRunning = true; }
    if (mode === "pomodoro") { this.pomoStart = Date.now(); }
    this.timer = setInterval(() => { this.version++; this.tui.requestRender(); }, 200);
  }

  handleInput(data: string) {
    if (data === "q" || data === "Q" || data === "\x03" || data === "\x1b") {
      this.dispose(); this.done(undefined); return;
    }
    // Theme
    if (data === "t" || data === "T") { this.theme = (this.theme + 1) % THEMES.length; this.version++; }

    if (this.mode === "timer") {
      if (data === " " || data === "p" || data === "P") {
        if (this.timerPaused) { this.timerStart += Date.now() - this.timerPausedAt; this.timerPaused = false; }
        else { this.timerPausedAt = Date.now(); this.timerPaused = true; }
        this.version++;
      }
      if (data === "r" || data === "R") { this.timerStart = Date.now(); this.timerPaused = false; this.version++; }
    }

    if (this.mode === "stopwatch") {
      if (data === " " || data === "p" || data === "P") {
        if (this.swRunning) { this.swElapsed += Date.now() - this.swStart; this.swRunning = false; }
        else { this.swStart = Date.now(); this.swRunning = true; }
        this.version++;
      }
      if (data === "l" || data === "L" || data === "\r") {
        const elapsed = this.swRunning ? this.swElapsed + (Date.now() - this.swStart) : this.swElapsed;
        this.swLaps.push(elapsed);
        this.version++;
      }
      if (data === "r" || data === "R") { this.swElapsed = 0; this.swStart = Date.now(); this.swLaps = []; this.version++; }
    }

    if (this.mode === "pomodoro") {
      if (data === " " || data === "p" || data === "P") {
        if (this.pomoPaused) { this.pomoStart += Date.now() - this.pomoPausedAt; this.pomoPaused = false; }
        else { this.pomoPausedAt = Date.now(); this.pomoPaused = true; }
        this.version++;
      }
      if (data === "s" || data === "S") {
        // Skip to break/work
        this.pomoStart = Date.now();
        this.pomoOnBreak = !this.pomoOnBreak;
        if (!this.pomoOnBreak) this.pomoCycles++;
        this.version++;
      }
    }
    this.tui.requestRender();
  }

  invalidate() { this.cachedWidth = 0; }

  render(width: number): string[] {
    if (width === this.cachedWidth && this.cachedVersion === this.version) return this.cachedLines;

    const th = THEMES[this.theme];
    const lines: string[] = [];
    const now = new Date();

    if (this.mode === "clock") {
      // Big clock
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      const bigLines = renderBigText(timeStr, th.fg);
      lines.push("");
      lines.push(...centerLines(bigLines, width));
      lines.push("");
      // Date
      const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const dateLine = `\x1b[${th.dim}m${dateStr}\x1b[0m`;
      lines.push(...centerLines([dateLine], width));
      lines.push("");
      // Seconds progress bar
      const secFrac = now.getSeconds() / 60;
      const bar = progressBar(secFrac, Math.min(40, width - 10), th.fg, th.dim);
      lines.push(...centerLines([bar], width));
      // Day progress
      const dayFrac = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
      const dayBar = progressBar(dayFrac, Math.min(40, width - 10), th.accent, th.dim);
      lines.push(...centerLines([`\x1b[${th.dim}m${Math.floor(dayFrac * 100)}% of day\x1b[0m`], width));
      lines.push(...centerLines([dayBar], width));
      lines.push("");
      lines.push(...centerLines([`\x1b[${th.dim}mT=theme  Q=quit\x1b[0m`], width));
    }

    else if (this.mode === "timer") {
      const elapsed = this.timerPaused ? this.timerPausedAt - this.timerStart : Date.now() - this.timerStart;
      const remaining = Math.max(0, this.timerDuration - elapsed);
      const frac = 1 - remaining / this.timerDuration;
      const done = remaining === 0;
      const timeStr = formatDuration(remaining);
      const bigLines = renderBigText(timeStr, done ? "38;2;255;60;60" : th.fg);
      lines.push("");
      lines.push(...centerLines(bigLines, width));
      lines.push("");
      const bar = progressBar(frac, Math.min(40, width - 10), done ? "38;2;255;60;60" : th.fg, th.dim);
      lines.push(...centerLines([bar], width));
      if (done) lines.push(...centerLines([`\x1b[38;2;255;60;60;1m⏰ TIME'S UP!\x1b[0m`], width));
      else if (this.timerPaused) lines.push(...centerLines([`\x1b[33;1mPAUSED\x1b[0m`], width));
      lines.push("");
      lines.push(...centerLines([`\x1b[${th.dim}mSPACE=pause  R=reset  T=theme  Q=quit\x1b[0m`], width));
    }

    else if (this.mode === "stopwatch") {
      const elapsed = this.swRunning ? this.swElapsed + (Date.now() - this.swStart) : this.swElapsed;
      const timeStr = formatDuration(elapsed);
      const ms = String(Math.floor((elapsed % 1000) / 10)).padStart(2, "0");
      const bigLines = renderBigText(timeStr + "." + ms, th.fg);
      lines.push("");
      lines.push(...centerLines(bigLines, width));
      lines.push("");
      if (!this.swRunning) lines.push(...centerLines([`\x1b[33;1mSTOPPED\x1b[0m`], width));
      // Laps
      if (this.swLaps.length > 0) {
        lines.push(...centerLines([`\x1b[${th.accent}m── Laps ──\x1b[0m`], width));
        const showLaps = this.swLaps.slice(-6);
        for (let i = 0; i < showLaps.length; i++) {
          const lapNum = this.swLaps.length - showLaps.length + i + 1;
          const lapDelta = i === 0 ? showLaps[i] : showLaps[i] - showLaps[i - 1];
          lines.push(...centerLines([`\x1b[${th.dim}m#${lapNum}  ${formatDuration(showLaps[i])}  (+${formatDuration(lapDelta)})\x1b[0m`], width));
        }
      }
      lines.push("");
      lines.push(...centerLines([`\x1b[${th.dim}mSPACE=start/stop  L=lap  R=reset  T=theme  Q=quit\x1b[0m`], width));
    }

    else if (this.mode === "pomodoro") {
      const elapsed = this.pomoPaused ? this.pomoPausedAt - this.pomoStart : Date.now() - this.pomoStart;
      const dur = this.pomoOnBreak ? this.pomoBreak : this.pomoDuration;
      const remaining = Math.max(0, dur - elapsed);
      const frac = 1 - remaining / dur;
      const done = remaining === 0;
      if (done && !this.pomoPaused) {
        // Auto-switch
        this.pomoStart = Date.now();
        this.pomoOnBreak = !this.pomoOnBreak;
        if (!this.pomoOnBreak) this.pomoCycles++;
      }
      const label = this.pomoOnBreak ? "☕ BREAK" : "🍅 FOCUS";
      const timeStr = formatDuration(remaining);
      const colorCode = this.pomoOnBreak ? "38;2;100;200;255" : th.fg;
      const bigLines = renderBigText(timeStr, colorCode);
      lines.push("");
      lines.push(...centerLines([`\x1b[${th.accent};1m${label}\x1b[0m  \x1b[${th.dim}mCycle ${this.pomoCycles + 1}\x1b[0m`], width));
      lines.push("");
      lines.push(...centerLines(bigLines, width));
      lines.push("");
      const bar = progressBar(frac, Math.min(40, width - 10), colorCode, th.dim);
      lines.push(...centerLines([bar], width));
      if (this.pomoPaused) lines.push(...centerLines([`\x1b[33;1mPAUSED\x1b[0m`], width));
      // Cycle dots
      const dots = Array.from({ length: Math.min(8, this.pomoCycles + 1) }, (_, i) =>
        i < this.pomoCycles ? `\x1b[${th.fg}m●\x1b[0m` : `\x1b[${th.dim}m○\x1b[0m`
      ).join(" ");
      lines.push(...centerLines([dots], width));
      lines.push("");
      lines.push(...centerLines([`\x1b[${th.dim}mSPACE=pause  S=skip  T=theme  Q=quit\x1b[0m`], width));
    }

    this.cachedLines = lines;
    this.cachedWidth = width;
    this.cachedVersion = this.version;
    return lines;
  }

  dispose() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

// ─── EXTENSION ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerCommand("clock", {
    description: "Beautiful big terminal clock. T=theme, Q=quit.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) { ctx.ui.notify("Clock requires interactive mode", "error"); return; }
      await ctx.ui.custom((tui: any, _t: any, _k: any, done: (v: undefined) => void) => new ClockComponent(tui, done, "clock"));
    },
  });

  pi.registerCommand("timer", {
    description: "Countdown timer. /timer 5m | /timer 2:30 | /timer 90s",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) { ctx.ui.notify("Timer requires interactive mode", "error"); return; }
      const dur = parseDuration((args || "").trim() || "5m");
      await ctx.ui.custom((tui: any, _t: any, _k: any, done: (v: undefined) => void) => new ClockComponent(tui, done, "timer", dur));
    },
  });

  pi.registerCommand("stopwatch", {
    description: "Stopwatch with laps. SPACE=start/stop, L=lap, R=reset.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) { ctx.ui.notify("Stopwatch requires interactive mode", "error"); return; }
      await ctx.ui.custom((tui: any, _t: any, _k: any, done: (v: undefined) => void) => new ClockComponent(tui, done, "stopwatch"));
    },
  });

  pi.registerCommand("pomodoro", {
    description: "Pomodoro timer — 25min focus / 5min break cycles. SPACE=pause, S=skip.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) { ctx.ui.notify("Pomodoro requires interactive mode", "error"); return; }
      await ctx.ui.custom((tui: any, _t: any, _k: any, done: (v: undefined) => void) => new ClockComponent(tui, done, "pomodoro"));
    },
  });
}
