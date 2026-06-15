"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

type SpotlightStyle = CSSProperties & {
  "--spotlight-x": string;
  "--spotlight-y": string;
};
type SpotlightRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};
type SpotlightElement = {
  addEventListener: (
    type: "pointermove",
    listener: (event: SpotlightPointerEvent) => void,
    options?: { passive?: boolean }
  ) => void;
  getBoundingClientRect: () => SpotlightRect;
  removeEventListener: (
    type: "pointermove",
    listener: (event: SpotlightPointerEvent) => void
  ) => void;
};
type SpotlightTextElement = {
  style: {
    setProperty: (name: string, value: string) => void;
  };
};
type SpotlightPointerEvent = {
  clientX: number;
  clientY: number;
};
type SpotlightWindow = {
  cancelAnimationFrame: (handle: number) => void;
  matchMedia: (query: string) => { matches: boolean };
  requestAnimationFrame: (callback: () => void) => number;
};

function canUseInteractiveSpotlight() {
  const browserWindow = (globalThis as { window?: SpotlightWindow }).window;

  if (!browserWindow) {
    return false;
  }

  const reducedMotion = browserWindow.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = browserWindow.matchMedia("(hover: hover) and (pointer: fine)").matches;

  return finePointer && !reducedMotion;
}

export function InteractiveSpotlightFooter() {
  const containerRef = useRef<SpotlightElement | null>(null);
  const textRef = useRef<SpotlightTextElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const positionRef = useRef({ x: 50, y: 50 });

  useEffect(() => {
    const browserWindow = (globalThis as { window?: SpotlightWindow }).window;
    const container = containerRef.current;
    const text = textRef.current;

    if (!browserWindow || !container || !text || !canUseInteractiveSpotlight()) {
      return undefined;
    }

    const updateSpotlight = () => {
      frameRef.current = null;
      text.style.setProperty("--spotlight-x", `${positionRef.current.x}%`);
      text.style.setProperty("--spotlight-y", `${positionRef.current.y}%`);
    };

    const onPointerMove = (event: SpotlightPointerEvent) => {
      const rect = container.getBoundingClientRect();

      positionRef.current = {
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100
      };

      if (frameRef.current === null) {
        frameRef.current = browserWindow.requestAnimationFrame(updateSpotlight);
      }
    };

    container.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      container.removeEventListener("pointermove", onPointerMove);

      if (frameRef.current !== null) {
        browserWindow.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const spotlightStyle: SpotlightStyle = {
    "--spotlight-x": "50%",
    "--spotlight-y": "50%",
    backgroundImage:
      "radial-gradient(circle 220px at var(--spotlight-x) var(--spotlight-y), #00ff87 0%, #60efff 48%, rgb(63, 63, 70) 100%)"
  };

  return (
    <section
      aria-label="Hassali spotlight footer"
      className="relative w-full overflow-hidden bg-[#090a0f] px-4 py-14 select-none sm:py-16 lg:py-20"
      ref={containerRef as never}
    >
      <div className="relative mx-auto flex w-full max-w-[1600px] items-center justify-center">
        <h2
          className="bg-clip-text text-center text-[20vw] font-black uppercase leading-[0.78] tracking-[-0.09em] text-transparent transition-[filter] duration-300 ease-out sm:text-[17vw] lg:text-[13vw]"
          ref={textRef as never}
          style={spotlightStyle}
        >
          HASSALI
        </h2>
      </div>
    </section>
  );
}
