import type { WebsiteSemanticResolution } from "@/lib/server/ai/website-niche-resolver";

export type Website3DRequirement = "allowed" | "forbidden" | "not_requested" | "required";

export type Website3DSceneRecipe =
  | "abstract_motion"
  | "architectural_volume"
  | "card_data_journey"
  | "material_orbit"
  | "mechanical_precision"
  | "none"
  | "product_pedestal"
  | "screen_light_stage"
  | "spatial_brand_world";

export type Website3DScrollStage = {
  cameraAction?: string;
  contentCue?: string;
  description: string;
  materialAction?: string;
  objectAction?: string;
  progressEnd: number;
  progressStart: number;
};

export type Website3DSceneSpec = {
  accessibility: {
    preservesContentWithoutCanvas: boolean;
    reducedMotionMode: "designed_fallback" | "static_scene";
    summary: string;
  };
  camera: {
    fieldOfView: number;
    initialPosition: [number, number, number];
    initialTarget: [number, number, number];
    motionStyle: "dolly" | "guided_path" | "orbit" | "pull_out" | "push_in" | "stationary";
  };
  composition: {
    depthLayers: number;
    focalObject: string;
    geometryLanguage: string[];
    particlePolicy: "minimal" | "moderate" | "none";
    supportingObjects: string[];
  };
  enabled: boolean;
  fallback: {
    description: string;
    type: "css_composition" | "static_media" | "svg";
  };
  id: string;
  interaction: {
    dragEnabled: boolean;
    hoverReactive: boolean;
    pointerReactive: boolean;
    scrollDriven: boolean;
  };
  lighting: {
    environment: string;
    exposure: number;
    fillLight: string;
    keyLight: string;
    rimLight?: string;
  };
  materials: {
    finish: "emissive" | "glass" | "gloss" | "matte" | "metallic" | "mixed";
    palette: string[];
  };
  narrative: string;
  performance: {
    desktopTier: "balanced" | "full";
    maxDevicePixelRatio: number;
    maxParticles: number;
    mobileTier: "fallback" | "reduced";
    pauseWhenOffscreen: boolean;
  };
  placement: {
    page: string;
    sectionId: string;
    sectionRole: "architecture_showcase" | "closing_scene" | "feature_journey" | "hero" | "product_stage" | "story_chapter";
  };
  purpose: string;
  recipe: Website3DSceneRecipe;
  requirement: Website3DRequirement;
  scrollStages: Website3DScrollStage[];
  seed: string;
  subject: string;
  variation: {
    cameraArc: number;
    layerCount: number;
    lightOffset: number;
    objectScale: number;
    rotationOffset: number;
    spread: number;
  };
};

type SceneBuildInput = {
  businessType: string;
  cinematicSequenceRequired?: boolean;
  domainId: string | null;
  palette: string[];
  page?: string;
  projectName: string;
  prompt: string;
  semantic?: WebsiteSemanticResolution;
};

type RecipeProfile = Pick<Website3DSceneSpec, "accessibility" | "camera" | "composition" | "fallback" | "lighting" | "materials" | "narrative" | "placement" | "purpose" | "scrollStages" | "subject">;

const forbiddenPattern = /(?:\b(?:no|without)\s+(?:(?:use|usage)\s+of\s+)?(?:(?:any|all|a|an|the)\s+)?(?:webgl|three(?:\.js)?|threejs|react\s+three\s+fiber|r3f|3d|three-dimensional|canvas)(?:\s+(?:animation|canvas|effects?|experience|runtime|scene))?\b|\b(?:disable|avoid|exclude|remove)\s+(?:(?:use|using|including)\s+)?(?:(?:any|all|a|an|the)\s+)?(?:webgl|three(?:\.js)?|threejs|react\s+three\s+fiber|r3f|3d|three-dimensional|canvas)(?:\s+(?:animation|canvas|effects?|experience|runtime|scene))?\b|\b(?:do\s+not|don't|must\s+not|never)\s+(?:(?:want|allow)\s+)?(?:(?:use|include|add|enable|generate|render)\s+)?(?:(?:any|all|a|an|the)\s+)?(?:webgl|three(?:\.js)?|threejs|react\s+three\s+fiber|r3f|3d|three-dimensional|canvas)(?:\s+(?:animation|canvas|effects?|experience|runtime|scene))?\b|\b(?:webgl|three(?:\.js)?|threejs|3d|canvas)\s+(?:off|disabled|forbidden|removed)\b|\bstatic\s+only\b|\bminimal\s+animation\s+only\b)/i;
const requiredPattern = /(?:\bwebgl\b|\bthree(?:\.js)?\b|\bthreejs\b|\breact\s+three\s+fiber\b|\br3f\b|\b3d\b|\bthree-dimensional\b|\binteractive\s+3d\b|\bspatial\s+brand\s+experience\b|\bscroll[-\s]controlled\s+(?:screen|product|object|scene|movement|volume)\b|\brotating\s+(?:3d\s+)?product\b)/i;
const immersivePattern = /\b(?:immersive|cinematic|spatial|interactive\s+spatial|camera\s+journey|product\s+stage|movement\s+story|scroll[-\s]driven\s+journey|scroll[-\s]controlled\s+rotation)\b/i;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hash(value: string) {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function unit(seed: number, offset: number) {
  let value = seed + Math.imul(offset + 1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
}

function sceneRecipe(text: string): Website3DSceneRecipe {
  if (/\b(?:abstract|experimental|generative\s+art|motion\s+art)\b/.test(text)) return "abstract_motion";
  if (/\b(?:tv|television|oled|qled|display|projector|home\s+cinema|screen)\b/.test(text)) return "screen_light_stage";
  if (/\b(?:watch|timepiece|horology|mechanical\s+movement|precision\s+instrument|industrial\s+instrument)\b/.test(text)) return "mechanical_precision";
  if (/\b(?:crm|saas|financial\s+workflow|workflow\s+software|payment\s+system|productivity\s+software|invoice\s+workflow)\b/.test(text)) return "card_data_journey";
  if (/\b(?:architecture|architectural|property|real\s+estate|interior\s+design|construction|building\s+forms?)\b/.test(text)) return "architectural_volume";
  if (/\b(?:skincare|skin\s+care|beauty|cosmetic|fragrance|perfume|packaging)\b/.test(text)) {
    return /\b(?:ingredient|material|orbit|molecule|formula)\b/.test(text) ? "material_orbit" : "product_pedestal";
  }
  if (/\b(?:creative\s+agency|fashion|event|campaign|brand\s+launch|artistic\s+portfolio|spatial\s+brand|immersive\s+story)\b/.test(text)) return "spatial_brand_world";
  return "none";
}

function semanticSceneRecipe(semantic: WebsiteSemanticResolution | undefined): Website3DSceneRecipe {
  const capabilities = normalize(semantic?.capabilities.join(" ") ?? "");
  if (!capabilities) return "none";
  if (/\b(?:display|screen|television)\b/.test(capabilities)) return "screen_light_stage";
  if (/\b(?:precision|mechanical product|timepiece|watch)\b/.test(capabilities)) return "mechanical_precision";
  if (/\b(?:saas|workflow|analytics|reporting|software)\b/.test(capabilities)) return "card_data_journey";
  if (/\b(?:architecture|spatial|built environment|property)\b/.test(capabilities)) return "architectural_volume";
  if (/\b(?:ingredient|coffee|beverage|food|material story|formula)\b/.test(capabilities)) return "material_orbit";
  if (/\b(?:computer hardware|modular hardware|technical product|equipment|drone|robotics|manufacturing|furniture|fashion|product showcase)\b/.test(capabilities)) return "product_pedestal";
  if (/\b(?:creative|storytelling|brand|media|spatial computing)\b/.test(capabilities)) return "spatial_brand_world";
  return "none";
}

function specializeProfile(profileValue: RecipeProfile, semantic: WebsiteSemanticResolution | undefined): RecipeProfile {
  if (!semantic || semantic.source === "generic_fallback") return profileValue;
  const subjectParts = semantic.visualSubjects.length
    ? semantic.visualSubjects.slice(0, 3)
    : [...semantic.products, ...semantic.services].slice(0, 3);
  const subject = subjectParts.join(", ") || semantic.semanticDomain;
  const geometryLanguage = semantic.visualSubjects.length
    ? semantic.visualSubjects.slice(0, 4)
    : profileValue.composition.geometryLanguage;
  const focalObject = semantic.visualSubjects[0] ?? semantic.products[0] ?? profileValue.composition.focalObject;
  const supportingObjects = semantic.visualSubjects.slice(1, 4).length
    ? semantic.visualSubjects.slice(1, 4)
    : semantic.products.slice(1, 4).length
      ? semantic.products.slice(1, 4)
      : profileValue.composition.supportingObjects;
  return {
    ...profileValue,
    accessibility: {
      ...profileValue.accessibility,
      summary: `A procedural scene presents ${subject} while all essential ${semantic.semanticDomain} information remains available in HTML.`
    },
    composition: {
      ...profileValue.composition,
      focalObject,
      geometryLanguage,
      supportingObjects
    },
    fallback: {
      ...profileValue.fallback,
      description: `Designed static artwork representing ${subject}.`
    },
    narrative: `${semantic.semanticDomain} is explained through ${subject}, using the reusable scene family without pretending to reproduce a real product.`,
    purpose: `Make ${semantic.semanticDomain} easier to understand through a focused spatial explanation of ${subject}.`,
    subject
  };
}

export function interpretWebsite3DRequirement(input: Pick<SceneBuildInput, "businessType" | "cinematicSequenceRequired" | "domainId" | "prompt">): Website3DRequirement {
  if (forbiddenPattern.test(input.prompt)) return "forbidden";
  if (requiredPattern.test(input.prompt)) return "required";
  if (input.cinematicSequenceRequired) return "not_requested";
  const text = normalize(`${input.prompt} ${input.businessType} ${input.domainId ?? ""}`);
  if (immersivePattern.test(input.prompt) && sceneRecipe(text) !== "none") return "allowed";
  return "not_requested";
}

function scrollStages(recipe: Website3DSceneRecipe): Website3DScrollStage[] {
  const stages: Record<Exclude<Website3DSceneRecipe, "none">, Array<[string, string, string]>> = {
    abstract_motion: [
      ["Establish the visual rhythm", "Bring the primary forms into a calm composition", "A clear opening composition"],
      ["Reveal depth", "Separate the layered forms without obscuring the page", "Depth becomes visible"],
      ["Shift the point of view", "Guide the camera past the focal form", "The composition changes perspective"],
      ["Resolve the composition", "Return the forms to a balanced closing state", "Continue into the next section"]
    ],
    architectural_volume: [
      ["Read the overall massing", "Establish the principal building volumes", "See the project as a whole"],
      ["Separate the layers", "Lift floor plates and structural frames", "Understand how the spaces relate"],
      ["Move through the section", "Guide the camera between light and solid volumes", "Follow the spatial sequence"],
      ["Return to the complete form", "Resolve the volumes into the final composition", "Continue to the project details"]
    ],
    card_data_journey: [
      ["See the working overview", "Arrange the key workflow cards into one readable system", "One connected workflow"],
      ["Follow the relationship", "Bring ownership and follow-up cards forward", "Clear next actions"],
      ["Connect work to money", "Reveal invoice, payment, and progress layers", "Billing stays in context"],
      ["Resolve the operating picture", "Settle every card into a coherent product view", "Continue to product details"]
    ],
    material_orbit: [
      ["Meet the product form", "Establish the vessel and pedestal", "A restrained product introduction"],
      ["Reveal the material story", "Move ingredient-inspired forms around the vessel", "Texture and formulation context"],
      ["Shift the light", "Guide highlights across the material surfaces", "See finish and form"],
      ["Return to stillness", "Resolve the orbit into a calm final composition", "Continue to product details"]
    ],
    mechanical_precision: [
      ["Read the complete dial", "Establish the calibrated rings and markers", "The movement at a glance"],
      ["Separate the mechanism", "Offset rings, hands, and regulating forms", "See the mechanical layers"],
      ["Follow measured motion", "Rotate related parts at controlled opposing rates", "Understand regulation and timing"],
      ["Resolve the calibre", "Align the layers into a precise final state", "Continue to specifications"]
    ],
    product_pedestal: [
      ["Meet the product form", "Establish the original vessel on its pedestal", "A calm product introduction"],
      ["Reveal proportion", "Turn the vessel and lift the supporting forms", "See shape and balance"],
      ["Follow material highlights", "Move controlled light across the surfaces", "Understand finish and texture"],
      ["Return to the hero view", "Resolve the scene into a composed product portrait", "Continue to product details"]
    ],
    screen_light_stage: [
      ["See the display in context", "Establish the framed screen and room-light layers", "Start with the complete viewing setup"],
      ["Separate display depth", "Offset panel, frame, and light surfaces", "Compare how the screen is constructed"],
      ["Compare viewing conditions", "Shift the camera and emissive balance", "Consider contrast, brightness, and room light"],
      ["Resolve the viewing setup", "Return the layers to a complete display", "Continue to buying guidance"]
    ],
    spatial_brand_world: [
      ["Enter the brand space", "Establish the primary forms and typographic planes", "Meet the central brand idea"],
      ["Reveal the system", "Separate the layers into a coherent visual language", "See how the elements relate"],
      ["Move through the story", "Guide the camera between the focal forms", "Follow the creative progression"],
      ["Resolve the world", "Settle the forms around the closing message", "Continue into the work"]
    ]
  };
  return (recipe === "none" ? [] : stages[recipe]).map(([description, objectAction, contentCue], index, all) => ({
    cameraAction: index === 0 ? "establish" : index === all.length - 1 ? "release" : "guided transition",
    contentCue,
    description,
    objectAction,
    progressEnd: (index + 1) / all.length,
    progressStart: index / all.length
  }));
}

function recipeProfile(recipe: Website3DSceneRecipe, palette: string[]): RecipeProfile {
  const profiles: Record<Exclude<Website3DSceneRecipe, "none">, Omit<RecipeProfile, "materials" | "scrollStages">> = {
    abstract_motion: {
      accessibility: { preservesContentWithoutCanvas: true, reducedMotionMode: "designed_fallback", summary: "An abstract spatial composition supporting the surrounding brand story." },
      camera: { fieldOfView: 43, initialPosition: [0, 0, 8], initialTarget: [0, 0, 0], motionStyle: "guided_path" },
      composition: { depthLayers: 4, focalObject: "layered sculptural form", geometryLanguage: ["ribbons", "planes", "frames"], particlePolicy: "minimal", supportingObjects: ["depth planes", "light frame"] },
      fallback: { description: "Layered geometric artwork preserving the spatial composition.", type: "svg" },
      lighting: { environment: "soft spatial ambient", exposure: 1, fillLight: "broad neutral fill", keyLight: "angled brand-color key", rimLight: "restrained edge light" },
      narrative: "A controlled abstract scene adds depth to the brand story without replacing its accessible content.",
      placement: { page: "index.html", sectionId: "brand-world", sectionRole: "story_chapter" },
      purpose: "Support an explicitly abstract brand narrative with controlled spatial motion.",
      subject: "abstract brand forms"
    },
    architectural_volume: {
      accessibility: { preservesContentWithoutCanvas: true, reducedMotionMode: "designed_fallback", summary: "Original building masses, floor plates, and structural lines reveal an architectural concept." },
      camera: { fieldOfView: 38, initialPosition: [6.4, 4.2, 9.6], initialTarget: [0, 0.6, 0], motionStyle: "guided_path" },
      composition: { depthLayers: 5, focalObject: "original building mass", geometryLanguage: ["building volumes", "floor plates", "structural frames", "section lines"], particlePolicy: "none", supportingObjects: ["light volumes", "plan grid"] },
      fallback: { description: "Layered architectural elevation and section artwork.", type: "svg" },
      lighting: { environment: "daylit studio", exposure: 1.05, fillLight: "cool reflected fill", keyLight: "directional daylight", rimLight: "warm edge light" },
      narrative: "Original procedural volumes separate and resolve to explain spatial organization without copying a real building.",
      placement: { page: "index.html", sectionId: "spatial-volume", sectionRole: "architecture_showcase" },
      purpose: "Explain massing, structure, and spatial sequence through original procedural volumes.",
      subject: "architectural massing and spatial sequence"
    },
    card_data_journey: {
      accessibility: { preservesContentWithoutCanvas: true, reducedMotionMode: "designed_fallback", summary: "Accessible workflow cards connect customer activity, follow-up, billing, and progress." },
      camera: { fieldOfView: 41, initialPosition: [0, 0.2, 9], initialTarget: [0, 0, 0], motionStyle: "push_in" },
      composition: { depthLayers: 5, focalObject: "workflow overview card", geometryLanguage: ["interface cards", "connecting paths", "status rails"], particlePolicy: "none", supportingObjects: ["follow-up card", "invoice card", "payment card", "progress card"] },
      fallback: { description: "Accessible stacked workflow cards with CSS depth and connectors.", type: "css_composition" },
      lighting: { environment: "clean product studio", exposure: 1, fillLight: "soft interface fill", keyLight: "clear neutral key", rimLight: "subtle accent edge" },
      narrative: "Semantic HTML cards remain readable while the WebGL layer adds depth to the product journey.",
      placement: { page: "index.html", sectionId: "workflow-journey", sectionRole: "feature_journey" },
      purpose: "Connect relationship, workflow, and financial context in one spatial product journey.",
      subject: "customer and financial workflow"
    },
    material_orbit: {
      accessibility: { preservesContentWithoutCanvas: true, reducedMotionMode: "designed_fallback", summary: "A restrained vessel and ingredient-inspired forms describe the product's material story." },
      camera: { fieldOfView: 36, initialPosition: [0, 0.4, 7.2], initialTarget: [0, 0.3, 0], motionStyle: "orbit" },
      composition: { depthLayers: 4, focalObject: "original product vessel", geometryLanguage: ["vessel", "pedestal", "ingredient orbit", "soft arcs"], particlePolicy: "minimal", supportingObjects: ["ingredient forms", "material rings"] },
      fallback: { description: "Soft product vessel and ingredient-orbit artwork.", type: "svg" },
      lighting: { environment: "soft material studio", exposure: 1.08, fillLight: "diffuse cream fill", keyLight: "large soft key", rimLight: "subtle translucent edge" },
      narrative: "An original abstract vessel and ingredient-inspired forms create a measured material story without claiming to reproduce a real product.",
      placement: { page: "index.html", sectionId: "material-story", sectionRole: "product_stage" },
      purpose: "Present an original product form and material story with restrained motion.",
      subject: "abstract skincare vessel and material forms"
    },
    mechanical_precision: {
      accessibility: { preservesContentWithoutCanvas: true, reducedMotionMode: "designed_fallback", summary: "Calibrated rings, markers, and original mechanical forms explain measured movement." },
      camera: { fieldOfView: 36, initialPosition: [0, 0, 7.4], initialTarget: [0, 0, 0], motionStyle: "push_in" },
      composition: { depthLayers: 6, focalObject: "calibrated dial assembly", geometryLanguage: ["calibrated rings", "dial markers", "hands", "bridges", "rotor"], particlePolicy: "minimal", supportingObjects: ["regulating ring", "precision ticks", "mechanical bridge"] },
      fallback: { description: "Technical dial, ring, and marker linework.", type: "svg" },
      lighting: { environment: "dark precision studio", exposure: 1.08, fillLight: "restrained cool fill", keyLight: "narrow metallic key", rimLight: "warm precision edge" },
      narrative: "Original calibrated geometry separates into meaningful layers before resolving into a complete mechanical composition.",
      placement: { page: "index.html", sectionId: "movement-story", sectionRole: "story_chapter" },
      purpose: "Explain mechanical layering and precision without imitating a protected watch design.",
      subject: "mechanical movement and calibrated dial"
    },
    product_pedestal: {
      accessibility: { preservesContentWithoutCanvas: true, reducedMotionMode: "designed_fallback", summary: "An original abstract product vessel sits on a softly lit pedestal." },
      camera: { fieldOfView: 35, initialPosition: [0, 0.35, 7], initialTarget: [0, 0.35, 0], motionStyle: "orbit" },
      composition: { depthLayers: 4, focalObject: "original abstract vessel", geometryLanguage: ["vessel", "pedestal", "soft shadow", "controlled arc"], particlePolicy: "none", supportingObjects: ["pedestal rings", "material highlights"] },
      fallback: { description: "Original vessel and pedestal product artwork.", type: "svg" },
      lighting: { environment: "soft product studio", exposure: 1.08, fillLight: "broad cream fill", keyLight: "large soft key", rimLight: "gentle material edge" },
      narrative: "A restrained original vessel and pedestal communicate product character without pretending to reproduce an exact supplied model.",
      placement: { page: "index.html", sectionId: "product-pedestal", sectionRole: "product_stage" },
      purpose: "Present an original product form through controlled light, proportion, and material.",
      subject: "abstract product vessel"
    },
    screen_light_stage: {
      accessibility: { preservesContentWithoutCanvas: true, reducedMotionMode: "designed_fallback", summary: "Layered display frames and light surfaces compare screen depth and viewing conditions." },
      camera: { fieldOfView: 40, initialPosition: [0, 0.1, 8.4], initialTarget: [0, 0, 0], motionStyle: "guided_path" },
      composition: { depthLayers: 5, focalObject: "framed display plane", geometryLanguage: ["screen planes", "display frames", "emissive surfaces", "pixel grid", "reflection plane"], particlePolicy: "none", supportingObjects: ["light beam", "room plane", "comparison frame"] },
      fallback: { description: "Layered display-frame artwork with controlled screen glow.", type: "svg" },
      lighting: { environment: "cinematic viewing room", exposure: 1.02, fillLight: "low neutral fill", keyLight: "emissive screen key", rimLight: "controlled warm edge" },
      narrative: "Display layers separate to compare depth, brightness, and room-light context before resolving into a complete viewing setup.",
      placement: { page: "index.html", sectionId: "display-stage", sectionRole: "product_stage" },
      purpose: "Compare screen technology and viewing conditions through meaningful display geometry.",
      subject: "display technology and room light"
    },
    spatial_brand_world: {
      accessibility: { preservesContentWithoutCanvas: true, reducedMotionMode: "designed_fallback", summary: "Layered brand forms and typographic planes create an original spatial identity." },
      camera: { fieldOfView: 42, initialPosition: [0.5, 0.2, 8.2], initialTarget: [0, 0, 0], motionStyle: "guided_path" },
      composition: { depthLayers: 5, focalObject: "primary brand form", geometryLanguage: ["typographic planes", "ribbons", "grids", "layered surfaces"], particlePolicy: "minimal", supportingObjects: ["brand ribbon", "depth grid", "supporting planes"] },
      fallback: { description: "Layered brand-form and typographic-plane artwork.", type: "svg" },
      lighting: { environment: "editorial brand space", exposure: 1, fillLight: "broad neutral fill", keyLight: "brand-color key", rimLight: "restrained graphic edge" },
      narrative: "An original spatial system turns the brand's visual language into a guided scene while the page retains all essential meaning.",
      placement: { page: "index.html", sectionId: "brand-world", sectionRole: "story_chapter" },
      purpose: "Extend an explicit immersive brand story into a controlled spatial composition.",
      subject: "brand identity and creative story"
    }
  };
  if (recipe === "none") {
    return {
      accessibility: { preservesContentWithoutCanvas: true, reducedMotionMode: "designed_fallback", summary: "No interactive scene is included." },
      camera: { fieldOfView: 40, initialPosition: [0, 0, 7], initialTarget: [0, 0, 0], motionStyle: "stationary" },
      composition: { depthLayers: 0, focalObject: "none", geometryLanguage: [], particlePolicy: "none", supportingObjects: [] },
      fallback: { description: "No scene fallback is required.", type: "static_media" },
      lighting: { environment: "none", exposure: 1, fillLight: "none", keyLight: "none" },
      materials: { finish: "matte", palette },
      narrative: "No interactive scene is requested.",
      placement: { page: "index.html", sectionId: "none", sectionRole: "hero" },
      purpose: "No interactive scene is requested.",
      scrollStages: [],
      subject: "none"
    };
  }
  const profile = profiles[recipe];
  return {
    ...profile,
    materials: {
      finish: recipe === "mechanical_precision" ? "metallic" : recipe === "screen_light_stage" ? "emissive" : recipe === "product_pedestal" || recipe === "material_orbit" ? "mixed" : "matte",
      palette
    },
    scrollStages: scrollStages(recipe)
  };
}

function disabledSpec(input: SceneBuildInput, requirement: Website3DRequirement): Website3DSceneSpec {
  const seedSource = normalize(`${input.projectName}:${input.domainId ?? input.businessType}:${input.page ?? "index.html"}:none`);
  const profile = recipeProfile("none", input.palette);
  return {
    ...profile,
    enabled: false,
    id: "website-scene-disabled",
    interaction: { dragEnabled: false, hoverReactive: false, pointerReactive: false, scrollDriven: false },
    performance: { desktopTier: "balanced", maxDevicePixelRatio: 1, maxParticles: 0, mobileTier: "fallback", pauseWhenOffscreen: true },
    recipe: "none",
    requirement,
    seed: `scene-${hash(seedSource).toString(16).padStart(8, "0")}`,
    variation: { cameraArc: 0, layerCount: 0, lightOffset: 0, objectScale: 1, rotationOffset: 0, spread: 0 }
  };
}

export function validateWebsite3DSceneSpec(spec: Website3DSceneSpec) {
  const issues: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.id)) issues.push("Scene ID must be a stable kebab-case identifier.");
  if (spec.enabled && spec.recipe === "none") issues.push("An enabled scene requires a concrete recipe.");
  if (!spec.enabled && spec.recipe !== "none") issues.push("A disabled scene cannot retain an active recipe.");
  if ((spec.requirement === "forbidden" || spec.requirement === "not_requested") && spec.enabled) issues.push("A forbidden or unrequested scene cannot be enabled.");
  if (spec.interaction.scrollDriven && spec.scrollStages.length < 3) issues.push("A scroll-driven scene needs at least three narrative stages.");
  spec.scrollStages.forEach((stage, index) => {
    if (stage.progressStart < 0 || stage.progressEnd > 1 || stage.progressEnd <= stage.progressStart) issues.push(`Scroll stage ${index + 1} has an invalid progress range.`);
    if (index > 0 && stage.progressStart < (spec.scrollStages[index - 1]?.progressEnd ?? 0)) issues.push(`Scroll stage ${index + 1} overlaps the previous stage.`);
  });
  if (spec.enabled && !spec.fallback.description.trim()) issues.push("An enabled scene requires a designed fallback.");
  if (spec.enabled && !spec.accessibility.summary.trim()) issues.push("An enabled scene requires an accessible summary.");
  if (spec.enabled && !spec.accessibility.preservesContentWithoutCanvas) issues.push("Scene meaning must remain available without canvas.");
  if (spec.performance.maxDevicePixelRatio < 0.5 || spec.performance.maxDevicePixelRatio > 2) issues.push("Device-pixel-ratio policy is outside the supported range.");
  if (spec.performance.maxParticles < 0 || spec.performance.maxParticles > 80) issues.push("Particle policy exceeds the WEBSITE performance budget.");
  if (spec.composition.depthLayers < 0 || spec.composition.depthLayers > 8) issues.push("Scene depth exceeds the supported layer budget.");
  return { issues, valid: issues.length === 0 };
}

export function buildWebsite3DSceneSpec(input: SceneBuildInput): Website3DSceneSpec {
  const requirement = interpretWebsite3DRequirement(input);
  const semanticText = normalize(`${input.prompt} ${input.businessType} ${input.domainId ?? ""}`);
  let recipe = sceneRecipe(semanticText);
  if (recipe === "none") recipe = semanticSceneRecipe(input.semantic);
  if (requirement === "forbidden" || requirement === "not_requested") return disabledSpec(input, requirement);
  if (recipe === "none" && requirement === "required") recipe = /\bproduct\b/.test(semanticText) ? "product_pedestal" : "spatial_brand_world";
  if (recipe === "none") return disabledSpec(input, "not_requested");

  const page = input.page ?? "index.html";
  const seedSource = normalize(`${input.projectName}:${input.domainId ?? input.businessType}:${recipe}:${page}:${input.prompt}`);
  const seedValue = hash(seedSource);
  const profile = specializeProfile(recipeProfile(recipe, input.palette), input.semantic);
  const scrollDriven = /\b(?:scroll|journey|movement\s+story|camera\s+journey|interactive\s+3d)\b/i.test(input.prompt);
  const spec: Website3DSceneSpec = {
    ...profile,
    composition: {
      ...profile.composition,
      depthLayers: Math.min(8, Math.max(3, profile.composition.depthLayers + Math.floor(unit(seedValue, 1) * 2)))
    },
    enabled: true,
    id: profile.placement.sectionId,
    interaction: {
      dragEnabled: false,
      hoverReactive: !scrollDriven,
      pointerReactive: !/\b(?:minimal\s+motion|low[-\s]spec|lightweight)\b/i.test(input.prompt),
      scrollDriven
    },
    performance: {
      desktopTier: /\b(?:low[-\s]spec|lightweight|performance[-\s]first)\b/i.test(input.prompt) ? "balanced" : "full",
      maxDevicePixelRatio: 1.5,
      maxParticles: profile.composition.particlePolicy === "none" ? 0 : profile.composition.particlePolicy === "minimal" ? 18 : 36,
      mobileTier: "fallback",
      pauseWhenOffscreen: true
    },
    recipe,
    requirement,
    seed: `scene-${seedValue.toString(16).padStart(8, "0")}`,
    variation: {
      cameraArc: Number((0.28 + unit(seedValue, 2) * 0.34).toFixed(3)),
      layerCount: Math.min(8, Math.max(3, profile.composition.depthLayers + Math.floor(unit(seedValue, 3) * 2))),
      lightOffset: Number((-1.4 + unit(seedValue, 4) * 2.8).toFixed(3)),
      objectScale: Number((0.9 + unit(seedValue, 5) * 0.22).toFixed(3)),
      rotationOffset: Number((unit(seedValue, 6) * Math.PI * 2).toFixed(3)),
      spread: Number((0.86 + unit(seedValue, 7) * 0.42).toFixed(3))
    }
  };
  const validation = validateWebsite3DSceneSpec(spec);
  return validation.valid ? spec : disabledSpec(input, requirement);
}
