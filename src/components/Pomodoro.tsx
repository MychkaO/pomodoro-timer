"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "focus" | "short" | "long";

const DURATIONS: Record<Mode, number> = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
const LABELS: Record<Mode, string> = { focus: "Focus Time", short: "Short Break", long: "Long Break" };
const RING_COLORS: Record<Mode, string> = { focus: "#ff7e67", short: "#6be0c9", long: "#d49bff" };
const MODE_BUTTONS: { key: Mode; label: string }[] = [
  { key: "focus", label: "Focus" },
  { key: "short", label: "Short Break" },
  { key: "long", label: "Long Break" },
];
const RADIUS = 90;
const CIRC = 2 * Math.PI * RADIUS;

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function playDing() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const ring = (freq: number, delay: number, peak: number, length: number) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + length);
        osc.start();
        osc.stop(ctx.currentTime + length);
      }, delay);
    };
    ring(880, 0, 0.25, 0.9);
    ring(1175, 180, 0.22, 0.8);
  } catch {
    // audio unavailable
  }
}

function notify(text: string) {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    new Notification("Pomodoro", { body: text });
  }
}

export default function Pomodoro() {
  const [mode, setModeState] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState(0);
  const [sessionInCycle, setSessionInCycle] = useState(0);

  const modeRef = useRef<Mode>("focus");
  const remainingRef = useRef(DURATIONS.focus);
  const sessionInCycleRef = useRef(0);
  const completedRef = useRef(0);
  const endTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // localStorage is a browser-only store unavailable during SSR, so the saved
    // counts can only be hydrated here, after mount.
    const storedCompleted = Number(localStorage.getItem("pomodoro_completed") || 0);
    const storedCycle = Number(localStorage.getItem("pomodoro_cycle") || 0);
    completedRef.current = storedCompleted;
    sessionInCycleRef.current = storedCycle;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompletedPomodoros(storedCompleted);
    setSessionInCycle(storedCycle);
  }, []);

  const stopTicking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const setMode = useCallback(
    (newMode: Mode, resetTimer = true) => {
      modeRef.current = newMode;
      setModeState(newMode);
      if (resetTimer) {
        stopTicking();
        setRunning(false);
        remainingRef.current = DURATIONS[newMode];
        setRemaining(remainingRef.current);
      }
    },
    [stopTicking]
  );

  const completePhase = useCallback(() => {
    stopTicking();
    setRunning(false);
    playDing();

    if (modeRef.current === "focus") {
      completedRef.current += 1;
      setCompletedPomodoros(completedRef.current);
      localStorage.setItem("pomodoro_completed", String(completedRef.current));

      sessionInCycleRef.current += 1;
      if (sessionInCycleRef.current >= 4) {
        sessionInCycleRef.current = 0;
        setSessionInCycle(0);
        localStorage.setItem("pomodoro_cycle", "0");
        notify("Great work! Time for a long break.");
        setMode("long");
      } else {
        setSessionInCycle(sessionInCycleRef.current);
        localStorage.setItem("pomodoro_cycle", String(sessionInCycleRef.current));
        notify("Pomodoro done! Take a short break.");
        setMode("short");
      }
    } else {
      notify("Break over. Ready to focus?");
      setMode("focus");
    }
  }, [setMode, stopTicking]);

  const tick = useCallback(() => {
    if (endTimeRef.current == null) return;
    const next = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
    remainingRef.current = next;
    setRemaining(next);
    if (next <= 0) {
      completePhase();
    }
  }, [completePhase]);

  const startTicking = useCallback(() => {
    endTimeRef.current = Date.now() + remainingRef.current * 1000;
    intervalRef.current = setInterval(tick, 250);
  }, [tick]);

  const toggleStart = useCallback(() => {
    if (running) {
      setRunning(false);
      stopTicking();
    } else {
      setRunning(true);
      startTicking();
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, [running, startTicking, stopTicking]);

  const resetCurrent = useCallback(() => {
    stopTicking();
    setRunning(false);
    remainingRef.current = DURATIONS[modeRef.current];
    setRemaining(remainingRef.current);
  }, [stopTicking]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        toggleStart();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleStart]);

  useEffect(() => stopTicking, [stopTicking]);

  useEffect(() => {
    document.title = running ? `${formatTime(remaining)} · Pomodoro` : "Pomodoro";
  }, [running, remaining]);

  const dashOffset = CIRC * (remaining / DURATIONS[mode]);

  return (
    <div
      data-mode={mode}
      className="pomodoro-bg flex min-h-screen items-center justify-center overflow-x-hidden bg-fixed text-[#f5f3ff]"
    >
      <div className="w-full max-w-[480px] px-8 py-10 text-center">
        <div className="mb-9 flex justify-center gap-2 rounded-full bg-white/[0.06] p-1.5 backdrop-blur-md">
          {MODE_BUTTONS.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setMode(btn.key)}
              className={`flex-1 rounded-full px-3.5 py-2.5 text-[13px] font-semibold tracking-wide transition-all duration-300 ${
                mode === btn.key
                  ? "bg-white/[0.14] text-[#f5f3ff] shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
                  : "text-white/60 hover:text-[#f5f3ff]"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="relative mx-auto mb-8 h-[300px] w-[300px] max-[380px]:h-60 max-[380px]:w-60">
          <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
            <circle cx="100" cy="100" r={RADIUS} className="fill-none stroke-white/[0.12]" strokeWidth={10} />
            <circle
              className="ring-progress fill-none"
              cx="100"
              cy="100"
              r={RADIUS}
              strokeWidth={10}
              strokeLinecap="round"
              stroke={RING_COLORS[mode]}
              strokeDasharray={CIRC.toFixed(2)}
              strokeDashoffset={dashOffset.toFixed(2)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <div className="text-6xl font-bold tracking-wide tabular-nums max-[380px]:text-5xl">
              {formatTime(remaining)}
            </div>
            <div className="text-[13px] uppercase tracking-[0.15em] text-white/60">{LABELS[mode]}</div>
            <div className="mt-1 text-xs text-white/60">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className={`mx-[3px] inline-block h-[7px] w-[7px] rounded-full transition-colors duration-300 ${
                    i < sessionInCycle ? "bg-[#ffd56b]" : "bg-white/[0.12]"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2 flex justify-center gap-3.5">
          <button
            onClick={resetCurrent}
            title="Reset"
            className="rounded-full bg-white/[0.08] px-[22px] py-4 text-[15px] font-semibold text-[#f5f3ff] transition-colors hover:bg-white/[0.16]"
          >
            ↺
          </button>
          <button
            onClick={toggleStart}
            className="rounded-full bg-gradient-to-br from-[#ff7e67] to-[#ffd56b] px-12 py-4 text-base font-semibold text-[#1a0e0a] shadow-[0_8px_24px_rgba(255,126,103,0.35)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {running ? "Pause" : "Start"}
          </button>
          <button
            onClick={completePhase}
            title="Skip"
            className="rounded-full bg-white/[0.08] px-[22px] py-4 text-[15px] font-semibold text-[#f5f3ff] transition-colors hover:bg-white/[0.16]"
          >
            ⏭
          </button>
        </div>

        <div className="mt-9 text-[12.5px] tracking-wide text-white/60">
          Completed today: <strong className="font-bold text-[#f5f3ff]">{completedPomodoros}</strong> pomodoros
        </div>
        <footer className="mt-[18px] text-[11px] text-white/35">Tip: tab stays accurate even if minimized</footer>
      </div>
    </div>
  );
}
