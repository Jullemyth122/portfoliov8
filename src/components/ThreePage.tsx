import { useGSAP } from '@gsap/react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import React, { useEffect, useLayoutEffect, useMemo, useRef, Suspense } from 'react';
import * as THREE from 'three/webgpu';
import {
    float, vec2, vec3, vec4, color, sin, cos, time,
    mix, smoothstep, normalize, positionLocal, positionWorld,
    normalLocal, cameraPosition, dot, pow, mx_noise_float,
    uv, pass, Fn,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import '../scss/threePage.scss';

gsap.registerPlugin(ScrollTrigger);

const PALETTE = {
    bg: '#020409',
    blue: '#3752ff',
    blueLight: '#9ab2ff',
    blueMid: '#2a71ff',
    glow: '#297eff',
    accent: '#00e5ff',
};

const scrollState = { progress: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// RING CONFIG
// ─────────────────────────────────────────────────────────────────────────────
interface RingCfg {
    radius: number;
    tiltX: number;
    tiltZ: number;
    speed: number;
    ringColor: string;
    scrollSpeedMult: number;
    n: number;
    trailLen: number;
}

const RING_CFGS: RingCfg[] = [
    { radius: 2.8, tiltX: 0.50, tiltZ: 0.10, speed: 0.55, ringColor: PALETTE.blue, scrollSpeedMult: 1.0, n: 6, trailLen: 32 },
    { radius: 3.2, tiltX: -0.30, tiltZ: 0.50, speed: -0.38, ringColor: PALETTE.blueLight, scrollSpeedMult: 1.4, n: 5, trailLen: 28 },
    { radius: 2.4, tiltX: 1.10, tiltZ: -0.25, speed: 0.72, ringColor: PALETTE.accent, scrollSpeedMult: 0.8, n: 4, trailLen: 36 },
    { radius: 4.1, tiltX: -0.60, tiltZ: 0.35, speed: -0.28, ringColor: PALETTE.glow, scrollSpeedMult: 1.2, n: 5, trailLen: 24 },
    { radius: 3.6, tiltX: 0.80, tiltZ: -0.60, speed: 0.46, ringColor: PALETTE.blueMid, scrollSpeedMult: 0.9, n: 4, trailLen: 30 },
];

const TOTAL_INSTANCES = RING_CFGS.reduce((s, c) => s + c.n * c.trailLen, 0);

// ─────────────────────────────────────────────────────────────────────────────
// NOISE — used by voxel terrain
// ─────────────────────────────────────────────────────────────────────────────
const _hash = (x: number, y: number) => {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return h - Math.floor(h);
};
const _lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const _noise2D = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = _hash(ix, iy), b = _hash(ix + 1, iy);
    const c = _hash(ix, iy + 1), d = _hash(ix + 1, iy + 1);
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);
    return _lerp(_lerp(a, b, ux), _lerp(c, d, ux), uy);
};
const _fbm = (x: number, y: number) => {
    let v = 0, a = 0.5, sx = x, sy = y;
    for (let i = 0; i < 5; i++) {
        v += a * _noise2D(sx, sy);
        sx *= 2.0; sy *= 2.0; a *= 0.5;
    }
    return v;
};

// ─────────────────────────────────────────────────────────────────────────────
// VOXEL GRID — pre-computed once
// ─────────────────────────────────────────────────────────────────────────────
const GRID_SIZE = 150;
const VOXEL_SIZE = 0.18;
const GAP = 0.012;
const MAX_HEIGHT = 20.0;
const BASE_HEIGHT = 0.08;
const FLAT_RADIUS = 2.0;
const FFT_SIZE = 256;

const _buildGrid = () => {
    const offset = (GRID_SIZE * VOXEL_SIZE) / 2;
    const voxels: { posX: number; posZ: number; r: number; shaped: number }[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
            const posX = x * VOXEL_SIZE - offset;
            const posZ = z * VOXEL_SIZE - offset;
            const r = Math.sqrt(posX * posX + posZ * posZ);
            const noiseVal = _fbm(x * 0.04, z * 0.04);
            let shaped: number;
            if (noiseVal < 0.45) {
                shaped = noiseVal * 0.08;
            } else if (noiseVal < 0.6) {
                const t = (noiseVal - 0.45) / 0.15;
                shaped = 0.036 + t * t * 0.15;
            } else {
                const t = (noiseVal - 0.6) / 0.4;
                shaped = 0.186 + Math.pow(t, 1.8) * 0.814;
            }
            voxels.push({ posX, posZ, r, shaped });
        }
    }
    return voxels;
};

const VOXEL_GRID = _buildGrid();
const MAX_RADIUS = Math.sqrt(2) * (GRID_SIZE * VOXEL_SIZE) / 2;

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL AUDIO STATE — populated by AudioReactiveFloor on first interaction
// ─────────────────────────────────────────────────────────────────────────────
let _ctx: AudioContext | null = null;
let _analyser: AnalyserNode | null = null;
let _connected = false;

function _initAudio() {
    if (_analyser) return;
    try {
        _ctx = new AudioContext();
        _analyser = _ctx.createAnalyser();
        _analyser.fftSize = FFT_SIZE;
        _analyser.smoothingTimeConstant = 0.82;
        const el = document.querySelector('audio') as HTMLAudioElement | null;
        if (el && !_connected) {
            const src = _ctx.createMediaElementSource(el);
            src.connect(_analyser);
            _analyser.connect(_ctx.destination);
            _connected = true;
        }
    } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO REACTIVE FLOOR — full voxel terrain from TerrainAudio.jsx
// ─────────────────────────────────────────────────────────────────────────────
function AudioReactiveFloor() {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const freqData = useRef(new Uint8Array(FFT_SIZE / 2).fill(0));

    // Geometry: pivot at bottom so scale.y grows upward
    const geo = useMemo(() => {
        const g = new THREE.BoxGeometry(VOXEL_SIZE - GAP, 1, VOXEL_SIZE - GAP);
        g.translate(0, 0.5, 0);
        return g;
    }, []);

    // Material: dark navy → deep blue → light sky blue / cyan
    const mat = useMemo(() => {
        const m = new THREE.MeshStandardNodeMaterial();

        const deepColor = color('#03060f');
        const midColor = color('#0a2a6e');
        const peakColor = color('#7ed4f5');

        const t = smoothstep(float(-6.5), float(MAX_HEIGHT * 0.5), positionWorld.y);
        const midMix = smoothstep(float(0.0), float(0.4), t);
        const pkMix = smoothstep(float(0.4), float(1.0), t);
        m.colorNode = mix(mix(deepColor, midColor, midMix), peakColor, pkMix);

        // Emissive drives bloom — electric cyan at peaks
        m.emissiveNode = mix(
            color('#000010'),
            color('#00c8ff'),
            smoothstep(float(0.1), float(0.3), t)
        );

        m.roughnessNode = float(0.5);
        m.metalnessNode = float(0.8);
        return m;
    }, []);

    useEffect(() => {
        _initAudio();
        const resume = () => {
            _initAudio();
            if (_ctx?.state === 'suspended') _ctx.resume();
        };
        document.addEventListener('click', resume, { once: true });
        return () => document.removeEventListener('click', resume);
    }, []);

    useFrame(({ clock }) => {
        if (!meshRef.current) return;
        const time = clock.getElapsedTime();

        // Read FFT or decay toward silence
        if (_analyser) {
            _analyser.getByteFrequencyData(freqData.current);
        } else {
            for (let i = 0; i < freqData.current.length; i++) {
                freqData.current[i] = Math.max(0, freqData.current[i] - 4);
            }
        }

        const bins = freqData.current;
        const numBins = bins.length;

        let totalEnergy = 0;
        for (let i = 0; i < numBins; i++) totalEnergy += bins[i];
        const avgEnergy = (totalEnergy / numBins) / 255;

        for (let i = 0; i < VOXEL_GRID.length; i++) {
            const { posX, posZ, r, shaped } = VOXEL_GRID[i];
            let height: number;

            if (r < FLAT_RADIUS) {
                // Center zone — always flat
                height = BASE_HEIGHT;

            } else {
                const radialOutward = Math.min(
                    (r - FLAT_RADIUS) / (MAX_RADIUS - FLAT_RADIUS),
                    1.0
                );

                // Spiral colosseum shape
                const angle = Math.atan2(posZ, posX);
                const spiralAngle = angle + (r * 0.15);

                const majorPetal = Math.cos(spiralAngle * 10.0) * 10.5 + 0.5;
                const minorPetal = Math.cos(spiralAngle * 100.0) * 0.5 + 0.5;
                const petalShape = _lerp(majorPetal, minorPetal, radialOutward);

                const growthCurve = Math.pow(radialOutward, 3.5);
                const cliffWidth = 0.06 + (majorPetal * 0.004);
                const terracedGrowth = growthCurve - (growthCurve % cliffWidth);
                const dynamicGrowth = _lerp(growthCurve, terracedGrowth, 0.8);

                const radialEnvelope = 0.15 + (1.8 + 2.0 * petalShape) * dynamicGrowth;

                // Bass outside, treble inside
                const binIdx = Math.floor((1.0 - radialOutward) * (numBins - 1));
                const amp = bins[binIdx] / 255;
                const audioScale = Math.pow(amp, 1.4);
                const shapeFactor = Math.max(0.18, shaped);

                // Ripples + grid interference
                const ripple1 = Math.sin(r * 5.0 - time * 3.0) * 0.5 + 0.5;
                const ripple2 = Math.sin(r * 0.85 - time * 1.5) * 0.5 + 0.5;
                const ripple3 = Math.cos(r * 5.4 - time * 2.0) * 0.5 + 0.5;
                const gridInterference = (Math.sin(posX * 2.5) * Math.cos(posZ * 2.5)) * 2.5 + 0.5;
                const ripple = ripple1 * 0.4 + ripple2 * 0.2 + ripple3 * 0.2 + gridInterference * 0.2;
                const rippleHeight = ripple * avgEnergy * 5.0 * radialEnvelope;

                height = BASE_HEIGHT
                    + shapeFactor * MAX_HEIGHT * audioScale * radialEnvelope
                    + rippleHeight;
            }

            const finalHeight = Math.min(60.0, Math.max(BASE_HEIGHT, height));
            dummy.position.set(posX, 0, posZ);
            dummy.scale.set(1, finalHeight, 1);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }

        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh
            ref={meshRef}
            args={[geo, mat, VOXEL_GRID.length]}
            position={[0, -3.5, 0]}
            castShadow
            receiveShadow
            frustumCulled={true}
        />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOOM POST PROCESSING
// ─────────────────────────────────────────────────────────────────────────────
function BloomPostProcessing() {
    const { gl, scene, camera } = useThree();
    const composerRef = useRef<THREE.PostProcessing | null>(null);

    useEffect(() => {
        const renderer = gl as unknown as THREE.WebGPURenderer;
        const composer = new THREE.PostProcessing(renderer);
        const scenePass = pass(scene, camera);
        const bloomPass = bloom(scenePass, 2.4, 0.5, 1.5);
        composer.outputNode = scenePass.add(bloomPass);
        composerRef.current = composer;
        return () => { composerRef.current = null; };
    }, [gl, scene, camera]);

    useFrame(() => {
        if (composerRef.current) composerRef.current.renderAsync();
    }, 1);

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAILING PARTICLES
// ─────────────────────────────────────────────────────────────────────────────
type TrailBuf = { positions: Float32Array; head: number; filled: number };

function TrailingParticles() {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const { camera } = useThree();

    const dotGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

    const dotMaterial = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        } as any);
        m.blending = THREE.AdditiveBlending;
        const colorify = Fn(() => {
            const distUV = uv().sub(vec2(0.5, 0.5)).length();
            const alpha = smoothstep(float(0.5), float(0.02), distUV);
            const col = vec3(float(0.55), float(1.0), float(2.5));
            return vec4(col, alpha);
        });
        m.colorNode = colorify();
        return m;
    }, []);

    const ringMats = useMemo(() =>
        RING_CFGS.map(c => {
            const m = new THREE.Matrix4();
            m.makeRotationFromEuler(new THREE.Euler(c.tiltX, 0, c.tiltZ, 'XYZ'));
            return m;
        }), []);

    const headAngles = useRef(
        RING_CFGS.map((cfg, ri) =>
            Array.from({ length: cfg.n }, (_, pi) => (pi / cfg.n) * Math.PI * 2 + ri * 1.3)
        )
    );

    const trailBufs = useRef<TrailBuf[][]>(
        RING_CFGS.map(cfg =>
            Array.from({ length: cfg.n }, () => ({
                positions: new Float32Array(cfg.trailLen * 3),
                head: 0,
                filled: 0,
            }))
        )
    );

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const wp = useMemo(() => new THREE.Vector3(), []);

    useFrame(({ clock }, delta) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const t = clock.getElapsedTime();
        let idx = 0;

        const camPos = camera.position;
        const sp = scrollState.progress;
        const speedMult = 1.0 + sp * 4.0;
        const scaleMult = 1.0 + sp * 0.4;

        for (let ri = 0; ri < RING_CFGS.length; ri++) {
            const cfg = RING_CFGS[ri];
            const om = ringMats[ri];
            const ha = headAngles.current[ri];
            const bufs = trailBufs.current[ri];

            const breathe = 1.0 + 0.04 * Math.sin(t * 1.3 + ri * 0.9);
            const r = cfg.radius * scaleMult * breathe;

            for (let pi = 0; pi < cfg.n; pi++) {
                ha[pi] += cfg.speed * delta * speedMult;
                wp.set(Math.cos(ha[pi]) * r, 0, Math.sin(ha[pi]) * r);
                wp.applyMatrix4(om);

                const buf = bufs[pi];
                const h = buf.head;
                buf.positions[h * 3 + 0] = wp.x;
                buf.positions[h * 3 + 1] = wp.y;
                buf.positions[h * 3 + 2] = wp.z;
                buf.head = (h + 1) % cfg.trailLen;
                if (buf.filled < cfg.trailLen) buf.filled++;

                for (let age = 0; age < cfg.trailLen; age++) {
                    if (age >= buf.filled) {
                        dummy.scale.setScalar(0);
                        dummy.updateMatrix();
                        mesh.setMatrixAt(idx, dummy.matrix);
                        idx++;
                        continue;
                    }

                    const ri2 = ((buf.head - 1 - age) + cfg.trailLen * 100) % cfg.trailLen;
                    const px = buf.positions[ri2 * 3 + 0];
                    const py = buf.positions[ri2 * 3 + 1];
                    const pz = buf.positions[ri2 * 3 + 2];

                    const life = 1.0 - age / cfg.trailLen;
                    const lifeSq = life * life * life;
                    const isHead = age === 0;
                    const pulse = isHead
                        ? 1.0 + 0.5 * Math.sin(t * 12.0 + ri * 2.3 + pi * 1.1)
                        : 1.0;

                    dummy.position.set(px, py, pz);
                    dummy.lookAt(camPos);
                    dummy.scale.setScalar(lifeSq * (isHead ? 0.30 : 0.13) * pulse);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(idx, dummy.matrix);
                    idx++;
                }
            }
        }

        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh
            ref={meshRef}
            args={[dotGeometry, dotMaterial, TOTAL_INSTANCES]}
            frustumCulled={true}
        />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTER BOX
// ─────────────────────────────────────────────────────────────────────────────
function OuterBox() {
    const groupRef = useRef<THREE.Group>(null!);

    const edgeMat = useMemo(() => {
        const m = new THREE.LineBasicNodeMaterial();
        const n = mx_noise_float(positionWorld.mul(float(0.8)).add(vec3(sin(time.mul(0.4)), cos(time.mul(0.3)), time.mul(0.2))));
        m.colorNode = mix(color(PALETTE.blueMid), color(PALETTE.accent), smoothstep(float(0.2), float(0.8), n.abs()));
        return m;
    }, []);

    const faceMat = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial();
        m.transparent = true;
        m.depthWrite = true;
        m.side = THREE.BackSide;
        m.blending = THREE.AdditiveBlending;
        const viewDir = normalize(cameraPosition.sub(positionLocal));
        const fresnel = pow(dot(normalLocal, viewDir).oneMinus(), float(2.0));
        const n = mx_noise_float(positionWorld.mul(float(1.4)).add(vec3(sin(time.mul(0.35)), cos(time.mul(0.25)), time.mul(0.18))));
        m.colorNode = mix(color(PALETTE.blue), color(PALETTE.accent), smoothstep(float(0.2), float(0.8), n.abs())).mul(fresnel.mul(float(0.35)));
        return m;
    }, []);

    const boxGeo = useMemo(() => new THREE.BoxGeometry(3, 3, 3), []);
    const edgesGeo = useMemo(() => new THREE.EdgesGeometry(boxGeo), [boxGeo]);

    useFrame(({ clock }) => {
        if (!groupRef.current) return;
        const sp = scrollState.progress;
        groupRef.current.position.y = Math.sin(clock.getElapsedTime() * 0.45) * 0.07;
        groupRef.current.rotation.y += 0.003 + sp * 0.025;
        groupRef.current.rotation.x += sp * 0.008;
        groupRef.current.scale.setScalar(1.0 + sp * 0.3);
    });

    return (
        <group ref={groupRef}>
            <mesh geometry={boxGeo} material={faceMat} />
            <lineSegments geometry={edgesGeo} material={edgeMat} />
        </group>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// INNER CORE
// ─────────────────────────────────────────────────────────────────────────────
function InnerCore() {
    const meshRef = useRef<THREE.Mesh>(null!);

    const mat = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial();
        const n = mx_noise_float(positionWorld.mul(float(2.2)).add(vec3(sin(time.mul(0.5)), cos(time.mul(0.35)), time.mul(0.25))));
        m.colorNode = mix(color(PALETTE.blue), color(PALETTE.accent), smoothstep(float(0.2), float(0.85), n.abs()));
        return m;
    }, []);

    const edgeMat = useMemo(() => {
        const m = new THREE.LineBasicNodeMaterial();
        m.colorNode = color(PALETTE.blueLight);
        return m;
    }, []);

    const coreGeo = useMemo(() => new THREE.BoxGeometry(1.0, 1.0, 1.0), []);
    const edgesGeo = useMemo(() => new THREE.EdgesGeometry(coreGeo), [coreGeo]);

    useFrame(({ clock }) => {
        if (!meshRef.current) return;
        const sp = scrollState.progress;
        meshRef.current.rotation.y += 0.009 + sp * 0.06;
        meshRef.current.rotation.x += 0.005 + sp * 0.03;
        meshRef.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 1.4) * 0.05 + sp * 0.4);
    });

    return (
        <mesh ref={meshRef} geometry={coreGeo} material={mat}>
            <lineSegments geometry={edgesGeo} material={edgeMat} />
        </mesh>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORBIT RING
// ─────────────────────────────────────────────────────────────────────────────
function OrbitRing({ cfg, ringIndex }: { cfg: RingCfg; ringIndex: number }) {
    const meshRef = useRef<THREE.Mesh>(null!);
    const ghostRef = useRef<THREE.Mesh>(null!);

    const mat = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial();
        m.transparent = true;
        m.colorNode = color(cfg.ringColor);
        return m;
    }, [cfg.ringColor]);

    const ghostMat = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial();
        m.transparent = true;
        m.blending = THREE.AdditiveBlending;
        m.colorNode = color(cfg.ringColor);
        return m;
    }, [cfg.ringColor]);

    const torusGeo = useMemo(() => new THREE.TorusGeometry(cfg.radius, 0.009, 8, 160), [cfg.radius]);
    const ghostGeo = useMemo(() => new THREE.TorusGeometry(cfg.radius * 1.012, 0.004, 8, 160), [cfg.radius]);

    useFrame(({ clock }) => {
        if (!meshRef.current) return;
        const sp = scrollState.progress;
        const t = clock.getElapsedTime();

        const wobbleAmp = 0.08 + sp * 0.25;
        const wobbleFreq = 0.6 + ringIndex * 0.17;
        const tiltXDynamic = cfg.tiltX + Math.sin(t * wobbleFreq + ringIndex * 1.4) * wobbleAmp;
        const tiltZDynamic = cfg.tiltZ + Math.cos(t * wobbleFreq * 0.7 + ringIndex * 0.9) * wobbleAmp * 0.6;
        const precession = t * cfg.speed * 0.18 * (1 + sp * cfg.scrollSpeedMult * 3);

        meshRef.current.rotation.set(tiltXDynamic, precession, tiltZDynamic);
        if (ghostRef.current) {
            ghostRef.current.rotation.set(
                tiltXDynamic + Math.sin(t * 0.4) * 0.05,
                precession - 0.12,
                tiltZDynamic + Math.cos(t * 0.3) * 0.04
            );
        }

        const breathe = 1.0 + 0.04 * Math.sin(t * 1.3 + ringIndex * 0.9);
        const s = breathe * (1.0 + sp * 0.4);
        meshRef.current.scale.setScalar(s);
        if (ghostRef.current) ghostRef.current.scale.setScalar(s * 1.015);

        const baseOpacity = 0.22 + 0.10 * Math.sin(t * 1.4 + cfg.tiltX);
        const energyPulse = Math.pow(Math.abs(Math.sin(t * 2.2 + ringIndex)), 3) * 0.18;
        (mat as any).opacity = (baseOpacity + energyPulse) * (1 + sp * 1.2);
        (ghostMat as any).opacity = (baseOpacity + energyPulse) * 0.25 * (1 + sp * 1.2);
    });

    return (
        <>
            <mesh ref={meshRef} geometry={torusGeo} material={mat} />
            <mesh ref={ghostRef} geometry={ghostGeo} material={ghostMat} />
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE
// ─────────────────────────────────────────────────────────────────────────────
interface SceneProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    leftTitleRef: React.RefObject<HTMLDivElement | null>;
    rightTitleRef: React.RefObject<HTMLDivElement | null>;
}

function Scene({ containerRef, leftTitleRef, rightTitleRef }: SceneProps) {
    const { camera } = useThree();
    const zoomEnd = useMemo(() => new THREE.Vector3(3, -3, 3), []);

    const ringCurve = useMemo(() => {
        const r = zoomEnd.length();
        const a0 = Math.atan2(zoomEnd.z, zoomEnd.x);
        const raw = Array.from({ length: 301 }, (_, i) => {
            const θ = a0 + (i / 300) * Math.PI * 2;
            return new THREE.Vector3(Math.cos(θ) * r, 0, Math.sin(θ) * r);
        });
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 6);
        const tl = raw.map(p => p.clone().applyQuaternion(q));
        const off = zoomEnd.clone().sub(tl[0]);
        return new THREE.CatmullRomCurve3(tl.map(p => p.clone().add(off)), true);
    }, [zoomEnd]);

    const proxy = useRef({ t: 0 });

    useGSAP(() => {
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: containerRef.current,
                start: 'top top',
                end: '+=300%',
                scrub: 1,
                pin: true,
                onUpdate: (self) => { scrollState.progress = self.progress; },
            },
        });

        gsap.set([leftTitleRef.current, rightTitleRef.current], { display: 'block' });
        gsap.set(leftTitleRef.current, { xPercent: 0 });
        gsap.set(rightTitleRef.current, { xPercent: 0 });

        tl.from(leftTitleRef.current, { opacity: 0, xPercent: -8, duration: 0.3, ease: 'power2.out' }, 0);
        tl.from(rightTitleRef.current, { opacity: 0, xPercent: 8, duration: 0.3, ease: 'power2.out' }, 0);
        tl.to(leftTitleRef.current, { xPercent: -25, opacity: 0.5, duration: 0.4 }, 0.05);
        tl.to(rightTitleRef.current, { xPercent: 25, opacity: 0.5, duration: 0.4 }, 0.05);
        tl.to([leftTitleRef.current, rightTitleRef.current], { opacity: 0, duration: 0.3 }, 0.42);

        tl.to(camera.position, {
            x: zoomEnd.x, y: zoomEnd.y, z: zoomEnd.z,
            ease: 'power1.inOut', duration: 0.4,
            onUpdate: () => camera.lookAt(0, 0, 0),
        }, 0);
        tl.to(proxy.current, {
            t: 1, ease: 'none', duration: 0.6,
            onUpdate: () => {
                camera.position.copy(ringCurve.getPoint(proxy.current.t));
                camera.lookAt(0, 0, 0);
            },
        }, 0.3);
    }, { scope: containerRef });

    return (
        <>
            <BloomPostProcessing />
            <ambientLight intensity={0.04} color="#010208" />
            <directionalLight intensity={0.3} position={[4, 8, 4]} color={PALETTE.blueMid} />
            <spotLight intensity={0.4} position={[-5, 6, -8]} angle={Math.PI / 5} penumbra={1} color={PALETTE.blue} />
            <pointLight intensity={0.5} position={[0, -1, 0]} color={PALETTE.glow} distance={4} decay={2} />

            <TrailingParticles />
            <AudioReactiveFloor />

            {/* {RING_CFGS.map((cfg, i) => (
                <OrbitRing key={i} cfg={cfg} ringIndex={i} />
            ))} */}

            <OuterBox />
            <InnerCore />
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ThreePage
// ─────────────────────────────────────────────────────────────────────────────
const ThreePage: React.FC = () => {
    const threePageCompRef = useRef<HTMLDivElement | null>(null);
    const leftTitleRef = useRef<HTMLDivElement | null>(null);
    const rightTitleRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        gsap.set([leftTitleRef.current, rightTitleRef.current], { opacity: 0 });
    }, []);

    return (
        <div className="three-wrapper">
            <div ref={threePageCompRef} className="three-page">

                <div className="three-page__scanlines" />
                <div className="three-page__vignette" />

                <div className="three-page__corner three-page__corner--tl" />
                <div className="three-page__corner three-page__corner--tr" />
                <div className="three-page__corner three-page__corner--bl" />
                <div className="three-page__corner three-page__corner--br" />

                <div className="three-page__sys-tags">
                    <span className="three-page__sys-tags-item">SYS::RENDER</span>
                    <span className="three-page__sys-tags-sep">●</span>
                    <span className="three-page__sys-tags-item">THREE.JS / WEBGPU</span>
                    <span className="three-page__sys-tags-sep">●</span>
                    <span className="three-page__sys-tags-item three-page__sys-tags-item--hide-sm">GSAP / SCROLL</span>
                </div>

                <div ref={leftTitleRef} className="three-page__title three-page__title--left">
                    <h1>Aspiring Web<br />Developer</h1>
                </div>

                <div ref={rightTitleRef} className="three-page__title three-page__title--right">
                    <h1>Aspiring Software<br />Engineer</h1>
                </div>

                <div className="three-page__bottom-bar">
                    <span className="three-page__bottom-bar-scroll">SCROLL TO BEGIN ↓</span>
                    <span className="three-page__bottom-bar-name">XENEX ASHURA</span>
                    <span className="three-page__bottom-bar-live">
                        <span className="three-page__bottom-bar-live-dot" />
                        LIVE
                    </span>
                </div>

                <Canvas
                    camera={{ position: [1.10, -1.10, 1.10] }}
                    shadows={false}
                    gl={async (props) => {
                        const r = new THREE.WebGPURenderer({ ...props, antialias: true, alpha: false } as any);
                        await r.init();
                        r.toneMapping = THREE.ACESFilmicToneMapping;
                        r.toneMappingExposure = 0.45;
                        r.setClearColor(0x020409, 1);
                        return r;
                    }}
                    style={{ background: PALETTE.bg }}
                >
                    <Suspense fallback={
                        <Html center>
                            <span style={{ color: PALETTE.blueLight, fontFamily: 'monospace', fontSize: 12 }}>INIT...</span>
                        </Html>
                    }>
                        <Scene
                            containerRef={threePageCompRef}
                            leftTitleRef={leftTitleRef}
                            rightTitleRef={rightTitleRef}
                        />
                    </Suspense>
                </Canvas>
            </div>
        </div>
    );
};

export default ThreePage;