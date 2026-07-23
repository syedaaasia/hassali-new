import type {
  WebsitePalette,
  WebsiteSceneBlueprint
} from "@/lib/server/ai/website-quality-blueprint";

export const THREE_VERSION = "0.185.0";
export const GSAP_VERSION = "3.15.0";
export const THREE_MODULE_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`;

type WebsiteSceneRenderContext = {
  brand: {
    generatedName: string;
    palette: WebsitePalette;
  };
  scene: WebsiteSceneBlueprint;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sceneCopy(scene: WebsiteSceneBlueprint) {
  const labels: Record<WebsiteSceneBlueprint["recipe"], { eyebrow: string; heading: string }> = {
    abstract_motion: { eyebrow: "A visual rhythm", heading: "Move through an original spatial composition" },
    architectural_volume: { eyebrow: "Space in layers", heading: "Read the project from massing to movement" },
    card_data_journey: { eyebrow: "Workflow journey", heading: "Connect the work behind every number" },
    material_orbit: { eyebrow: "Material story", heading: "See form, texture, and routine in balance" },
    mechanical_precision: { eyebrow: "Inside the movement", heading: "Follow precision through every layer" },
    none: { eyebrow: "", heading: "" },
    product_pedestal: { eyebrow: "Product in focus", heading: "Let proportion and material speak clearly" },
    screen_light_stage: { eyebrow: "Display technology", heading: "Compare the picture in the room it serves" },
    spatial_brand_world: { eyebrow: "Brand in space", heading: "Move through the idea behind the work" }
  };
  return {
    ...labels[scene.recipe],
    body: scene.spec.narrative,
    steps: scene.spec.scrollStages.map((stage) => stage.contentCue ?? stage.description)
  };
}

function renderSemanticCards(scene: WebsiteSceneBlueprint) {
  if (scene.recipe !== "card_data_journey") return "";
  const cards = [
    ["Follow-up", "Owner assigned", "Today"],
    ["Invoice", "Ready to review", "PKR 48,000"],
    ["Payment", "Progress recorded", "72%"],
    ["Savings goal", "On track", "Quarterly plan"]
  ];
  return `<div class="scene-semantic-cards" aria-label="Product workflow overview">
${cards.map(([title, detail, value]) => `            <article><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p></article>`).join("\n")}
          </div>`;
}

export function renderWebsiteSceneSection(blueprint: WebsiteSceneRenderContext) {
  const scene = blueprint.scene;
  if (scene.engine === "none" || scene.engine === "css_svg") return "";
  const copy = sceneCopy(scene);
  return `<section class="scene-section" id="${escapeHtml(scene.mountSectionId)}" data-scene-id="${escapeHtml(scene.id)}" data-scene-engine="${escapeHtml(scene.engine)}" data-scene-recipe="${escapeHtml(scene.recipe)}" data-scene-scroll-driven="${scene.spec.interaction.scrollDriven ? "true" : "false"}" data-scene-mobile-tier="${escapeHtml(scene.spec.performance.mobileTier)}" data-scene-max-objects="${scene.performanceBudget.maxObjects}">
        <div class="scene-content">
          <p class="eyebrow">${escapeHtml(copy.eyebrow)}</p>
          <h2>${escapeHtml(copy.heading)}</h2>
          <p>${escapeHtml(copy.body)}</p>
          <ol class="scene-steps">
${copy.steps.map((step, index) => `            <li data-scene-step="${index + 1}"><span>0${index + 1}</span>${escapeHtml(step)}</li>`).join("\n")}
          </ol>
          ${renderSemanticCards(scene)}
        </div>
        <div class="scene-viewport" role="img" aria-label="${escapeHtml(scene.spec.accessibility.summary)}" data-scene-viewport>
          <canvas aria-hidden="true" data-scene-canvas></canvas>
          <img class="scene-fallback" src="./${escapeHtml(scene.fallback.asset)}" width="1200" height="900" alt="" data-scene-fallback />
        </div>
        <noscript><p class="scene-noscript">${escapeHtml(scene.spec.accessibility.summary)}</p></noscript>
      </section>`;
}

function renderSceneFallback(blueprint: WebsiteSceneRenderContext) {
  const p = blueprint.brand.palette;
  const recipe = blueprint.scene.recipe;
  const motifs: Record<WebsiteSceneBlueprint["recipe"], string> = {
    abstract_motion: '<path d="M170 620C310 170 720 150 1040 420" fill="none" stroke="currentColor" stroke-width="30"/><path d="M120 700 470 220l250 510 360-490" fill="none" stroke="currentColor" stroke-width="18"/><circle cx="780" cy="315" r="90"/>',
    architectural_volume: '<path d="M160 690V360l210-95v425M400 690V205l320 125v360M755 690V390l270-85v385" fill="none" stroke="currentColor" stroke-width="26"/><path d="M80 720h1040M210 520h720" stroke="currentColor" stroke-width="15"/>',
    card_data_journey: '<rect x="120" y="150" width="410" height="230" rx="34"/><rect x="600" y="205" width="460" height="250" rx="34"/><rect x="270" y="505" width="420" height="220" rx="34"/><path d="M205 315h235M675 305h310M675 370h210M345 600h270M530 300C610 300 570 600 690 600" fill="none" stroke="currentColor" stroke-width="22"/>',
    material_orbit: '<rect x="480" y="270" width="240" height="360" rx="105"/><ellipse cx="600" cy="690" rx="310" ry="70" fill="none" stroke="currentColor" stroke-width="24"/><circle cx="340" cy="365" r="58"/><circle cx="850" cy="430" r="76"/><path d="M275 590c155-410 545-390 680-70" fill="none" stroke="currentColor" stroke-width="20"/>',
    mechanical_precision: '<circle cx="600" cy="450" r="300" fill="none" stroke="currentColor" stroke-width="32"/><circle cx="600" cy="450" r="210" fill="none" stroke="currentColor" stroke-width="22"/><circle cx="770" cy="510" r="105" fill="none" stroke="currentColor" stroke-width="18"/><path d="M600 450 600 235M600 450l155 100" stroke="currentColor" stroke-width="25" stroke-linecap="round"/>',
    none: "",
    product_pedestal: '<rect x="485" y="245" width="230" height="390" rx="92"/><rect x="525" y="170" width="150" height="105" rx="35"/><ellipse cx="600" cy="700" rx="330" ry="85" fill="none" stroke="currentColor" stroke-width="26"/><path d="M315 610c120-250 470-360 620-80" fill="none" stroke="currentColor" stroke-width="20"/>',
    screen_light_stage: '<rect x="105" y="135" width="650" height="410" rx="24" fill="none" stroke="currentColor" stroke-width="30"/><rect x="220" y="220" width="650" height="410" rx="24" fill="none" stroke="currentColor" stroke-width="18"/><path d="M430 545v105M330 655h200M760 260l275-85v470L760 560Z" fill="none" stroke="currentColor" stroke-width="22"/>',
    spatial_brand_world: '<path d="m145 220 365-90v540l-365 90Z" fill="none" stroke="currentColor" stroke-width="25"/><path d="m650 150 385 125v465L650 620Z" fill="none" stroke="currentColor" stroke-width="25"/><path d="M270 530c180-280 430-300 660-80" fill="none" stroke="currentColor" stroke-width="22"/>'
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-labelledby="title desc"><title id="title">${escapeHtml(blueprint.brand.generatedName)} scene artwork</title><desc id="desc">${escapeHtml(blueprint.scene.spec.fallback.description)}</desc><rect width="1200" height="900" rx="48" fill="${escapeHtml(p.background)}"/><g color="${escapeHtml(p.ink)}" fill="${escapeHtml(p.accent)}" opacity=".88">${motifs[recipe]}</g><circle cx="1030" cy="130" r="90" fill="${escapeHtml(p.accentAlt)}" opacity=".72"/></svg>`;
}

function threeColor(value: string) {
  const rgba = value.match(/^rgba\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*[^)]+\)$/i);
  return rgba ? `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})` : value;
}

function threeSceneScript(blueprint: WebsiteSceneRenderContext) {
  const scene = blueprint.scene;
  const p = blueprint.brand.palette;
  const runtimeConfig = {
    camera: scene.spec.camera,
    desktopTier: scene.spec.performance.desktopTier,
    exposure: scene.spec.lighting.exposure,
    maxDevicePixelRatio: scene.spec.performance.maxDevicePixelRatio,
    maxParticles: scene.spec.performance.maxParticles,
    pauseWhenOffscreen: scene.spec.performance.pauseWhenOffscreen,
    pointerReactive: scene.spec.interaction.pointerReactive,
    recipe: scene.recipe,
    scrollDriven: scene.spec.interaction.scrollDriven,
    scrollStages: scene.spec.scrollStages,
    subject: scene.spec.subject,
    seed: Number.parseInt(scene.spec.seed.slice(-8), 16) || 1,
    variation: scene.spec.variation
  };
  return `(() => {
  "use strict";
  const THREE_URL = ${JSON.stringify(THREE_MODULE_URL)};
  const config = ${JSON.stringify(runtimeConfig)};
  const recipe = config.recipe;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const lowPower = window.matchMedia("(max-width: ${scene.mobilePolicy.useFallbackBelow}px)");
  const mounts = Array.from(document.querySelectorAll(${JSON.stringify(scene.mountSelector)}));
  const teardownRegistry = window.__hassaliSceneTeardowns || (window.__hassaliSceneTeardowns = new Set());

  const material = (THREE, color, finish = "matte") => new THREE.MeshStandardMaterial({
    color,
    emissive: finish === "emissive" ? color : 0x000000,
    emissiveIntensity: finish === "emissive" ? .34 : 0,
    metalness: finish === "metal" ? .72 : .08,
    opacity: finish === "glass" ? .78 : 1,
    roughness: finish === "glass" ? .18 : finish === "metal" ? .3 : .7,
    side: THREE.DoubleSide,
    transparent: finish === "glass"
  });
  const addMesh = (group, geometry, meshMaterial, position, rotation = [0, 0, 0], scale = [1, 1, 1]) => {
    const mesh = new group.userData.THREE.Mesh(geometry, meshMaterial);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    mesh.userData.basePosition = position.slice();
    mesh.userData.baseRotation = rotation.slice();
    mesh.userData.baseScale = scale.slice();
    group.add(mesh);
    return mesh;
  };
  const addParticles = (THREE, group, color) => {
    if (!config.maxParticles) return;
    const positions = [];
    for (let index = 0; index < config.maxParticles; index += 1) {
      const angle = index * 2.399963 + config.variation.rotationOffset;
      const radius = 1.8 + (index % 5) * .22;
      positions.push(Math.cos(angle) * radius, Math.sin(angle * .73) * 1.45, Math.sin(angle) * radius * .5);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, opacity: .42, size: .035, transparent: true }));
    points.userData.decorative = true;
    group.add(points);
  };
  const buildRecipe = (THREE, group) => {
    group.userData.THREE = THREE;
    const accent = ${JSON.stringify(threeColor(p.accent))};
    const accentAlt = ${JSON.stringify(threeColor(p.accentAlt))};
    const ink = ${JSON.stringify(threeColor(p.ink))};
    const surface = ${JSON.stringify(threeColor(p.surface))};
    const meshes = [];
    const layers = config.variation.layerCount;
    const spread = config.variation.spread;
    const scale = config.variation.objectScale;
    if (recipe === "screen_light_stage") {
      for (let index = 0; index < Math.min(4, layers); index += 1) {
        const z = -.18 * index;
        meshes.push(addMesh(group, new THREE.BoxGeometry(4.2 - index * .18, 2.35 - index * .1, .11), material(THREE, index === 0 ? ink : surface, index === 0 ? "metal" : "glass"), [0, 0, z], [0, 0, 0], [scale, scale, scale]));
        meshes.push(addMesh(group, new THREE.PlaneGeometry(3.72 - index * .16, 1.9 - index * .08), material(THREE, index % 2 ? accentAlt : accent, "emissive"), [0, 0, z + .065], [0, 0, 0], [scale, scale, scale]));
      }
      meshes.push(addMesh(group, new THREE.PlaneGeometry(5.8, 3.4), material(THREE, accentAlt, "glass"), [0, -.15, -1.15], [0, 0, 0]));
    } else if (recipe === "mechanical_precision") {
      for (let index = 0; index < Math.min(5, layers); index += 1) {
        meshes.push(addMesh(group, new THREE.TorusGeometry(1.05 + index * .34, .045 + index * .009, 12, 72), material(THREE, index % 2 ? accent : ink, "metal"), [0, 0, index * -.13], [0, 0, config.variation.rotationOffset * (index % 2 ? .12 : -.08)]));
      }
      for (let index = 0; index < 12; index += 1) {
        const angle = index / 12 * Math.PI * 2;
        meshes.push(addMesh(group, new THREE.BoxGeometry(.055, .28, .055), material(THREE, surface), [Math.sin(angle) * 2.45, Math.cos(angle) * 2.45, .1], [0, 0, -angle]));
      }
      meshes.push(addMesh(group, new THREE.BoxGeometry(.07, 1.8, .07), material(THREE, accentAlt, "metal"), [0, .62, .26], [0, 0, -.38]));
      meshes.push(addMesh(group, new THREE.BoxGeometry(.06, 1.25, .06), material(THREE, surface, "metal"), [.42, .22, .3], [0, 0, 1.04]));
    } else if (recipe === "card_data_journey") {
      const positions = [[-1.65, .95, .1], [1.55, .5, -.55], [-.75, -1.05, .45], [1.75, -1.25, -.15], [0, 0, -1.1]];
      positions.slice(0, Math.min(5, layers)).forEach((position, index) => meshes.push(addMesh(group, new THREE.BoxGeometry(2.35, 1.28, .12), material(THREE, index % 2 ? surface : accent, "glass"), position, [.04 * index, -.1 * index, -.035 * index], [scale, scale, scale])));
      meshes.push(addMesh(group, new THREE.TorusGeometry(2.25, .025, 8, 64, Math.PI * 1.35), material(THREE, accentAlt, "emissive"), [0, -.1, -1.25], [Math.PI / 2, 0, -.35]));
    } else if (recipe === "product_pedestal" || recipe === "material_orbit") {
      const subject = String(config.subject || "").toLowerCase();
      const hardwareSubject = /computer|hardware|chassis|graphics|gpu|cooling|processor|component/.test(subject);
      if (hardwareSubject && recipe === "product_pedestal") {
        meshes.push(addMesh(group, new THREE.BoxGeometry(2.25, 3.25, 1.65), material(THREE, ink, "metal"), [0, .05, 0], [0, -.12, 0], [scale, scale, scale]));
        meshes.push(addMesh(group, new THREE.BoxGeometry(1.9, 2.75, .045), material(THREE, surface, "glass"), [0, .08, .86], [0, -.12, 0]));
        meshes.push(addMesh(group, new THREE.BoxGeometry(1.55, .42, .18), material(THREE, accent, "emissive"), [.05, .32, 1.02], [0, -.12, 0]));
        meshes.push(addMesh(group, new THREE.BoxGeometry(1.35, .08, .72), material(THREE, accentAlt, "metal"), [0, -.68, .45], [0, -.12, 0]));
        for (let index = 0; index < 3; index += 1) {
          meshes.push(addMesh(group, new THREE.TorusGeometry(.32, .055, 10, 36), material(THREE, index % 2 ? accent : accentAlt, "emissive"), [0, .82 - index * .82, .96], [Math.PI / 2, 0, -.12]));
        }
        meshes.push(addMesh(group, new THREE.BoxGeometry(2.85, .18, 2.15), material(THREE, surface, "matte"), [0, -1.72, 0]));
      } else {
        meshes.push(addMesh(group, new THREE.CylinderGeometry(.75, .92, 2.7, 40), material(THREE, surface, "glass"), [0, .25, 0], [0, 0, 0], [scale, scale, scale]));
        meshes.push(addMesh(group, new THREE.CylinderGeometry(.42, .52, .55, 36), material(THREE, accent, "metal"), [0, 1.85, 0]));
        meshes.push(addMesh(group, new THREE.CylinderGeometry(1.8, 2.15, .32, 48), material(THREE, ink, "matte"), [0, -1.55, 0]));
      }
      if (recipe === "material_orbit") {
        for (let index = 0; index < Math.min(5, layers); index += 1) {
          const angle = index / Math.min(5, layers) * Math.PI * 2 + config.variation.rotationOffset;
          meshes.push(addMesh(group, new THREE.SphereGeometry(.18 + (index % 2) * .08, 18, 14), material(THREE, index % 2 ? accentAlt : accent, "glass"), [Math.cos(angle) * 2.1, Math.sin(angle * 1.4) * .75, Math.sin(angle) * 1.1]));
        }
      }
    } else if (recipe === "architectural_volume") {
      for (let index = 0; index < Math.min(6, layers); index += 1) {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const height = 1.8 + ((config.seed + index * 7) % 17) / 10;
        meshes.push(addMesh(group, new THREE.BoxGeometry(.95 + column * .12, height, 1.15), material(THREE, index % 3 === 1 ? accent : surface, index % 2 ? "glass" : "matte"), [(column - 1) * 1.55 * spread, (height - 2.4) * .35 + row * .35, -row * 1.1 - column * .18], [0, (column - 1) * .08, 0]));
        meshes.push(addMesh(group, new THREE.BoxGeometry(1.25, .045, 1.42), material(THREE, ink, "metal"), [(column - 1) * 1.55 * spread, -1.4 + row * .35, -row * 1.1 - column * .18]));
      }
    } else if (recipe === "spatial_brand_world" || recipe === "abstract_motion") {
      for (let index = 0; index < Math.min(6, layers); index += 1) {
        const x = (index - (Math.min(6, layers) - 1) / 2) * .95 * spread;
        const geometry = index % 3 === 2 ? new THREE.TorusGeometry(.68, .12, 12, 42) : new THREE.BoxGeometry(1.35, 2.2, .08);
        meshes.push(addMesh(group, geometry, material(THREE, index % 2 ? surface : accent, index % 3 === 0 ? "glass" : "matte"), [x, (index % 2 ? -.25 : .3), -index * .28], [0, (index - 2) * -.13, (index % 2 ? -.08 : .08)]));
      }
    }
    addParticles(THREE, group, accentAlt);
    return meshes;
  };

  const initMount = async (mount) => {
    if (!(mount instanceof HTMLElement) || mount.dataset.sceneInitialized === "true") return;
    mount.dataset.sceneInitialized = "true";
    const canvas = mount.querySelector("[data-scene-canvas]");
    const fallback = mount.querySelector("[data-scene-fallback]");
    const setFallback = (visible) => { if (fallback instanceof HTMLElement) fallback.hidden = !visible; mount.classList.toggle("is-scene-fallback", visible); };
    mount.classList.add("is-scene-loading");
    mount.dataset.sceneReady = "false";
    mount.dataset.scenePinActive = "false";
    if (!(canvas instanceof HTMLCanvasElement) || reducedMotion.matches || lowPower.matches) { setFallback(true); mount.classList.remove("is-scene-loading"); return; }
    let disposed = false;
    try {
      const THREE = await import(THREE_URL);
      if (disposed) return;
      const viewport = mount.querySelector("[data-scene-viewport]");
      if (!(viewport instanceof HTMLElement)) throw new Error("Scene viewport missing");
      const scene3d = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(config.camera.fieldOfView, 1, ${scene.camera.near}, ${scene.camera.far});
      camera.position.set(...config.camera.initialPosition);
      camera.lookAt(...config.camera.initialTarget);
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: config.desktopTier === "full", powerPreference: "low-power" });
      renderer.setClearColor(0x000000, 0);
      if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
      if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = config.exposure;
      const group = new THREE.Group();
      group.rotation.y = config.variation.rotationOffset * .08;
      scene3d.add(group);
      const meshes = buildRecipe(THREE, group);
      scene3d.add(new THREE.AmbientLight(0xffffff, ${scene.lighting.ambient}));
      const key = new THREE.DirectionalLight(${JSON.stringify(threeColor(p.surface))}, ${scene.lighting.key}); key.position.set(4 + config.variation.lightOffset, 5, 6); scene3d.add(key);
      const rim = new THREE.PointLight(${JSON.stringify(threeColor(p.accent))}, ${scene.lighting.rim}, 20); rim.position.set(-4 + config.variation.lightOffset, 2, 3); scene3d.add(rim);
      const resize = () => { const rect = viewport.getBoundingClientRect(); if (!rect.width || !rect.height) return; const ratio = Math.min(window.devicePixelRatio || 1, config.maxDevicePixelRatio); renderer.setPixelRatio(ratio); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); mount.dataset.sceneCanvasSize = Math.round(rect.width) + "x" + Math.round(rect.height); };
      const observer = new ResizeObserver(resize); observer.observe(viewport); resize();
      let frame = 0; let running = false; let inViewport = true; let contextLost = false; let progress = 0; let fallbackScrollHandler = null; let pointerX = 0; let pointerY = 0;
      const applyProgress = (value) => {
        progress = Math.max(0, Math.min(1, value));
        const reveal = Math.sin(progress * Math.PI);
        const stageIndex = Math.min(config.scrollStages.length - 1, Math.max(0, Math.floor(progress * config.scrollStages.length)));
        meshes.forEach((mesh, index) => {
          const basePosition = mesh.userData.basePosition || [0, 0, 0];
          const baseRotation = mesh.userData.baseRotation || [0, 0, 0];
          mesh.position.set(...basePosition);
          mesh.rotation.set(...baseRotation);
          if (recipe === "screen_light_stage") { mesh.position.x += (index % 2 ? 1 : -1) * reveal * .22 * (1 + index * .08); mesh.position.z += reveal * index * .06; mesh.rotation.y += (index % 2 ? -1 : 1) * progress * .08; }
          else if (recipe === "mechanical_precision") { mesh.position.z += reveal * (index % 5) * .055; mesh.rotation.z += progress * (index % 2 ? -1 : 1) * (.35 + index * .015); }
          else if (recipe === "card_data_journey") { mesh.position.z += reveal * (index % 4) * .18; mesh.position.y += Math.sin(progress * Math.PI + index) * .12; mesh.rotation.y += (index - 2) * progress * .035; }
          else if (recipe === "product_pedestal" || recipe === "material_orbit") { mesh.rotation.y += progress * (index ? .55 : .95); if (index > 2) mesh.position.y += Math.sin(progress * Math.PI * 2 + index) * .14; }
          else if (recipe === "architectural_volume") { mesh.position.y += reveal * (index % 3) * .18; mesh.position.x += (index % 2 ? 1 : -1) * reveal * .09 * index; }
          else { mesh.position.z += reveal * index * .08; mesh.rotation.y += (index % 2 ? -1 : 1) * progress * .24; }
        });
        const initial = config.camera.initialPosition;
        camera.position.x = initial[0] + Math.sin(progress * Math.PI) * config.variation.cameraArc;
        camera.position.y = initial[1] + Math.sin(progress * Math.PI * 2) * .12;
        camera.position.z = initial[2] - reveal * .62;
        camera.lookAt(...config.camera.initialTarget);
        group.position.z = progress * .18;
        mount.dataset.sceneProgress = progress.toFixed(3);
        mount.dataset.sceneStage = String(Math.max(0, stageIndex));
        mount.dataset.sceneObjectState = [group.rotation.y, group.position.y, group.position.z].map((item) => item.toFixed(3)).join(",");
        mount.dataset.sceneCameraState = [camera.position.x, camera.position.y, camera.position.z].map((item) => item.toFixed(3)).join(",");
      };
      const render = (now) => { if (disposed || !running) return; const time = now * .00025; if (!config.scrollDriven) group.rotation.y = config.variation.rotationOffset * .08 + Math.sin(time) * .16; group.rotation.x = Math.sin(time * .7) * .045 + pointerY * .04; group.position.x = pointerX * .08; renderer.render(scene3d, camera); frame = requestAnimationFrame(render); };
      const pause = () => { if (!running) return; running = false; cancelAnimationFrame(frame); mount.dataset.scenePaused = "true"; };
      const resume = () => { if (disposed || running || contextLost || document.hidden || !inViewport) return; running = true; mount.dataset.scenePaused = "false"; frame = requestAnimationFrame(render); };
      const onVisibility = () => document.hidden ? pause() : resume();
      const onPointer = (event) => { const rect = mount.getBoundingClientRect(); pointerX = ((event.clientX - rect.left) / Math.max(1, rect.width) - .5) * 2; pointerY = ((event.clientY - rect.top) / Math.max(1, rect.height) - .5) * 2; };
      const onContextLost = (event) => { event.preventDefault(); contextLost = true; pause(); mount.dataset.sceneContext = "lost"; mount.dataset.sceneReady = "false"; mount.classList.remove("is-scene-ready"); setFallback(true); };
      const onContextRestored = () => { if (disposed) return; contextLost = false; resize(); applyProgress(progress); renderer.render(scene3d, camera); setFallback(false); mount.dataset.sceneContext = "restored"; mount.dataset.sceneReady = "true"; mount.classList.add("is-scene-ready"); resume(); };
      document.addEventListener("visibilitychange", onVisibility);
      canvas.addEventListener("webglcontextlost", onContextLost);
      canvas.addEventListener("webglcontextrestored", onContextRestored);
      if (config.pointerReactive) mount.addEventListener("pointermove", onPointer, { passive: true });
      const visibilityObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => entries.forEach((entry) => { inViewport = entry.isIntersecting; if (inViewport) resume(); else pause(); }), { rootMargin: "180px" }) : null;
      const controller = {
        mount() { applyProgress(progress); resize(); resume(); },
        pause,
        resize,
        resume,
        setProgress: applyProgress,
        destroy() {
          if (disposed) return;
          disposed = true;
          pause();
          observer.disconnect();
          visibilityObserver?.disconnect();
          document.removeEventListener("visibilitychange", onVisibility);
          window.removeEventListener("pagehide", controller.destroy);
          canvas.removeEventListener("webglcontextlost", onContextLost);
          canvas.removeEventListener("webglcontextrestored", onContextRestored);
          if (config.pointerReactive) mount.removeEventListener("pointermove", onPointer);
          if (fallbackScrollHandler) { window.removeEventListener("scroll", fallbackScrollHandler); window.removeEventListener("resize", fallbackScrollHandler); }
          group.traverse((object) => { object.geometry?.dispose?.(); if (Array.isArray(object.material)) object.material.forEach((item) => item.dispose?.()); else object.material?.dispose?.(); });
          renderer.dispose();
          renderer.forceContextLoss?.();
          teardownRegistry.delete(controller.destroy);
          mount.dataset.sceneInitialized = "false";
          mount.dataset.sceneReady = "false";
          mount.classList.remove("is-scene-loading", "is-scene-ready");
          delete mount.__hassaliSceneController;
        }
      };
      teardownRegistry.add(controller.destroy);
      window.addEventListener("pagehide", controller.destroy, { once: true });
      mount.__hassaliSceneController = controller;
      visibilityObserver?.observe(mount);
      if (config.scrollDriven) {
        fallbackScrollHandler = () => { const rect = mount.getBoundingClientRect(); const start = window.innerHeight * .82; const distance = Math.max(window.innerHeight * .75, rect.height); controller.setProgress((start - rect.top) / distance); };
        window.addEventListener("scroll", fallbackScrollHandler, { passive: true });
        window.addEventListener("resize", fallbackScrollHandler, { passive: true });
        fallbackScrollHandler();
      } else controller.setProgress(0);
      renderer.render(scene3d, camera);
      setFallback(false);
      mount.classList.remove("is-scene-loading", "is-scene-failed");
      mount.classList.add("is-scene-ready");
      mount.dataset.sceneReady = "true";
      controller.mount();
    } catch (_error) { mount.dataset.sceneReady = "false"; mount.classList.remove("is-scene-loading", "is-scene-ready"); mount.classList.add("is-scene-failed"); setFallback(true); }
  };
  const lazy = "IntersectionObserver" in window ? new IntersectionObserver((entries, observer) => entries.forEach((entry) => { if (entry.isIntersecting) { observer.unobserve(entry.target); void initMount(entry.target); } }), { rootMargin: "240px" }) : null;
  mounts.forEach((mount) => lazy ? lazy.observe(mount) : void initMount(mount));
})();\n`;
}

export function renderWebsiteSceneFiles(blueprint: WebsiteSceneRenderContext) {
  if (blueprint.scene.engine === "none" || blueprint.scene.engine === "css_svg") return {};
  return {
    [blueprint.scene.fallback.asset]: renderSceneFallback(blueprint),
    "scene.js": threeSceneScript(blueprint)
  };
}

export function renderWebsiteSceneScriptTags(blueprint: WebsiteSceneRenderContext) {
  if (blueprint.scene.engine === "none" || blueprint.scene.engine === "css_svg") return "";
  return `    <script src="./scene.js" defer></script>`;
}
