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

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  float n = hash(vUv * (seed + 1.0));
  float center = smoothstep(0.35, 0.0, length(vUv - 0.5));
  float vSeed = step(0.9975, n) + center * 0.6;
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
uniform vec3 magnetData[16];
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
    float dist2 = dot(delta, delta) + 0.0003;
    field += magnetData[i].z / dist2;
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
  vec3 lightDir = normalize(vec3(-0.35, 0.4, 0.85));
  float diff = max(dot(n, lightDir), 0.0);
  float spec = pow(max(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 64.0);

  vec3 base = vec3(0.05);
  vec3 chrome = mix(vec3(0.08), vec3(0.25), diff) + spec * 0.9;
  float rim = pow(1.0 - abs(n.z), 3.0) * 0.3;
  return base + chrome * (0.35 + h * 1.6) + rim;
}

void main() {
  vec3 color = shade(vUv);
  gl_FragColor = vec4(color, 1.0);
}
`;
