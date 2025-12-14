import "./style.css";
import * as THREE from "three";
import { displayFragment, rdFragment, screenVertex, seedFragment } from "./shaders";

type Magnet = {
  id: number;
  label: string;
  pos: THREE.Vector2;
  strength: number;
  handle?: HTMLDivElement;
};

const MAGNET_MAX = 16;
const SIM_RES = 512;

const params = {
  feed: 0.037,
  kill: 0.06,
  du: 0.16,
  dv: 0.08,
  dt: 1.0,
  iterations: 30,
  fieldThreshold: 0.2
};

const canvasContainer = document.getElementById("canvas-container") as HTMLElement;
const magnetLayer = document.getElementById("magnet-layer") as HTMLElement;
const magnetListEl = document.getElementById("magnet-list") as HTMLElement;
const panelEl = document.getElementById("ui-panel") as HTMLElement;
const panelHandleEl = document.getElementById("panel-handle") as HTMLElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0xffffff, 1);
canvasContainer.appendChild(renderer.domElement);

const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const simScene = new THREE.Scene();
const seedScene = new THREE.Scene();
const displayScene = new THREE.Scene();

const makeTarget = () =>
  new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter
  });

const simTargets = [makeTarget(), makeTarget()];
let simIndex = 0;

const magnetUniforms = Array.from({ length: MAGNET_MAX }, () => new THREE.Vector3());

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
    resolution: { value: new THREE.Vector2(SIM_RES, SIM_RES) }
  }
});

const seedMaterial = new THREE.ShaderMaterial({
  vertexShader: screenVertex,
  fragmentShader: seedFragment,
  uniforms: {
    seed: { value: Math.random() * 999.0 }
  }
});

const displayMaterial = new THREE.ShaderMaterial({
  vertexShader: screenVertex,
  fragmentShader: displayFragment,
  uniforms: {
    stateTex: { value: simTargets[0].texture },
    resolution: { value: new THREE.Vector2(SIM_RES, SIM_RES) }
  }
});

const quadGeometry = new THREE.PlaneGeometry(2, 2);
const simMesh = new THREE.Mesh(quadGeometry, stepMaterial);
simScene.add(simMesh);

const seedMesh = new THREE.Mesh(quadGeometry, seedMaterial);
seedScene.add(seedMesh);

const displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), displayMaterial);
displayScene.add(displayMesh);

let magnets: Magnet[] = [];
let magnetCounter = 1;
let draggingMagnet: Magnet | null = null;
let panelDragStart: { x: number; y: number; left: number; top: number } | null = null;

function seedSimulation() {
  seedMaterial.uniforms.seed.value = Math.random() * 999.0;
  renderer.setRenderTarget(simTargets[simIndex]);
  renderer.render(seedScene, simCamera);
  renderer.setRenderTarget(simTargets[1 - simIndex]);
  renderer.render(seedScene, simCamera);
  renderer.setRenderTarget(null);
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
}

function syncDisplayTexture() {
  displayMaterial.uniforms.stateTex.value = simTargets[simIndex].texture;
}

function renderFrame() {
  renderer.render(displayScene, displayCamera);
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
      target.set(m.pos.x, m.pos.y, m.strength);
    } else {
      target.set(0, 0, 0);
    }
  }
}

function addMagnet() {
  const magnet: Magnet = {
    id: magnetCounter,
    label: `Magnet ${magnetCounter}`,
    pos: new THREE.Vector2(0.5, 0.5),
    strength: 1.2
  };
  magnetCounter += 1;
  magnets.push(magnet);
  createMagnetHandle(magnet);
  renderMagnetList();
  syncMagnetUniforms();
  stepSimulation(params.iterations);
}

function clearMagnets() {
  magnets = [];
  magnetLayer.innerHTML = "";
  magnetListEl.innerHTML = "";
  syncMagnetUniforms();
  stepSimulation(params.iterations);
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
  };

  const onPointerUp = () => {
    if (draggingMagnet) {
      draggingMagnet.handle?.classList.remove("dragging");
      draggingMagnet = null;
      stepSimulation(params.iterations);
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

    const strengthRow = document.createElement("div");
    strengthRow.className = "strength";
    const range = document.createElement("input");
    range.type = "range";
    range.min = "0.1";
    range.max = "3.0";
    range.step = "0.05";
    range.value = magnet.strength.toFixed(2);
    const readout = document.createElement("span");
    readout.textContent = magnet.strength.toFixed(2);
    range.addEventListener("input", () => {
      magnet.strength = parseFloat(range.value);
      readout.textContent = magnet.strength.toFixed(2);
      syncMagnetUniforms();
      stepSimulation(params.iterations);
    });

    strengthRow.append(range, readout);
    item.append(label, strengthRow);
    magnetListEl.appendChild(item);
  });
}

function bindSlider(id: string, onChange: (v: number) => void, formatter?: (v: number) => string) {
  const input = document.getElementById(id) as HTMLInputElement;
  const output = document.getElementById(`${id}-val`) as HTMLOutputElement;
  const update = (value: number) => {
    if (output) {
      output.textContent = formatter ? formatter(value) : value.toFixed(4);
    }
    onChange(value);
  };
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    update(v);
    stepSimulation(params.iterations);
  });
  update(parseFloat(input.value));
}

function setupUI() {
  bindSlider("feed", (v) => (params.feed = v), (v) => v.toFixed(4));
  bindSlider("kill", (v) => (params.kill = v), (v) => v.toFixed(4));
  bindSlider("du", (v) => (params.du = v), (v) => v.toFixed(3));
  bindSlider("dv", (v) => (params.dv = v), (v) => v.toFixed(3));
  bindSlider("iterations", (v) => (params.iterations = v), (v) => v.toFixed(0));
  bindSlider("threshold", (v) => (params.fieldThreshold = v), (v) => v.toFixed(2));

  const seedBtn = document.getElementById("seed-btn");
  const clearBtn = document.getElementById("clear-btn");
  const addMagnetBtn = document.getElementById("add-magnet");
  seedBtn?.addEventListener("click", () => {
    seedSimulation();
    stepSimulation(params.iterations);
  });
  clearBtn?.addEventListener("click", () => {
    clearMagnets();
  });
  addMagnetBtn?.addEventListener("click", () => {
    addMagnet();
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
    }
  });
}

function init() {
  resize();
  window.addEventListener("resize", resize);
  setupUI();
  addMagnet();
  seedSimulation();
  stepSimulation(params.iterations);
  renderer.setAnimationLoop(renderFrame);
}

init();
