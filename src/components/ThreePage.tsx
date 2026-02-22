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

// Shared scroll progress — 0 at top, 1 at bottom of scroll section
const scrollState = { progress: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// RING CONFIG — single source of truth used by BOTH OrbitRing and TrailingParticles
// ─────────────────────────────────────────────────────────────────────────────
interface RingCfg {
    radius: number;
    tiltX: number;
    tiltZ: number;
    speed: number;         // rad/s angular velocity of the "head" pointer
    ringColor: string;
    scrollSpeedMult: number;
    n: number;             // number of particle heads on this ring
    trailLen: number;      // tail length in frames
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
// BLOOM POST PROCESSING
// ─────────────────────────────────────────────────────────────────────────────
function BloomPostProcessing() {
    const { gl, scene, camera } = useThree();
    const composerRef = useRef<THREE.PostProcessing | null>(null);

    useEffect(() => {
        const renderer = gl as unknown as THREE.WebGPURenderer;
        const composer = new THREE.PostProcessing(renderer);
        const scenePass = pass(scene, camera);
        const bloomPass = bloom(scenePass, 2.4, 0.5, 0.05);
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
// TRAILING PARTICLES — locked to ring paths
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
            // Tighter, brighter core — very sharp falloff for "nasty" glow
            const alpha = smoothstep(float(0.5), float(0.02), distUV);
            const col = vec3(float(0.55), float(1.0), float(2.5));
            return vec4(col, alpha);
        });

        m.colorNode = colorify();
        return m;
    }, []);

    // Pre-build rotation matrices from tilt config
    const ringMats = useMemo(() =>
        RING_CFGS.map(c => {
            const m = new THREE.Matrix4();
            m.makeRotationFromEuler(new THREE.Euler(c.tiltX, 0, c.tiltZ, 'XYZ'));
            return m;
        }), []);

    // Per-ring, per-particle head angle trackers
    const headAngles = useRef(
        RING_CFGS.map((cfg, ri) =>
            Array.from({ length: cfg.n }, (_, pi) => (pi / cfg.n) * Math.PI * 2 + ri * 1.3)
        )
    );

    // Trail buffers
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

            // Ring radius wobble — same as OrbitRing breathing
            const breathe = 1.0 + 0.04 * Math.sin(t * 1.3 + ri * 0.9);
            const r = cfg.radius * scaleMult * breathe;

            for (let pi = 0; pi < cfg.n; pi++) {
                // Advance head angle at the ring's own speed
                ha[pi] += cfg.speed * delta * speedMult;

                // Position on the ring's ellipse (circle, since torus is circular)
                wp.set(
                    Math.cos(ha[pi]) * r,
                    0,
                    Math.sin(ha[pi]) * r
                );
                wp.applyMatrix4(om);

                // Push to trail buffer
                const buf = bufs[pi];
                const h = buf.head;
                buf.positions[h * 3 + 0] = wp.x;
                buf.positions[h * 3 + 1] = wp.y;
                buf.positions[h * 3 + 2] = wp.z;
                buf.head = (h + 1) % cfg.trailLen;
                if (buf.filled < cfg.trailLen) buf.filled++;

                // Render trail dots from newest to oldest
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
                    const lifeSq = life * life * life; // cubic falloff — sharp bright head
                    const isHead = age === 0;
                    const pulse = isHead
                        ? 1.0 + 0.5 * Math.sin(t * 12.0 + ri * 2.3 + pi * 1.1)
                        : 1.0;

                    const size = lifeSq * (isHead ? 0.30 : 0.13) * pulse;

                    dummy.position.set(px, py, pz);
                    dummy.lookAt(camPos);
                    dummy.scale.setScalar(size);
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
            frustumCulled={false}
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
        const edgeCol = mix(color(PALETTE.blueMid), color(PALETTE.accent), smoothstep(float(0.2), float(0.8), n.abs()));
        m.colorNode = edgeCol;
        return m;
    }, []);

    const faceMat = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial();
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.BackSide;
        m.blending = THREE.AdditiveBlending;
        const viewDir = normalize(cameraPosition.sub(positionLocal));
        const fresnel = pow(dot(normalLocal, viewDir).oneMinus(), float(2.0));
        const n = mx_noise_float(positionWorld.mul(float(1.4)).add(vec3(sin(time.mul(0.35)), cos(time.mul(0.25)), time.mul(0.18))));
        const faceCol = mix(color(PALETTE.blue), color(PALETTE.accent), smoothstep(float(0.2), float(0.8), n.abs()));
        m.colorNode = faceCol.mul(fresnel.mul(float(0.35)));
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
        const s = 1.0 + sp * 0.3;
        groupRef.current.scale.setScalar(s);
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
        const p = positionWorld.mul(float(2.2));
        const n = mx_noise_float(p.add(vec3(sin(time.mul(0.5)), cos(time.mul(0.35)), time.mul(0.25))));
        const col = mix(color(PALETTE.blue), color(PALETTE.accent), smoothstep(float(0.2), float(0.85), n.abs()));
        m.colorNode = col;
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
        const s = 1 + Math.sin(clock.getElapsedTime() * 1.4) * 0.05 + sp * 0.4;
        meshRef.current.scale.setScalar(s);
    });

    return (
        <mesh ref={meshRef} geometry={coreGeo} material={mat}>
            <lineSegments geometry={edgesGeo} material={edgeMat} />
        </mesh>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORBIT RING — now animated dramatically, driven by RING_CFGS
// ─────────────────────────────────────────────────────────────────────────────
function OrbitRing({ cfg, ringIndex }: { cfg: RingCfg; ringIndex: number }) {
    const meshRef = useRef<THREE.Mesh>(null!);

    const mat = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial();
        m.transparent = true;
        m.colorNode = color(cfg.ringColor);
        return m;
    }, [cfg.ringColor]);

    // Build a secondary "ghost" ring that lags behind for depth
    const ghostMat = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial();
        m.transparent = true;
        m.colorNode = color(cfg.ringColor);
        m.blending = THREE.AdditiveBlending;
        return m;
    }, [cfg.ringColor]);

    const torusGeo = useMemo(() => new THREE.TorusGeometry(cfg.radius, 0.009, 8, 160), [cfg.radius]);
    const ghostGeo = useMemo(() => new THREE.TorusGeometry(cfg.radius * 1.012, 0.004, 8, 160), [cfg.radius]);

    const ghostRef = useRef<THREE.Mesh>(null!);

    useFrame(({ clock }) => {
        if (!meshRef.current) return;
        const sp = scrollState.progress;
        const t = clock.getElapsedTime();

        // Dramatic wobble: tiltX oscillates, whole ring precesses
        const wobbleAmp = 0.08 + sp * 0.25;
        const wobbleFreq = 0.6 + ringIndex * 0.17;
        const tiltXDynamic = cfg.tiltX + Math.sin(t * wobbleFreq + ringIndex * 1.4) * wobbleAmp;
        const tiltZDynamic = cfg.tiltZ + Math.cos(t * wobbleFreq * 0.7 + ringIndex * 0.9) * wobbleAmp * 0.6;

        // Slow axial precession on Y
        const precession = t * cfg.speed * 0.18 * (1 + sp * cfg.scrollSpeedMult * 3);

        meshRef.current.rotation.set(tiltXDynamic, precession, tiltZDynamic);
        if (ghostRef.current) {
            ghostRef.current.rotation.set(
                tiltXDynamic + Math.sin(t * 0.4) * 0.05,
                precession - 0.12,
                tiltZDynamic + Math.cos(t * 0.3) * 0.04
            );
        }

        // Breathing scale
        const breathe = 1.0 + 0.04 * Math.sin(t * 1.3 + ringIndex * 0.9);
        const s = breathe * (1.0 + sp * 0.4);
        meshRef.current.scale.setScalar(s);
        if (ghostRef.current) ghostRef.current.scale.setScalar(s * 1.015);

        // Opacity pulse — ring flickers with energy
        const baseOpacity = 0.22 + 0.10 * Math.sin(t * 1.4 + cfg.tiltX);
        const energyPulse = Math.pow(Math.abs(Math.sin(t * 2.2 + ringIndex)), 3) * 0.18;
        (mat as any).opacity = (baseOpacity + energyPulse) * (1 + sp * 1.2);
        if (ghostMat) (ghostMat as any).opacity = ((baseOpacity + energyPulse) * 0.25) * (1 + sp * 1.2);
    });

    return (
        <>
            <mesh ref={meshRef} geometry={torusGeo} material={mat} />
            <mesh ref={ghostRef} geometry={ghostGeo} material={ghostMat} />
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO-REACTIVE FLOOR
// ─────────────────────────────────────────────────────────────────────────────
const GW = 72; const GD = 72;
const PW = 34; const PD = 34;
const FLOOR_Y = -2.6;
const INNER_R = 2.5;
const OUTER_R = 5.5;

let _ctx: AudioContext | null = null;
let _analyser: AnalyserNode | null = null;
let _connected = false;

function initAudio() {
    if (_analyser) return;
    try {
        _ctx = new AudioContext();
        _analyser = _ctx.createAnalyser();
        _analyser.fftSize = 512;
        _analyser.smoothingTimeConstant = 0.75;
        const el = document.querySelector('audio') as HTMLAudioElement | null;
        if (el && !_connected) {
            const src = _ctx.createMediaElementSource(el);
            src.connect(_analyser);
            _analyser.connect(_ctx.destination);
            _connected = true;
        }
    } catch { /* silent */ }
}

function AudioReactiveFloor() {
    const basePos = useRef<Float32Array | null>(null);

    const waveGeo = useMemo(() => {
        const g = new THREE.PlaneGeometry(PW, PD, GW, GD);
        g.rotateX(-Math.PI / 2);
        const arr = (g.attributes.position as THREE.BufferAttribute).array as Float32Array;
        basePos.current = new Float32Array(arr);
        const vc = g.attributes.position.count;
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vc * 3), 3));
        return g;
    }, []);

    const gridGeo = useMemo(() => {
        const g = new THREE.PlaneGeometry(PW, PD, GW, GD);
        g.rotateX(-Math.PI / 2);
        return g;
    }, []);

    const smoothed = useRef(new Float32Array(GW + 1).fill(0));
    const beatRing = useRef(0);
    const beatEnergy = useRef(0);
    const prevBass = useRef(0);
    const kickActive = useRef(false);
    const kickAmp = useRef(0);

    const waveMat = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial();
        m.wireframe = true;
        m.transparent = true;
        m.depthWrite = false;
        m.blending = THREE.AdditiveBlending;
        m.vertexColors = true;
        return m;
    }, []);

    const gridMat = useMemo(() => {
        const m = new THREE.MeshBasicNodeMaterial();
        m.wireframe = true;
        m.transparent = true;
        m.depthWrite = false;
        m.blending = THREE.AdditiveBlending;
        m.colorNode = color(PALETTE.blue);
        (m as any).opacity = 0.08;
        return m;
    }, []);

    useEffect(() => {
        initAudio();
        const resume = () => { initAudio(); if (_ctx?.state === 'suspended') _ctx.resume(); };
        document.addEventListener('click', resume, { once: true });
        return () => document.removeEventListener('click', resume);
    }, []);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        const posAttr = waveGeo.attributes.position as THREE.BufferAttribute;
        const colAttr = waveGeo.attributes.color as THREE.BufferAttribute;
        const posArr = posAttr.array as Float32Array;
        const colArr = colAttr.array as Float32Array;
        const base = basePos.current!;

        let fft: Uint8Array | null = null;
        if (_analyser) {
            fft = new Uint8Array(_analyser.frequencyBinCount);
            _analyser.getByteFrequencyData(fft);
        }

        for (let c = 0; c <= GW; c++) {
            let raw = 0;
            if (fft && fft.length > 0) {
                const bi = Math.floor(Math.pow(c / GW, 1.4) * (fft.length - 1));
                raw = fft[bi] / 255;
            } else {
                raw =
                    0.28 * Math.abs(Math.sin(c * 0.2 + t * 1.1)) +
                    0.18 * Math.abs(Math.sin(c * 0.45 - t * 0.75)) +
                    0.10 * Math.abs(Math.sin(c * 0.08 + t * 2.2));
            }
            smoothed.current[c] += (raw - smoothed.current[c]) * 0.20;
        }

        let bass = 0;
        if (fft) {
            for (let i = 0; i < 6; i++) bass += fft[i] / 255;
            bass /= 6;
        } else {
            bass = 0.35 + 0.35 * Math.abs(Math.sin(t * 1.8));
        }
        const bassSmooth = prevBass.current * 0.8 + bass * 0.2;
        if (bass > bassSmooth * 1.3 && bass > 0.35 && !kickActive.current) {
            kickActive.current = true;
            kickAmp.current = 1.0;
            beatRing.current = 0.0;
        }
        prevBass.current = bassSmooth;

        if (kickActive.current) {
            beatRing.current += 0.025;
            kickAmp.current *= 0.88;
            if (kickAmp.current < 0.02) { kickActive.current = false; kickAmp.current = 0; }
        }
        beatEnergy.current = bass;

        const maxH = 2.2;
        const vpr = GW + 1;
        const ringR = beatRing.current * (OUTER_R + 2);

        for (let row = 0; row <= GD; row++) {
            const rowNorm = row / GD;
            const rowPhase = rowNorm * Math.PI * 3.0;
            const tOff = t * 1.3;
            for (let col = 0; col <= GW; col++) {
                const i3 = (row * vpr + col) * 3;
                const bx = base[i3];
                const bz = base[i3 + 2];
                const dxz = Math.sqrt(bx * bx + bz * bz);
                const mask = Math.max(0, Math.min(1, (dxz - INNER_R) / (OUTER_R - INNER_R)));
                const amp = smoothed.current[col];
                const ripple = Math.sin(rowPhase - tOff + col * 0.14) * 0.35;
                const fftH = amp * maxH * (0.65 + 0.35 * Math.max(0, ripple)) * mask;
                const ringDist = Math.abs(dxz - ringR);
                const ringW = 0.9;
                const ringH = kickAmp.current * 1.6 * Math.max(0, 1.0 - ringDist / ringW) * mask;
                const bassH = bass * 0.6 * mask * Math.pow(1.0 - Math.min(1, dxz / (OUTER_R + 2)), 1.5);
                const disp = fftH + ringH + bassH;
                posArr[i3] = bx;
                posArr[i3 + 1] = disp;
                posArr[i3 + 2] = bz;
                const loud = Math.min(1, (fftH / maxH) * 1.4);
                const ringGlow = Math.min(1, ringH * 1.2);
                const rowFade = 0.5 + 0.5 * (1.0 - rowNorm * 0.7);
                colArr[i3] = (0.05 + loud * 0.35 + ringGlow * 0.9) * rowFade;
                colArr[i3 + 1] = (0.08 + loud * 0.65 + ringGlow * 0.9) * rowFade;
                colArr[i3 + 2] = (0.28 + loud * 0.72 + ringGlow * 0.1) * rowFade;
            }
        }

        waveGeo.computeVertexNormals();
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        (waveMat as any).opacity = 0.55 + beatEnergy.current * 0.45;
    });

    return (
        <group position={[0, FLOOR_Y, 0]}>
            <mesh geometry={gridGeo} material={gridMat} />
            <mesh geometry={waveGeo} material={waveMat} />
        </group>
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
                onUpdate: (self) => {
                    scrollState.progress = self.progress;
                },
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

            {/* Trails follow rings — share exact same RING_CFGS */}
            <TrailingParticles />
            <AudioReactiveFloor />

            {/* Orbit rings rendered from RING_CFGS so they match trails */}
            {RING_CFGS.map((cfg, i) => (
                <OrbitRing key={i} cfg={cfg} ringIndex={i} />
            ))}

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

                {/* Scanlines */}
                <div className="three-page__scanlines" />

                {/* Vignette */}
                <div className="three-page__vignette" />

                {/* Corner brackets */}
                <div className="three-page__corner three-page__corner--tl" />
                <div className="three-page__corner three-page__corner--tr" />
                <div className="three-page__corner three-page__corner--bl" />
                <div className="three-page__corner three-page__corner--br" />

                {/* Top system tags */}
                <div className="three-page__sys-tags">
                    <span className="three-page__sys-tags-item">SYS::RENDER</span>
                    <span className="three-page__sys-tags-sep">●</span>
                    <span className="three-page__sys-tags-item">THREE.JS / WEBGPU</span>
                    <span className="three-page__sys-tags-sep">●</span>
                    <span className="three-page__sys-tags-item three-page__sys-tags-item--hide-sm">GSAP / SCROLL</span>
                </div>

                {/* Left title */}
                <div ref={leftTitleRef} className="three-page__title three-page__title--left">
                    <h1>Aspiring Web<br />Developer</h1>
                </div>

                {/* Right title */}
                <div ref={rightTitleRef} className="three-page__title three-page__title--right">
                    <h1>Aspiring Software<br />Engineer</h1>
                </div>

                {/* Bottom bar */}
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