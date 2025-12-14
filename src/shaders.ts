export const screenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const seedFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float seed;
uniform float percentage;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  float n = hash(vUv * (seed + 1.0));
  float center = smoothstep(0.35, 0.0, length(vUv - 0.5));
  float cutoff = 1.0 - clamp(percentage * 0.01, 0.0, 1.0);
  float vSeed = step(cutoff, n) + center * 0.6;
  float u = 1.0 - vSeed * 0.5;
  float v = vSeed * 0.9;
  gl_FragColor = vec4(u, v, 0.0, 1.0);
}
`;

export const rdFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D prevState;
uniform float feed;
uniform float kill;
uniform float du;
uniform float dv;
uniform float dt;
uniform float fieldThreshold;
uniform int magnetCount;
uniform vec4 magnetData[16]; // xy = pos, z = strength, w = radius
uniform vec2 resolution;

vec2 laplace(vec2 uv) {
  vec2 e = 1.0 / resolution;
  vec4 n = texture2D(prevState, uv + vec2(0.0, e.y));
  vec4 s = texture2D(prevState, uv - vec2(0.0, e.y));
  vec4 eTex = texture2D(prevState, uv + vec2(e.x, 0.0));
  vec4 w = texture2D(prevState, uv - vec2(e.x, 0.0));
  vec4 c = texture2D(prevState, uv);
  vec2 lap = (n.xy + s.xy + eTex.xy + w.xy - 4.0 * c.xy);
  return lap;
}

void main() {
  vec4 state = texture2D(prevState, vUv);
  float u = state.r;
  float v = state.g;

  float field = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= magnetCount) break;
    vec2 delta = vUv - magnetData[i].xy;
    float dist2 = dot(delta, delta);
    float radius = magnetData[i].w + 0.0006;
    float falloff = exp(-dist2 / (radius * radius));
    field += magnetData[i].z * falloff;
  }
  float mask = smoothstep(fieldThreshold, fieldThreshold + 0.35, field);

  vec2 lap = laplace(vUv);
  float reaction = u * v * v;

  float f = feed * (0.3 + 0.7 * mask);
  float k = kill * (0.65 + 0.35 * mask);

  float duv = du * lap.x - reaction + f * (1.0 - u);
  float dvv = dv * lap.y + reaction - (f + k) * v;

  u = clamp(u + duv * dt, 0.0, 1.0);
  v = clamp(v + dvv * dt, 0.0, 1.0);

  gl_FragColor = vec4(u, v, 0.0, 1.0);
}
`;

export const displayFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D stateTex;
uniform vec2 resolution;

vec3 shade(vec2 uv) {
  vec2 e = 1.0 / resolution;
  float h = texture2D(stateTex, uv).g;
  float hx = texture2D(stateTex, uv + vec2(e.x, 0.0)).g;
  float hy = texture2D(stateTex, uv + vec2(0.0, e.y)).g;
  float hx2 = texture2D(stateTex, uv - vec2(e.x, 0.0)).g;
  float hy2 = texture2D(stateTex, uv - vec2(0.0, e.y)).g;

  vec3 n = normalize(vec3(hx - hx2, hy - hy2, 2.0 * e.x));
  vec3 lightA = normalize(vec3(-0.35, 0.45, 0.85));
  vec3 lightB = normalize(vec3(0.55, -0.2, 0.65));
  float diffA = max(dot(n, lightA), 0.0);
  float diffB = max(dot(n, lightB), 0.0);
  float specA = pow(max(dot(reflect(-lightA, n), vec3(0.0, 0.0, 1.0)), 0.0), 90.0);
  float specB = pow(max(dot(reflect(-lightB, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);

  vec3 base = vec3(0.04);
  vec3 chrome = mix(vec3(0.08), vec3(0.26), diffA * 0.7 + diffB * 0.3) + (specA * 0.8 + specB * 0.35);
  float rim = pow(1.0 - abs(n.z), 3.0) * 0.35;
  float vignette = smoothstep(0.9, 0.4, length(uv - 0.5));
  vec3 env = mix(vec3(0.18), vec3(0.28), uv.y) * 0.1;
  return base + (chrome + env) * (0.35 + h * 1.7) + rim * 0.8 + vignette * 0.15;
}

void main() {
  vec3 color = shade(vUv);
  gl_FragColor = vec4(color, 1.0);
}
`;
