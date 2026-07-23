import type { WebsiteQualityBlueprint } from "@/lib/server/ai/website-quality-blueprint";

const sequenceAssetMarker = "__HASSALI_SEQUENCE_ASSET__";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markedAsset(path: string) {
  return `${sequenceAssetMarker}./${path.replace(/^\.\//, "")}`;
}

export function renderWebsiteCinematicSection(blueprint: WebsiteQualityBlueprint) {
  if (!blueprint.cinematic.enabled) return "";
  return blueprint.cinematic.sequences.map((sequence, index) => {
    const firstChapter = sequence.chapters[0];
    return `      <section class="cinematic-sequence" id="${escapeHtml(sequence.id)}" data-cinematic-sequence="${escapeHtml(sequence.id)}" data-cinematic-frame="pending" data-cinematic-cache-size="0" style="--cinematic-scroll-length:${sequence.scrollLengthVh}vh" aria-labelledby="${escapeHtml(sequence.id)}-title">
        <div class="cinematic-sticky">
          <div class="cinematic-copy">
            <p class="eyebrow">${index === 0 ? "Cinematic story" : `Cinematic chapter ${index + 1}`}</p>
            <h2 id="${escapeHtml(sequence.id)}-title">${escapeHtml(firstChapter?.heading ?? blueprint.brand.tagline)}</h2>
            <p>${escapeHtml(sequence.narrativePurpose)}</p>
            <ol class="cinematic-chapters" aria-label="Story chapters">${sequence.chapters.map((chapter, chapterIndex) => `<li data-cinematic-chapter="${chapterIndex}"${chapterIndex === 0 ? ' class="is-active"' : ""}><strong>${escapeHtml(chapter.heading)}</strong><span>${escapeHtml(chapter.body)}</span></li>`).join("")}</ol>
          </div>
          <div class="cinematic-stage" role="img" aria-label="${escapeHtml(`Scroll-controlled ${blueprint.business.businessType} image sequence with all essential information repeated in the surrounding page.`)}">
            <img class="cinematic-fallback" data-cinematic-fallback src="./${escapeHtml(sequence.fallbackFrame)}" alt="${escapeHtml(`${blueprint.business.businessType} cinematic keyframe`)}" width="${sequence.dimensions.width ?? 1600}" height="${sequence.dimensions.height ?? 900}" />
            <canvas data-cinematic-canvas aria-hidden="true"></canvas>
            <p class="cinematic-status" aria-live="polite">${escapeHtml(firstChapter?.heading ?? "Cinematic story ready")}</p>
          </div>
        </div>
        <noscript><p class="cinematic-noscript">The cinematic sequence is represented by the keyframe above. Continue through the page for the complete story.</p></noscript>
      </section>`;
  }).join("\n");
}

export function renderWebsiteCinematicScriptTags(blueprint: WebsiteQualityBlueprint) {
  if (!blueprint.cinematic.enabled) return "";
  return '    <script src="./sequence-manifest.js" defer></script>\n    <script src="./sequence.js" defer></script>';
}

export function renderWebsiteCinematicCss() {
  return `
.cinematic-sequence { position: relative; min-height: var(--cinematic-scroll-length, 240vh); isolation: isolate; overflow: clip; }
.cinematic-sticky { position: sticky; top: 0; display: grid; grid-template-columns: minmax(16rem, .82fr) minmax(20rem, 1.18fr); gap: clamp(1.5rem, 4vw, 5rem); align-items: center; min-height: 100svh; padding: clamp(5rem, 9vw, 9rem) var(--page-gutter); background: var(--bg); }
.cinematic-copy { position: relative; z-index: 2; max-width: 42rem; }
.cinematic-copy h2 { max-width: 13ch; }
.cinematic-chapters { display: grid; gap: .7rem; margin: 2rem 0 0; padding: 0; list-style: none; }
.cinematic-chapters li { display: grid; gap: .2rem; padding: .8rem 0 .8rem 1rem; border-left: 2px solid var(--border); color: var(--muted); opacity: .58; transition: border-color 180ms ease, color 180ms ease, opacity 180ms ease; }
.cinematic-chapters li.is-active { border-color: var(--accent); color: var(--ink); opacity: 1; }
.cinematic-chapters span { font-size: .9rem; }
.cinematic-stage { position: relative; width: 100%; aspect-ratio: 16 / 10; overflow: hidden; border: 1px solid var(--border); border-radius: min(2rem, 5vw); background: var(--surface); box-shadow: var(--shadow); }
.cinematic-stage canvas, .cinematic-fallback { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; }
.cinematic-stage canvas { z-index: 2; pointer-events: none; opacity: 0; transition: opacity 220ms ease; }
.cinematic-fallback { z-index: 1; opacity: 1; transition: opacity 220ms ease; }
.cinematic-sequence.is-cinematic-ready .cinematic-stage canvas { opacity: 1; }
.cinematic-sequence.is-cinematic-ready .cinematic-fallback { opacity: 0; }
.cinematic-status { position: absolute; z-index: 3; right: 1rem; bottom: 1rem; max-width: calc(100% - 2rem); margin: 0; padding: .55rem .75rem; border-radius: .55rem; background: color-mix(in srgb, var(--bg) 82%, transparent); color: var(--ink); font-size: .78rem; }
.cinematic-noscript { margin: 0; padding: 1rem var(--page-gutter); }
@media (max-width: 760px) {
  .cinematic-sticky { grid-template-columns: 1fr; align-content: center; min-height: 100svh; padding-block: 4rem; }
  .cinematic-sequence { min-height: min(var(--cinematic-scroll-length, 180vh), 180svh); }
  .cinematic-sequence.is-cinematic-static { min-height: auto; }
  .cinematic-sequence.is-cinematic-static .cinematic-sticky { position: relative; min-height: auto; }
  .cinematic-chapters li:not(:first-child) { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .cinematic-sequence { min-height: auto; }
  .cinematic-sticky { position: relative; min-height: auto; }
  .cinematic-stage canvas { display: none; }
  .cinematic-fallback { opacity: 1 !important; }
  .cinematic-chapters li { transition: none; }
}
`;
}

function renderManifest(blueprint: WebsiteQualityBlueprint) {
  const manifest = {
    engine: "frame_sequence",
    version: 1,
    sequences: blueprint.cinematic.sequences.map((sequence) => ({
      ...sequence,
      fallbackFrame: markedAsset(sequence.fallbackFrame),
      reducedMotionStrategy: {
        ...sequence.reducedMotionStrategy,
        frame: markedAsset(sequence.reducedMotionStrategy.frame)
      },
      sourceFrames: sequence.sourceFrames.map(markedAsset)
    }))
  };
  return `window.__HASSALI_CINEMATIC_MANIFEST__ = ${JSON.stringify(manifest).replace(/</g, "\\u003c")};\n`;
}

function renderRuntime() {
  return `(() => {
  "use strict";
  const manifest = window.__HASSALI_CINEMATIC_MANIFEST__;
  if (!manifest || manifest.engine !== "frame_sequence" || !Array.isArray(manifest.sequences)) return;
  const marker = "${sequenceAssetMarker}";
  const resolveSource = (value) => String(value || "").startsWith(marker) ? String(value).slice(marker.length) : String(value || "");
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 760px)");
  const previousTeardowns = Array.isArray(window.__HASSALI_CINEMATIC_TEARDOWNS__) ? window.__HASSALI_CINEMATIC_TEARDOWNS__ : [];
  previousTeardowns.forEach((teardown) => { try { teardown(); } catch {} });
  const teardowns = [];
  window.__HASSALI_CINEMATIC_TEARDOWNS__ = teardowns;

  manifest.sequences.forEach((sequence) => {
    const mount = document.querySelector('[data-cinematic-sequence="' + CSS.escape(sequence.id) + '"]');
    if (!(mount instanceof HTMLElement) || mount.dataset.cinematicInitialized === "true") return;
    const canvas = mount.querySelector("[data-cinematic-canvas]");
    const stage = mount.querySelector(".cinematic-stage");
    const status = mount.querySelector(".cinematic-status");
    const chapters = Array.from(mount.querySelectorAll("[data-cinematic-chapter]"));
    if (!(canvas instanceof HTMLCanvasElement) || !(stage instanceof HTMLElement)) return;
    mount.dataset.cinematicInitialized = "true";
    const context = canvas.getContext("2d", { alpha: false });
    if (!context || !Array.isArray(sequence.sourceFrames) || sequence.sourceFrames.length === 0) return;
    const sources = sequence.sourceFrames.map(resolveSource);
    const cache = new Map();
    const pending = new Map();
    const failed = new Set();
    let active = true;
    let destroyed = false;
    let desiredFrame = sequence.playDirection === "reverse" ? sources.length - 1 : 0;
    let renderedFrame = -1;
    let raf = 0;
    let renderToken = 0;
    let resizeObserver = null;
    const cacheLimit = () => mobile.matches ? sequence.cache.mobileLimit : sequence.cache.desktopLimit;
    const stride = () => mobile.matches ? Math.max(1, sequence.mobileStrategy.stride || 1) : 1;

    const publishCacheSize = () => { mount.dataset.cinematicCacheSize = String(cache.size); };
    const evict = (center) => {
      if (cache.size <= cacheLimit()) { publishCacheSize(); return; }
      const candidates = Array.from(cache.entries())
        .filter(([index]) => index !== renderedFrame && index !== center)
        .sort((left, right) => Math.abs(right[0] - center) - Math.abs(left[0] - center) || left[1].lastUsed - right[1].lastUsed);
      while (cache.size > cacheLimit() && candidates.length) {
        const [index, entry] = candidates.shift();
        cache.delete(index);
        entry.image.src = "";
      }
      publishCacheSize();
    };
    const load = (index) => {
      const safeIndex = clamp(index, 0, sources.length - 1);
      const existing = cache.get(safeIndex);
      if (existing) { existing.lastUsed = performance.now(); return Promise.resolve(existing.image); }
      if (failed.has(safeIndex)) return Promise.resolve(null);
      if (pending.has(safeIndex)) return pending.get(safeIndex);
      const promise = new Promise((resolve) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = async () => {
          try { if (typeof image.decode === "function") await image.decode(); } catch {}
          pending.delete(safeIndex);
          if (destroyed) { image.src = ""; resolve(null); return; }
          cache.set(safeIndex, { image, lastUsed: performance.now() });
          evict(desiredFrame);
          resolve(image);
        };
        image.onerror = () => { pending.delete(safeIndex); failed.add(safeIndex); resolve(null); };
        image.src = sources[safeIndex];
      });
      pending.set(safeIndex, promise);
      return promise;
    };
    const nearest = async (index) => {
      const direct = await load(index);
      if (direct) return { image: direct, index };
      const radius = Math.min(8, sources.length - 1);
      for (let offset = 1; offset <= radius; offset += 1) {
        for (const candidate of [index - offset, index + offset]) {
          if (candidate < 0 || candidate >= sources.length) continue;
          const image = await load(candidate);
          if (image) return { image, index: candidate };
        }
      }
      return null;
    };
    const sizeCanvas = () => {
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, mobile.matches ? 1 : 1.5);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      return { height, width };
    };
    const draw = (image) => {
      const size = sizeCanvas();
      const scale = Math.max(size.width / image.naturalWidth, size.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.clearRect(0, 0, size.width, size.height);
      context.drawImage(image, (size.width - width) / 2, (size.height - height) / 2, width, height);
    };
    const updateChapter = (progress) => {
      let activeIndex = 0;
      sequence.chapters.forEach((chapter, index) => { if (progress >= chapter.progressStart && progress <= chapter.progressEnd + 0.0001) activeIndex = index; });
      chapters.forEach((chapter, index) => chapter.classList.toggle("is-active", index === activeIndex));
      if (status) status.textContent = sequence.chapters[activeIndex]?.heading || "Cinematic story";
    };
    const preload = (center) => {
      if (!active || destroyed) return;
      const start = Math.max(0, center - sequence.cache.retainBehind);
      const end = Math.min(sources.length - 1, center + sequence.cache.preloadAhead);
      for (let index = start; index <= end; index += stride()) void load(index);
    };
    const render = async (index) => {
      const token = ++renderToken;
      const result = await nearest(index);
      if (!result || destroyed || token !== renderToken) {
        if (!result && !destroyed) mount.classList.add("is-cinematic-fallback");
        return;
      }
      draw(result.image);
      renderedFrame = result.index;
      mount.dataset.cinematicFrame = String(result.index);
      mount.classList.add("is-cinematic-ready");
      mount.classList.remove("is-cinematic-fallback");
      preload(index);
      evict(index);
    };
    const schedule = () => {
      if (raf || destroyed || !active || desiredFrame === renderedFrame) return;
      raf = requestAnimationFrame(() => { raf = 0; void render(desiredFrame); });
    };
    const progress = () => {
      const rect = mount.getBoundingClientRect();
      const distance = Math.max(1, mount.offsetHeight - window.innerHeight);
      return clamp(-rect.top / distance, 0, 1);
    };
    const update = () => {
      const value = progress();
      const raw = Math.round(value * (sources.length - 1));
      const next = sequence.playDirection === "reverse" ? sources.length - 1 - raw : raw;
      const step = stride();
      desiredFrame = clamp(Math.round(next / step) * step, 0, sources.length - 1);
      updateChapter(value);
      schedule();
    };
    const onScroll = () => update();
    const onResize = () => { if (renderedFrame >= 0) void render(renderedFrame); update(); };
    const onContextLost = (event) => { event.preventDefault(); mount.classList.remove("is-cinematic-ready"); };
    const onContextRestored = () => { renderedFrame = -1; schedule(); };
    const observer = new IntersectionObserver((entries) => {
      active = entries.some((entry) => entry.isIntersecting || Math.abs(entry.boundingClientRect.top) < window.innerHeight * 2);
      if (active) { update(); preload(desiredFrame); }
    }, { rootMargin: "100% 0px" });
    observer.observe(mount);
    canvas.addEventListener("contextlost", onContextLost);
    canvas.addEventListener("contextrestored", onContextRestored);

    if (reducedMotion.matches || (mobile.matches && sequence.mobileStrategy.mode === "keyframes")) {
      mount.classList.add("is-cinematic-static");
      mount.dataset.cinematicFrame = "static";
    } else {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(stage);
      update();
      void render(desiredFrame);
    }

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("contextlost", onContextLost);
      canvas.removeEventListener("contextrestored", onContextRestored);
      cache.forEach((entry) => { entry.image.src = ""; });
      cache.clear();
      pending.clear();
      mount.dataset.cinematicInitialized = "false";
    };
    teardowns.push(destroy);
  });

  window.addEventListener("pagehide", () => teardowns.forEach((teardown) => teardown()), { once: true });
})();
`;
}

export function renderWebsiteCinematicFiles(blueprint: WebsiteQualityBlueprint) {
  if (!blueprint.cinematic.enabled) return {};
  return {
    "sequence-manifest.js": renderManifest(blueprint),
    "sequence.js": renderRuntime()
  };
}

export const WEBSITE_CINEMATIC_SEQUENCE_ASSET_MARKER = sequenceAssetMarker;
