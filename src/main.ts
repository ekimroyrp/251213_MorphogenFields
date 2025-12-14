import "./style.css";
import * as THREE from "three";
import { copyFragment, displayFragment, rdFragment, screenVertex, seedFragment } from "./shaders";

type Magnet = {
  id: number;
  label: string;
  pos: THREE.Vector2;
  strength: number;
  radius: number;
  handle?: HTMLDivElement;
};

type SavedState = {
  params?: Partial<typeof DEFAULT_PARAMS>;
  magnets?: Array<{ label: string; pos: [number, number]; strength: number; radius: number }>;
  panel?: { left: number; top: number };
};

const MAGNET_MAX = 16;
const DEFAULT_RES = 512;
let simRes = DEFAULT_RES;
const DEFAULT_PARAMS = {
  feed: 0.0785,
  kill: 0.011,
  du: 0.195,
  dv: 0.255,
  dt: 1.0,
  iterations: 1,
  fieldThreshold: 0.14,
  percentage: 25
};
const DEFAULT_SEED = 735;
const STORAGE_KEY = "ferrofluid-fields-state-v1";
const MAX_ITERATIONS = 6000;

let params = { ...DEFAULT_PARAMS };
let magnets: Magnet[] = [];
let magnetCounter = 1;
let animating = false;
let animTarget = 0;
let animAccum = 0;
let animLastTime = 0;
let animRaf: number | null = null;
let animDirection: 1 | -1 = 1;

const canvasContainer = document.getElementById("canvas-container") as HTMLElement;
const magnetLayer = document.getElementById("magnet-layer") as HTMLElement;
const magnetListEl = document.getElementById("magnet-list") as HTMLElement;
const panelEl = document.getElementById("ui-panel") as HTMLElement;
const panelHandleEl = document.getElementById("panel-handle") as HTMLElement;
const animateBtn = document.getElementById("animate-sim") as HTMLButtonElement | null;
const rewindBtn = document.getElementById("rewind-sim") as HTMLButtonElement | null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0xffffff, 1);
canvasContainer.appendChild(renderer.domElement);

const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const simScene = new THREE.Scene();
const seedScene = new THREE.Scene();
const displayScene = new THREE.Scene();

const makeTarget = (res: number) =>
  new THREE.WebGLRenderTarget(res, res, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter
  });

let simTargets = [makeTarget(simRes), makeTarget(simRes)];
let simIndex = 0;
let baseState: THREE.WebGLRenderTarget | null = null;

const magnetUniforms = Array.from({ length: MAGNET_MAX }, () => new THREE.Vector4());

const stepMaterial = new THREE.ShaderMaterial({
  vertexShader: screenVertex,
  fragmentShader: rdFragment,
  uniforms: {
    prevState: { value: simTargets[0].texture },
    feed: { value: params.feed },
    kill: { value: params.kill },
    du: { value: params.du },
    dv: { value: params.dv },
    dt: { value: params.dt },
    fieldThreshold: { value: params.fieldThreshold },
    magnetCount: { value: 0 },
    magnetData: { value: magnetUniforms },
    resolution: { value: new THREE.Vector2(simRes, simRes) }
  }
});

const seedMaterial = new THREE.ShaderMaterial({
  vertexShader: screenVertex,
  fragmentShader: seedFragment,
  uniforms: {
    seed: { value: Math.random() * 999.0 },
    percentage: { value: DEFAULT_PARAMS.percentage * 0.01 }
  }
});

const displayMaterial = new THREE.ShaderMaterial({
  vertexShader: screenVertex,
  fragmentShader: displayFragment,
  uniforms: {
    stateTex: { value: simTargets[0].texture },
    resolution: { value: new THREE.Vector2(simRes, simRes) }
  }
});

const quadGeometry = new THREE.PlaneGeometry(2, 2);
const simMesh = new THREE.Mesh(quadGeometry, stepMaterial);
simScene.add(simMesh);

const seedMesh = new THREE.Mesh(quadGeometry, seedMaterial);
seedScene.add(seedMesh);

const copyMaterial = new THREE.ShaderMaterial({
  vertexShader: screenVertex,
  fragmentShader: copyFragment,
  uniforms: {
    source: { value: null }
  }
});
const copyMesh = new THREE.Mesh(quadGeometry, copyMaterial);
const copyScene = new THREE.Scene();
copyScene.add(copyMesh);

const displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), displayMaterial);
displayScene.add(displayMesh);

let draggingMagnet: Magnet | null = null;
let panelDragStart: { x: number; y: number; left: number; top: number } | null = null;
let pendingIterations = 0;
let scheduledStep = false;
let saveTimer: number | null = null;
let currentSteps = 0;

function scheduleSave() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(persistState, 140);
}

function persistState() {
  const panelRect = panelEl.getBoundingClientRect();
  const payload: SavedState = {
    params: { ...params },
    magnets: magnets.map((m) => ({
      label: m.label,
      pos: [parseFloat(m.pos.x.toFixed(4)), parseFloat(m.pos.y.toFixed(4))],
      strength: m.strength,
      radius: m.radius
    })),
    panel: { left: panelRect.left, top: panelRect.top }
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Persist failed", err);
  }
}

function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedState) : null;
  } catch (err) {
    console.warn("Load state failed", err);
    return null;
  }
}

function seedSimulation() {
  if (baseState) {
    baseState.dispose();
  }
  baseState = makeTarget(simRes);
  renderer.setRenderTarget(baseState);
  renderer.render(seedScene, simCamera);
  renderer.setRenderTarget(null);
  copyFromBase();
}

function copyFromBase() {
  if (!baseState) return;
  copyMaterial.uniforms.source.value = baseState.texture;
  for (let i = 0; i < simTargets.length; i++) {
    renderer.setRenderTarget(simTargets[i]);
    renderer.render(copyScene, simCamera);
  }
  renderer.setRenderTarget(null);
  simIndex = 0;
  currentSteps = 0;
  syncDisplayTexture();
}

function applyParamsToUniforms() {
  stepMaterial.uniforms.feed.value = params.feed;
  stepMaterial.uniforms.kill.value = params.kill;
  stepMaterial.uniforms.du.value = params.du;
  stepMaterial.uniforms.dv.value = params.dv;
  stepMaterial.uniforms.dt.value = params.dt;
  stepMaterial.uniforms.fieldThreshold.value = params.fieldThreshold;
}

function stepSimulation(iterations: number) {
  const steps = Math.max(1, Math.floor(iterations));
  applyParamsToUniforms();
  for (let i = 0; i < steps; i++) {
    stepMaterial.uniforms.prevState.value = simTargets[simIndex].texture;
    renderer.setRenderTarget(simTargets[1 - simIndex]);
    renderer.render(simScene, simCamera);
    simIndex = 1 - simIndex;
  }
  renderer.setRenderTarget(null);
  syncDisplayTexture();
  currentSteps += steps;
}

function queueSimulation(iterations: number) {
  pendingIterations = Math.max(pendingIterations, Math.max(1, Math.floor(iterations)));
  if (scheduledStep) return;
  scheduledStep = true;
  requestAnimationFrame(() => {
    stepSimulation(pendingIterations);
    pendingIterations = 0;
    scheduledStep = false;
  });
}

function syncDisplayTexture() {
  displayMaterial.uniforms.stateTex.value = simTargets[simIndex].texture;
}

function renderFrame() {
  renderer.render(displayScene, displayCamera);
}

function goToIterations(target: number) {
  const clamped = Math.max(0, Math.floor(target));
  if (clamped < currentSteps) {
    copyFromBase();
  }
  const needed = clamped - currentSteps;
  if (needed > 0) {
    stepSimulation(needed);
  }
}

function restartAndReplay() {
  copyFromBase();
  goToIterations(params.iterations);
}

function reseedAndReplay() {
  seedSimulation();
  goToIterations(params.iterations);
}

function stopAnimation() {
  if (animRaf !== null) {
    cancelAnimationFrame(animRaf);
    animRaf = null;
  }
  animating = false;
  animAccum = 0;
  animLastTime = 0;
  if (animateBtn) {
    animateBtn.textContent = "Play >>";
  }
  if (rewindBtn) {
    rewindBtn.textContent = "<< Rewind";
  }
}

function animateStep(timestamp: number) {
  if (!animating) return;
  if (animLastTime === 0) {
    animLastTime = timestamp;
  }
  const dt = timestamp - animLastTime;
  animLastTime = timestamp;
  const stepDelta = (dt / 1000) * 30;
  if (animDirection === 1) {
    animAccum += stepDelta;
    const desired = Math.min(animTarget, Math.floor(animAccum));
    if (desired > currentSteps) {
      stepSimulation(desired - currentSteps);
      params.iterations = currentSteps;
      setSliderValue("iterations", params.iterations, (v) => v.toFixed(0));
    }
    if (currentSteps >= animTarget) {
      stopAnimation();
      return;
    }
  } else {
    animAccum -= stepDelta;
    const desired = Math.max(animTarget, Math.floor(animAccum));
    if (desired < currentSteps) {
      copyFromBase();
      goToIterations(desired);
      params.iterations = currentSteps;
      setSliderValue("iterations", params.iterations, (v) => v.toFixed(0));
    }
    if (currentSteps <= animTarget) {
      stopAnimation();
      return;
    }
  }
  animRaf = requestAnimationFrame(animateStep);
}

function startAnimation() {
  stopAnimation();
  const startStep = Math.max(0, Math.floor(params.iterations));
  copyFromBase();
  goToIterations(startStep);
  animating = true;
  animTarget = animDirection === 1 ? MAX_ITERATIONS : 0;
  animAccum = startStep;
  animLastTime = 0;
  if (animDirection === 1) {
    if (animateBtn) animateBtn.textContent = "Stop";
    if (rewindBtn) rewindBtn.textContent = "<< Rewind";
  } else {
    if (rewindBtn) rewindBtn.textContent = "Stop";
    if (animateBtn) animateBtn.textContent = "Play >>";
  }
  animRaf = requestAnimationFrame(animateStep);
}

function recreateSimulation(resolution: number) {
  const nextRes = Math.max(128, Math.min(2048, Math.floor(resolution)));
  if (nextRes === simRes) return;
  simTargets.forEach((t) => t.dispose());
  simRes = nextRes;
  const newTargets = [makeTarget(simRes), makeTarget(simRes)];
  simTargets = newTargets;
  simIndex = 0;
  if (baseState) {
    baseState.dispose();
  }
  baseState = null;
  stepMaterial.uniforms.prevState.value = simTargets[0].texture;
  stepMaterial.uniforms.resolution.value.set(simRes, simRes);
  displayMaterial.uniforms.stateTex.value = simTargets[0].texture;
  displayMaterial.uniforms.resolution.value.set(simRes, simRes);
  reseedAndReplay();
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  positionMagnetHandles();
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function syncMagnetUniforms() {
  stepMaterial.uniforms.magnetCount.value = magnets.length;
  for (let i = 0; i < MAGNET_MAX; i++) {
    const m = magnets[i];
    const target = magnetUniforms[i];
    if (m) {
      target.set(m.pos.x, m.pos.y, m.strength, m.radius);
    } else {
      target.set(0, 0, 0, 0);
    }
  }
}

function addMagnet(opts?: Partial<Pick<Magnet, "pos" | "strength" | "radius" | "label">>) {
  if (magnets.length >= MAGNET_MAX) return;
  const magnet: Magnet = {
    id: magnetCounter,
    label: opts?.label ?? `Magnet ${magnetCounter}`,
    pos: opts?.pos ? opts.pos.clone() : new THREE.Vector2(0.5, 0.5),
    strength: opts?.strength ?? 0.8,
    radius: opts?.radius ?? 0.16
  };
  magnetCounter += 1;
  magnets.push(magnet);
  createMagnetHandle(magnet);
  renderMagnetList();
  syncMagnetUniforms();
  restartAndReplay();
  scheduleSave();
}

function removeMagnet(id: number) {
  const idx = magnets.findIndex((m) => m.id === id);
  if (idx === -1) return;
  const [magnet] = magnets.splice(idx, 1);
  magnet.handle?.remove();
  renderMagnetList();
  syncMagnetUniforms();
  copyFromBase();
  goToIterations(params.iterations);
  scheduleSave();
}

function clearMagnets() {
  magnets.forEach((m) => m.handle?.remove());
  magnets = [];
  magnetCounter = 1;
  magnetLayer.innerHTML = "";
  magnetListEl.innerHTML = "";
  syncMagnetUniforms();
  copyFromBase();
  goToIterations(params.iterations);
  scheduleSave();
}

function createMagnetHandle(magnet: Magnet) {
  const el = document.createElement("div");
  el.className = "magnet-handle";
  magnetLayer.appendChild(el);
  magnet.handle = el;
  positionMagnetHandle(magnet);

  const onPointerDown = (ev: PointerEvent) => {
    ev.preventDefault();
    draggingMagnet = magnet;
    el.classList.add("dragging");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (!draggingMagnet) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = clamp01((ev.clientX - rect.left) / rect.width);
    const y = clamp01((ev.clientY - rect.top) / rect.height);
    draggingMagnet.pos.set(x, 1.0 - y);
    positionMagnetHandle(draggingMagnet);
    syncMagnetUniforms();
    copyFromBase();
    goToIterations(params.iterations);
  };

  const onPointerUp = () => {
    if (draggingMagnet) {
      draggingMagnet.handle?.classList.remove("dragging");
      draggingMagnet = null;
      scheduleSave();
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  el.addEventListener("pointerdown", onPointerDown);
}

function positionMagnetHandle(magnet: Magnet) {
  if (!magnet.handle) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = magnet.pos.x * rect.width;
  const y = (1.0 - magnet.pos.y) * rect.height;
  magnet.handle.style.left = `${x}px`;
  magnet.handle.style.top = `${y}px`;
}

function positionMagnetHandles() {
  magnets.forEach(positionMagnetHandle);
}

function renderMagnetList() {
  magnetListEl.innerHTML = "";
  magnets.forEach((magnet) => {
    const item = document.createElement("div");
    item.className = "magnet-item";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = magnet.label;

    const remove = document.createElement("button");
    remove.className = "icon-btn";
    remove.textContent = "✕";
    remove.title = "Remove magnet";
    remove.addEventListener("click", () => removeMagnet(magnet.id));

    const strengthRow = document.createElement("div");
    strengthRow.className = "strength";
    const strengthLabel = document.createElement("span");
    strengthLabel.className = "name";
    strengthLabel.textContent = "Strength";
    const strengthRange = document.createElement("input");
    strengthRange.type = "range";
    strengthRange.min = "0.1";
    strengthRange.max = "3.0";
    strengthRange.step = "0.05";
    strengthRange.value = magnet.strength.toFixed(2);
    const strengthReadout = document.createElement("span");
    strengthReadout.textContent = magnet.strength.toFixed(2);
    strengthRange.addEventListener("input", () => {
      magnet.strength = parseFloat(strengthRange.value);
      strengthReadout.textContent = magnet.strength.toFixed(2);
    syncMagnetUniforms();
    copyFromBase();
    goToIterations(params.iterations);
    scheduleSave();
  });
    strengthRow.append(strengthLabel, strengthRange, strengthReadout);

    const radiusRow = document.createElement("div");
    radiusRow.className = "strength";
    const radiusLabel = document.createElement("span");
    radiusLabel.className = "name";
    radiusLabel.textContent = "Reach";
    const radiusRange = document.createElement("input");
    radiusRange.type = "range";
    radiusRange.min = "0.05";
    radiusRange.max = "1.0";
    radiusRange.step = "0.01";
    radiusRange.value = magnet.radius.toFixed(2);
    const radiusReadout = document.createElement("span");
    radiusReadout.textContent = magnet.radius.toFixed(2);
    radiusRange.addEventListener("input", () => {
      magnet.radius = parseFloat(radiusRange.value);
      radiusReadout.textContent = magnet.radius.toFixed(2);
      syncMagnetUniforms();
      restartAndReplay();
      scheduleSave();
    });
    radiusRow.append(radiusLabel, radiusRange, radiusReadout);

    item.append(label, remove, strengthRow, radiusRow);
    magnetListEl.appendChild(item);
  });
}

function bindSlider(
  id: string,
  onChange: (v: number) => void,
  formatter?: (v: number) => string,
  initialValue?: number
) {
  const input = document.getElementById(id) as HTMLInputElement;
  const output = document.getElementById(`${id}-val`) as HTMLOutputElement;
  if (initialValue !== undefined) {
    input.value = initialValue.toString();
  }
  const update = (value: number) => {
    if (output) {
      output.textContent = formatter ? formatter(value) : value.toFixed(4);
    }
    onChange(value);
  };
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    update(v);
    scheduleSave();
  });
  update(parseFloat(input.value));
}

function setSliderValue(id: string, value: number, formatter?: (v: number) => string) {
  const input = document.getElementById(id) as HTMLInputElement;
  const output = document.getElementById(`${id}-val`) as HTMLOutputElement;
  input.value = value.toString();
  if (output) {
    output.textContent = formatter ? formatter(value) : value.toFixed(4);
  }
}

function setupUI() {
  bindSlider(
    "resolution",
    (v) => {
      recreateSimulation(v);
    },
    (v) => v.toFixed(0),
    DEFAULT_RES
  );
  bindSlider(
    "seed",
    (v) => {
      seedMaterial.uniforms.seed.value = v;
      stopAnimation();
      reseedAndReplay();
      scheduleSave();
    },
    (v) => v.toFixed(0),
    Math.floor(seedMaterial.uniforms.seed.value)
  );
  bindSlider(
    "percentage",
    (v) => {
      params.percentage = v;
      seedMaterial.uniforms.percentage.value = v * 0.01;
      stopAnimation();
      reseedAndReplay();
    },
    (v) => v.toFixed(0),
    params.percentage
  );
  bindSlider(
    "feed",
    (v) => {
      params.feed = v;
      stopAnimation();
      copyFromBase();
      goToIterations(params.iterations);
    },
    (v) => v.toFixed(4),
    params.feed
  );
  bindSlider(
    "kill",
    (v) => {
      params.kill = v;
      stopAnimation();
      copyFromBase();
      goToIterations(params.iterations);
    },
    (v) => v.toFixed(4),
    params.kill
  );
  bindSlider(
    "du",
    (v) => {
      params.du = v;
      stopAnimation();
      copyFromBase();
      goToIterations(params.iterations);
    },
    (v) => v.toFixed(3),
    params.du
  );
  bindSlider(
    "dv",
    (v) => {
      params.dv = v;
      stopAnimation();
      copyFromBase();
      goToIterations(params.iterations);
    },
    (v) => v.toFixed(3),
    params.dv
  );
  bindSlider(
    "iterations",
    (v) => {
      params.iterations = v;
      goToIterations(params.iterations);
    },
    (v) => v.toFixed(0),
    params.iterations
  );
  bindSlider(
    "threshold",
    (v) => {
      params.fieldThreshold = v;
      stopAnimation();
      copyFromBase();
      goToIterations(params.iterations);
    },
    (v) => v.toFixed(2),
    params.fieldThreshold
  );

  const resetBtn = document.getElementById("reset-sim");
  const clearBtn = document.getElementById("clear-btn");
  const addMagnetBtn = document.getElementById("add-magnet");
  resetBtn?.addEventListener("click", () => {
    params = { ...DEFAULT_PARAMS };
    seedMaterial.uniforms.seed.value = DEFAULT_SEED;
    recreateSimulation(DEFAULT_RES);
    setSliderValue("resolution", DEFAULT_RES, (v) => v.toFixed(0));
    setSliderValue("seed", DEFAULT_SEED, (v) => v.toFixed(0));
    seedMaterial.uniforms.percentage.value = DEFAULT_PARAMS.percentage * 0.01;
    setSliderValue("percentage", params.percentage, (v) => v.toFixed(0));
    setSliderValue("feed", params.feed, (v) => v.toFixed(4));
    setSliderValue("kill", params.kill, (v) => v.toFixed(4));
    setSliderValue("du", params.du, (v) => v.toFixed(3));
    setSliderValue("dv", params.dv, (v) => v.toFixed(3));
    setSliderValue("iterations", params.iterations, (v) => v.toFixed(0));
    setSliderValue("threshold", params.fieldThreshold, (v) => v.toFixed(2));
    seedSimulation();
    scheduleSave();
  });
  clearBtn?.addEventListener("click", () => {
    clearMagnets();
  });
  addMagnetBtn?.addEventListener("click", () => {
    addMagnet();
  });
  animateBtn?.addEventListener("click", () => {
    animDirection = 1;
    if (animating) {
      stopAnimation();
    } else {
      startAnimation();
    }
  });
  rewindBtn?.addEventListener("click", () => {
    animDirection = -1;
    if (animating) {
      stopAnimation();
    } else {
      startAnimation();
    }
  });

  let lastPointerId: number | null = null;
  panelHandleEl.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    lastPointerId = ev.pointerId;
    panelHandleEl.setPointerCapture(ev.pointerId);
    panelHandleEl.classList.add("ghost");
    panelEl.style.right = "auto";
    const rect = panelEl.getBoundingClientRect();
    panelDragStart = {
      x: ev.clientX,
      y: ev.clientY,
      left: rect.left,
      top: rect.top
    };
  });

  window.addEventListener("pointermove", (ev) => {
    if (!panelDragStart || lastPointerId !== ev.pointerId) return;
    const dx = ev.clientX - panelDragStart.x;
    const dy = ev.clientY - panelDragStart.y;
    panelEl.style.left = `${panelDragStart.left + dx}px`;
    panelEl.style.top = `${panelDragStart.top + dy}px`;
  });

  window.addEventListener("pointerup", (ev) => {
    if (lastPointerId !== null && ev.pointerId === lastPointerId) {
      panelHandleEl.releasePointerCapture(ev.pointerId);
      panelHandleEl.classList.remove("ghost");
      panelDragStart = null;
      lastPointerId = null;
      scheduleSave();
    }
  });
}

function loadOrInitialize() {
  const saved = loadState();
  if (saved?.params) {
    params = { ...params, ...saved.params, iterations: DEFAULT_PARAMS.iterations };
  }
  // On refresh, always reset seed and percentage to defaults
  params.percentage = DEFAULT_PARAMS.percentage;
  seedMaterial.uniforms.seed.value = DEFAULT_SEED;
  // Position panel before display to avoid jump
  if (saved?.panel) {
    panelEl.style.left = `${saved.panel.left}px`;
    panelEl.style.top = `${saved.panel.top}px`;
    panelEl.style.right = "auto";
  }
  if (saved?.magnets?.length) {
    saved.magnets.forEach((m) => {
      const pos = new THREE.Vector2(clamp01(m.pos[0]), clamp01(m.pos[1]));
      addMagnet({
        label: m.label,
        pos,
        strength: m.strength,
        radius: m.radius
      });
    });
    magnetCounter = saved.magnets.length + 1;
  }
  // Always reset to a single magnet at center on refresh
  clearMagnets();
  addMagnet({ pos: new THREE.Vector2(0.5, 0.5) });
}

function init() {
  resize();
  window.addEventListener("resize", resize);
  loadOrInitialize();
  setupUI();
  seedSimulation();
  queueSimulation(params.iterations);
  renderer.setAnimationLoop(renderFrame);
}

init();
