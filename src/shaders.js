// GLSL for ORBIT. Kept compact; materials are built in one constructor in scene.js / particles.js.

// Ashima 3D simplex noise (standard, public-domain) - reused by the core displacement.
const SIMPLEX = /* glsl */ `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0,0.5,1.0,2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`;

export const coreVertex = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform float uScale;
varying vec3 vN; varying vec3 vView; varying float vDisp;
${SIMPLEX}
void main(){
  float n  = snoise(normal * uScale + uTime * 0.5);
  float n2 = snoise(normal * uScale * 2.0 - uTime * 0.35) * 0.5;
  float disp = (n + n2) * uAmp;
  vec3 p = position + normal * disp;
  vDisp = disp;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

export const coreFragment = /* glsl */ `
uniform vec3 uColorA; uniform vec3 uColorB;
varying vec3 vN; varying vec3 vView; varying float vDisp;
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(vView);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
  float t = clamp(fres * 0.65 + vDisp * 0.9 + 0.2, 0.0, 1.0);
  vec3 col = mix(uColorA, uColorB, t);
  // dark body + luminous rim: only the rim is bright enough for bloom to catch
  vec3 outc = col * 0.10 + col * fres * 1.7;
  gl_FragColor = vec4(outc, 1.0);
}`;

export const particleVertex = /* glsl */ `
uniform float uSize; uniform float uPixelRatio;
attribute float aRand;
varying float vRand;
void main(){
  vRand = aRand;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uPixelRatio * (300.0 / -mv.z) * (0.55 + aRand * 0.9);
  gl_Position = projectionMatrix * mv;
}`;

export const particleFragment = /* glsl */ `
uniform vec3 uColor; uniform float uTime;
varying float vRand;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  float tw = 0.55 + 0.45 * sin(uTime * 1.6 + vRand * 30.0);
  gl_FragColor = vec4(uColor * (0.7 + vRand * 0.5), a * tw);
}`;

// Final grade + vignette pass (runs AFTER OutputPass, in display space).
export const gradeFragment = /* glsl */ `
uniform sampler2D tDiffuse; uniform float uVignette;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 d = vUv - 0.5;
  float v = smoothstep(0.9, uVignette * 0.35, dot(d, d) * 2.0);
  gl_FragColor = vec4(c.rgb * mix(0.78, 1.0, v), c.a);
}`;

export const gradeVertex = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
