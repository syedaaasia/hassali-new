"use client";

import { type AnimationEvent, type CSSProperties, useEffect, useRef, useState } from "react";
import {
  calculateMascotCoinRange,
  calculateMascotTrack,
  getNextMascotThrowSide,
  HASSALI_ACTIVITY_MASCOT_ASSET,
  type MascotThrowSide
} from "@/lib/assistant-activity";

type HassaliActivityMascotProps = {
  active: boolean;
  label: string;
};

type MascotStageStyle = CSSProperties & {
  "--hassali-coin-frames": number;
  "--hassali-coin-range-negative": string;
  "--hassali-coin-range-negative-mid": string;
  "--hassali-coin-range-positive": string;
  "--hassali-coin-range-positive-mid": string;
  "--hassali-coin-strip": string;
  "--hassali-mascot-left": string;
  "--hassali-mascot-travel": string;
  "--hassali-throw-frames": number;
  "--hassali-throw-strip": string;
  "--hassali-walk-frames": number;
  "--hassali-walk-strip": string;
};

type MascotMediaQuery = {
  addEventListener: (type: "change", listener: () => void) => void;
  matches: boolean;
  removeEventListener: (type: "change", listener: () => void) => void;
};

type MascotStageElement = {
  clientWidth: number;
  style: {
    setProperty: (name: string, value: string) => void;
  };
};

type MascotWindow = {
  matchMedia: (query: string) => MascotMediaQuery;
  ResizeObserver: new (callback: () => void) => {
    disconnect: () => void;
    observe: (element: MascotStageElement) => void;
  };
};

export function HassaliActivityMascot({ active, label }: HassaliActivityMascotProps) {
  const stageRef = useRef<MascotStageElement | null>(null);
  const lastThrowSideRef = useRef<MascotThrowSide | null>(null);
  const [throwSide, setThrowSide] = useState<MascotThrowSide | null>(null);
  const isThrowing = throwSide !== null;

  useEffect(() => {
    if (!active) {
      lastThrowSideRef.current = null;
      setThrowSide(null);
      return;
    }

    const stage = stageRef.current;
    const browserWindow = (globalThis as { window?: MascotWindow }).window;
    if (!stage || !browserWindow) return;

    const updateTrack = () => {
      const track = calculateMascotTrack(stage.clientWidth);
      const coinRange = calculateMascotCoinRange(stage.clientWidth);
      stage.style.setProperty("--hassali-mascot-left", `${track.safePadding}px`);
      stage.style.setProperty("--hassali-mascot-travel", `${track.travel}px`);
      stage.style.setProperty("--hassali-coin-range-positive", `${coinRange}px`);
      stage.style.setProperty(
        "--hassali-coin-range-positive-mid",
        `${Math.round(coinRange * 0.52)}px`
      );
      stage.style.setProperty("--hassali-coin-range-negative", `${-coinRange}px`);
      stage.style.setProperty(
        "--hassali-coin-range-negative-mid",
        `${-Math.round(coinRange * 0.52)}px`
      );
    };

    updateTrack();
    const observer = new browserWindow.ResizeObserver(updateTrack);
    observer.observe(stage);

    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const browserWindow = (globalThis as { window?: MascotWindow }).window;
    if (!browserWindow) return;

    const reducedMotion = browserWindow.matchMedia("(prefers-reduced-motion: reduce)");
    const stopThrowForReducedMotion = () => {
      if (reducedMotion.matches) setThrowSide(null);
    };

    stopThrowForReducedMotion();
    reducedMotion.addEventListener("change", stopThrowForReducedMotion);
    return () => {
      reducedMotion.removeEventListener("change", stopThrowForReducedMotion);
    };
  }, [active]);

  if (!active) return null;

  const style: MascotStageStyle = {
    "--hassali-coin-frames": HASSALI_ACTIVITY_MASCOT_ASSET.coinFrames,
    "--hassali-coin-range-negative": "-50px",
    "--hassali-coin-range-negative-mid": "-26px",
    "--hassali-coin-range-positive": "50px",
    "--hassali-coin-range-positive-mid": "26px",
    "--hassali-coin-strip": `url("${HASSALI_ACTIVITY_MASCOT_ASSET.coinStripPath}")`,
    "--hassali-mascot-left": "8px",
    "--hassali-mascot-travel": "64px",
    "--hassali-throw-frames": HASSALI_ACTIVITY_MASCOT_ASSET.throwFrames,
    "--hassali-throw-strip": `url("${HASSALI_ACTIVITY_MASCOT_ASSET.throwStripPath}")`,
    "--hassali-walk-frames": HASSALI_ACTIVITY_MASCOT_ASSET.walkFrames,
    "--hassali-walk-strip": `url("${HASSALI_ACTIVITY_MASCOT_ASSET.walkStripPath}")`
  };

  const handlePatrolIteration = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target && event.animationName === "hassali-activity-patrol") {
      const nextSide = getNextMascotThrowSide(lastThrowSideRef.current);
      lastThrowSideRef.current = nextSide;
      setThrowSide(nextSide);
    }
  };

  const handleThrowComplete = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.animationName === "hassali-activity-throw-frames") {
      setThrowSide(null);
    }
  };

  return (
    <div
      aria-atomic="true"
      aria-label={label}
      aria-live="polite"
      className="hassali-activity-stage"
      data-hassali-activity="pre-output"
      ref={stageRef as never}
      role="status"
      style={style}
    >
      <div
        aria-hidden="true"
        className={`hassali-activity-mascot${
          throwSide ? ` is-throwing throw-from-${throwSide}` : ""
        }`}
        data-coin-count={isThrowing ? 1 : 0}
        data-throw-side={throwSide ?? "none"}
        onAnimationIteration={handlePatrolIteration}
      >
        <div className="hassali-activity-facing">
          <div className="hassali-activity-walk-sprite" />
          {isThrowing ? (
            <div className="hassali-activity-throw-sprite" onAnimationEnd={handleThrowComplete} />
          ) : null}
        </div>
        {isThrowing ? (
          <div className="hassali-activity-coin-flight">
            <div className="hassali-activity-coin-sprite" />
            <span className="hassali-activity-coin-label">Thinking...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
