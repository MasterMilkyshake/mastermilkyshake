import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
import { buildShapes } from './shapes.js';

const SHAPES = { nanoparticle: 0, protein: 1, network: 2, dust: 3 };

const EXTENT = [[3.3, 3.3], [3.6, 4.1], [4.2, 2.75], null];

const vertexShader = `
#define TAU 6.2831853

uniform float uTime;
uniform float uFrom;
uniform float uTo;
uniform float uMix;
uniform float uSpin;
uniform float uSize;
uniform float uPixelRatio;
uniform float uMotion;

attribute vec3 aProtein;
attribute vec3 aNet;
attribute vec3 aDust;
attribute vec4 aRand;
attribute vec3 aKind;

varying vec3 vColor;
varying float vAlpha;

const vec3 RED = vec3(1.0, 0.31, 0.227);
const vec3 BLUE = vec3(0.184, 0.42, 1.0);
const vec3 SKY = vec3(0.45, 0.68, 1.0);
const vec3 LIME = vec3(0.56, 0.8, 0.0);
const vec3 AMBER = vec3(1.0, 0.66, 0.0);
const vec3 GREY = vec3(0.76, 0.77, 0.8);
const vec3 ROSE = vec3(1.0, 0.42, 0.52);

const vec3 AF_VERY_HIGH = vec3(0.0, 0.325, 0.839);
const vec3 AF_CONFIDENT = vec3(0.396, 0.796, 0.953);
const vec3 AF_LOW = vec3(1.0, 0.859, 0.075);
const vec3 AF_VERY_LOW = vec3(1.0, 0.49, 0.271);

vec3 rotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 rotX(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

vec3 rotZ(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

vec3 quad(float k, vec3 a, vec3 b, vec3 c, vec3 d) {
    return k < 0.5 ? a : k < 1.5 ? b : k < 2.5 ? c : d;
}

void main() {
    float m = smoothstep(0.0, 1.0, clamp((uMix - aRand.x * 0.4) / 0.6, 0.0, 1.0));
    vec4 idx = vec4(0.0, 1.0, 2.0, 3.0);
    vec4 w = mix(1.0 - step(0.5, abs(vec4(uFrom) - idx)), 1.0 - step(0.5, abs(vec4(uTo) - idx)), m);
    float t = uTime;

    vec3 pL = rotX(rotY(position, sin(uSpin * 1.0) * 0.55), -0.42);
    float lk = aKind.x;
    vec3 cL = lk < 0.5 ? BLUE : lk < 1.5 ? SKY : lk < 2.5 ? GREY : lk < 3.5 ? RED : AMBER;

    vec3 pP = rotZ(rotY(aProtein, uSpin * 0.9), -0.3);
    vec3 cP = quad(aKind.y, AF_VERY_HIGH, AF_CONFIDENT, AF_LOW, AF_VERY_LOW);

    vec3 pN = rotY(rotX(aNet, uSpin * 0.7), 0.3 + sin(uSpin * 0.8) * 0.12);
    float pulse = exp(-pow((aNet.x - (fract(t * 0.3) * 4.8 - 2.4)) / 0.35, 2.0)) * uMotion;
    bool wire = aKind.z > 2.5;
    vec3 cN = wire ? mix(GREY, BLUE, pulse) : quad(aKind.z, LIME, BLUE, ROSE, BLUE);
    float aN = wire ? 0.5 + 0.5 * pulse : 1.0;

    vec3 pU = aDust + vec3(sin(t * 0.3 + aRand.y * TAU), cos(t * 0.25 + aRand.z * TAU), 0.0) * 0.3;
    vec3 cU = quad(floor(aRand.w * 4.0), RED, BLUE, LIME, AMBER);

    vec3 p = pL * w.x + pP * w.y + pN * w.z + pU * w.w;
    vec3 col = cL * w.x + cP * w.y + cN * w.z + cU * w.w;
    float alpha = w.x + w.y + aN * w.z + 0.6 * w.w;

    p += vec3(sin(aRand.y * TAU + t * 0.7), cos(aRand.z * TAU + t * 0.9), sin(aRand.w * TAU + t * 0.5)) * sin(m * 3.14159) * 0.8;
    p += (aRand.yzw - 0.5) * 0.02 * sin(t * 2.0 + aRand.x * 30.0) * uMotion;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + aRand.y * 0.8) * uPixelRatio / -mv.z;

    float fog = clamp((-mv.z - 9.0) / 4.5, 0.0, 1.0);
    vColor = mix(col, vec3(1.0), fog * 0.6);
    vAlpha = alpha * (1.0 - fog * 0.35);
}
`;

const fragmentShader = `
varying vec3 vColor;
varying float vAlpha;

void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha * (1.0 - smoothstep(0.36, 0.5, d)));
}
`;

const FOV = 35;
const CAMERA_Z = 10;
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function createDots(canvas, { count = 5000, shape = 0, fill = 0.82, size = 26, seed = 29, reduced = false } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0xffffff, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.z = CAMERA_Z;

    const s = buildShapes(count, seed);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(s.nanoparticle, 3));
    geometry.setAttribute('aProtein', new THREE.BufferAttribute(s.protein, 3));
    geometry.setAttribute('aNet', new THREE.BufferAttribute(s.network, 3));
    geometry.setAttribute('aDust', new THREE.BufferAttribute(s.dust, 3));
    geometry.setAttribute('aKind', new THREE.BufferAttribute(s.kind, 3));
    geometry.setAttribute('aRand', new THREE.BufferAttribute(s.rand, 4));

    const uniforms = {
        uTime: { value: 0 },
        uFrom: { value: SHAPES.dust },
        uTo: { value: shape },
        uMix: { value: reduced ? 1 : 0 },
        uSpin: { value: 0.4 },
        uSize: { value: size },
        uPixelRatio: { value: 1 },
        uMotion: { value: reduced ? 0 : 1 },
    };

    const points = new THREE.Points(
        geometry,
        new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false })
    );
    points.frustumCulled = false;
    const group = new THREE.Group();
    group.add(points);
    scene.add(group);

    const view = { w: 1, h: 1 };
    const state = { from: SHAPES.dust, to: shape, mix: reduced ? 1 : 0, queued: null, time: 0, spin: 0.4 };
    let visible = false;
    let raf = 0;
    let last = 0;

    const fit = (i) => (EXTENT[i] ? Math.min((view.w * 0.96) / EXTENT[i][0], (view.h * fill) / EXTENT[i][1]) : 1);

    function begin(next) {
        state.from = state.to;
        state.to = next;
        state.mix = reduced ? 1 : 0;
    }

    function render(dt) {
        if (!reduced) {
            state.time += dt;
            state.spin += dt * 0.35;
        }
        if (state.mix < 1) state.mix = Math.min(1, state.mix + dt / 1.6);
        else if (state.queued !== null) {
            begin(state.queued);
            state.queued = null;
        }
        group.scale.setScalar(lerp(fit(state.from), fit(state.to), smooth(state.mix)));

        uniforms.uTime.value = state.time;
        uniforms.uFrom.value = state.from;
        uniforms.uTo.value = state.to;
        uniforms.uMix.value = state.mix;
        uniforms.uSpin.value = state.spin;
        renderer.render(scene, camera);
    }

    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000 || 0);
        last = now;
        render(dt);
        raf = visible ? requestAnimationFrame(loop) : 0;
    }

    function resize() {
        const { width, height } = canvas.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        uniforms.uPixelRatio.value = renderer.getPixelRatio();
        view.h = 2 * CAMERA_Z * Math.tan((FOV * Math.PI) / 360);
        view.w = view.h * camera.aspect;
        if (!raf) render(0);
    }

    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !raf) {
            last = performance.now();
            raf = requestAnimationFrame(loop);
        }
    }).observe(canvas);
    resize();

    return {
        get shape() {
            return state.queued ?? state.to;
        },
        show(next) {
            if (next === this.shape) return;
            if (state.mix < 1) state.queued = next;
            else begin(next);
        },
    };
}
