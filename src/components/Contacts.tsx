import React, { useEffect, useRef, useCallback } from "react";
import "../scss/contact.scss";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Ring { r: number; alpha: number; targetAlpha: number; phase: number; }
interface Spoke { angle: number; alpha: number; targetAlpha: number; }
interface Ripple { x: number; y: number; r: number; alpha: number; speed: number; }

// ─── Palette — mirrors ThreePage exactly ─────────────────────────────────────
const BG = { r: 2, g: 4, b: 9 }; // #020409
const BASE = { r: 35, g: 70, b: 200 }; // dimmer blue for inactive
const MID = { r: 42, g: 113, b: 255 }; // #2a71ff active
const ACC = { r: 0, g: 229, b: 255 }; // #00e5ff cyan accent

// ─── RadialGridCanvas ────────────────────────────────────────────────────────
const RadialGridCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouse = useRef({ x: -9999, y: -9999 });
    const ripples = useRef<Ripple[]>([]);
    const rafRef = useRef<number>(0);
    const rings = useRef<Ring[]>([]);
    const spokes = useRef<Spoke[]>([]);

    const RING_COUNT = 13;
    const SPOKE_COUNT = 36; // every 10°
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const rgb = (c: typeof ACC, a: number) =>
        `rgba(${c.r},${c.g},${c.b},${a.toFixed(3)})`;
    const mix = (a: typeof ACC, b: typeof ACC, t: number) => ({
        r: Math.round(lerp(a.r, b.r, t)),
        g: Math.round(lerp(a.g, b.g, t)),
        b: Math.round(lerp(a.b, b.b, t)),
    });

    const init = useCallback((w: number, h: number) => {
        const maxR = Math.hypot(w, h) * 0.60;
        rings.current = Array.from({ length: RING_COUNT }, (_, i) => ({
            r: (maxR / RING_COUNT) * (i + 1),
            alpha: 0.04 + i * 0.003,
            targetAlpha: 0.04 + i * 0.003,
            phase: Math.random() * Math.PI * 2,
        }));
        spokes.current = Array.from({ length: SPOKE_COUNT }, (_, i) => ({
            angle: (i / SPOKE_COUNT) * Math.PI * 2,
            alpha: 0.03,
            targetAlpha: 0.03,
        }));
    }, []);

    const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
        // Fill with solid dark background — not transparent
        ctx.fillStyle = `rgb(${BG.r},${BG.g},${BG.b})`;
        ctx.fillRect(0, 0, w, h);

        const cx = w * 0.5;
        const cy = h * 0.5;
        const mx = mouse.current.x;
        const my = mouse.current.y;
        const mDist = Math.hypot(mx - cx, my - cy);
        const mAngle = Math.atan2(my - cy, mx - cx);
        const maxR = rings.current[RING_COUNT - 1]?.r ?? 800;
        const hasMouse = mx > 0 && mx < w && my > 0 && my < h;

        // ── Rings ─────────────────────────────────────────────────────────
        rings.current.forEach((ring, i) => {
            const proximity = hasMouse
                ? Math.max(0, 1 - Math.abs(mDist - ring.r) / (maxR * 0.16))
                : 0;
            const shimmer = 0.025 * Math.sin(t * 1.3 + ring.phase);
            ring.targetAlpha = 0.04 + i * 0.004 + proximity * 0.55 + shimmer;
            ring.alpha = lerp(ring.alpha, ring.targetAlpha, 0.07);

            const col = mix(BASE, ACC, proximity);

            // Main arc
            ctx.beginPath();
            ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
            ctx.strokeStyle = rgb(col, ring.alpha);
            ctx.lineWidth = proximity > 0.25 ? 1.4 : 0.6;
            ctx.stroke();

            // Tick marks on every other ring
            if (i % 2 === 0) {
                const ticks = 48;
                for (let k = 0; k < ticks; k++) {
                    const a = (k / ticks) * Math.PI * 2;
                    const i1 = ring.r - 4;
                    const o1 = ring.r + 4;
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(a) * i1, cy + Math.sin(a) * i1);
                    ctx.lineTo(cx + Math.cos(a) * o1, cy + Math.sin(a) * o1);
                    ctx.strokeStyle = rgb(col, ring.alpha * 0.5);
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }

            // Degree labels on outermost ring
            if (i === RING_COUNT - 1) {
                ctx.font = '8px "Share Tech Mono", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                [0, 90, 180, 270].forEach(deg => {
                    const rad = (deg * Math.PI) / 180;
                    ctx.fillStyle = rgb(col, ring.alpha * 1.6);
                    ctx.fillText(`${deg}°`,
                        cx + Math.cos(rad) * (ring.r + 13),
                        cy + Math.sin(rad) * (ring.r + 13));
                });
            }
        });

        // ── Spokes ────────────────────────────────────────────────────────
        spokes.current.forEach(spoke => {
            let dA = Math.abs(spoke.angle - mAngle);
            if (dA > Math.PI) dA = Math.PI * 2 - dA;
            const angProx = hasMouse ? Math.max(0, 1 - dA / (Math.PI * 0.15)) : 0;

            spoke.targetAlpha = 0.03 + angProx * 0.52;
            spoke.alpha = lerp(spoke.alpha, spoke.targetAlpha, 0.08);

            const col = mix(BASE, ACC, angProx);
            const ex = cx + Math.cos(spoke.angle) * maxR;
            const ey = cy + Math.sin(spoke.angle) * maxR;

            const g = ctx.createLinearGradient(cx, cy, ex, ey);
            g.addColorStop(0, rgb(col, 0));
            g.addColorStop(0.2, rgb(col, spoke.alpha));
            g.addColorStop(1, rgb(col, 0));

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = g;
            ctx.lineWidth = angProx > 0.4 ? 1.1 : 0.4;
            ctx.stroke();
        });

        // ── Centre pulse ──────────────────────────────────────────────────
        const pulse = 0.7 + 0.3 * Math.sin(t * 2.8);
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20 * pulse);
        cg.addColorStop(0, rgb(ACC, 0.9));
        cg.addColorStop(0.4, rgb(ACC, 0.3));
        cg.addColorStop(1, rgb(ACC, 0));
        ctx.beginPath();
        ctx.arc(cx, cy, 20 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = cg;
        ctx.fill();

        // ── Mouse reticle ─────────────────────────────────────────────────
        if (hasMouse) {
            // Halo
            const halo = ctx.createRadialGradient(mx, my, 0, mx, my, 55);
            halo.addColorStop(0, rgb(ACC, 0.1));
            halo.addColorStop(0.6, rgb(ACC, 0.04));
            halo.addColorStop(1, rgb(ACC, 0));
            ctx.beginPath();
            ctx.arc(mx, my, 55, 0, Math.PI * 2);
            ctx.fillStyle = halo;
            ctx.fill();

            // Crosshairs
            ctx.strokeStyle = rgb(ACC, 0.2);
            ctx.lineWidth = 0.7;
            ctx.setLineDash([4, 7]);
            ctx.beginPath(); ctx.moveTo(mx - 70, my); ctx.lineTo(mx + 70, my); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(mx, my - 70); ctx.lineTo(mx, my + 70); ctx.stroke();
            ctx.setLineDash([]);

            // Outer ring
            ctx.beginPath();
            ctx.arc(mx, my, 22, 0, Math.PI * 2);
            ctx.strokeStyle = rgb(ACC, 0.22);
            ctx.lineWidth = 0.7;
            ctx.stroke();

            // Inner dot
            ctx.beginPath();
            ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
            ctx.strokeStyle = rgb(ACC, 0.8);
            ctx.lineWidth = 1;
            ctx.stroke();

            // Origin → cursor line
            const lg = ctx.createLinearGradient(cx, cy, mx, my);
            lg.addColorStop(0, rgb(ACC, 0));
            lg.addColorStop(1, rgb(ACC, 0.1));
            ctx.beginPath();
            ctx.moveTo(cx, cy); ctx.lineTo(mx, my);
            ctx.strokeStyle = lg;
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Data readout
            const dist = Math.round(mDist);
            const anglDeg = Math.round(((mAngle * 180) / Math.PI + 360) % 360);
            ctx.font = '7.5px "Share Tech Mono", monospace';
            ctx.fillStyle = rgb(ACC, 0.45);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`R:${dist}`, mx + 28, my - 8);
            ctx.fillText(`A:${anglDeg}°`, mx + 28, my + 2);
        }

        // ── Ripples ───────────────────────────────────────────────────────
        ripples.current = ripples.current.filter(rp => rp.alpha > 0.005);
        ripples.current.forEach(rp => {
            rp.r += rp.speed;
            rp.alpha *= 0.92;

            ctx.beginPath();
            ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
            ctx.strokeStyle = rgb(ACC, rp.alpha);
            ctx.lineWidth = 1.4;
            ctx.stroke();

            if (rp.r > 45) {
                ctx.beginPath();
                ctx.arc(rp.x, rp.y, rp.r * 0.55, 0, Math.PI * 2);
                ctx.strokeStyle = rgb(MID, rp.alpha * 0.4);
                ctx.lineWidth = 0.7;
                ctx.stroke();
            }
        });

    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let w = 0, h = 0;

        const resize = () => {
            const rect = canvas.parentElement!.getBoundingClientRect();
            w = canvas.width = rect.width;
            h = canvas.height = rect.height;
            init(w, h);
        };

        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas.parentElement!);

        const section = canvas.parentElement!;

        const onMove = (e: MouseEvent) => {
            const r = section.getBoundingClientRect();
            mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        const onLeave = () => { mouse.current = { x: -9999, y: -9999 }; };
        const onClick = (e: MouseEvent) => {
            const r = section.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            [1.5, 3.0, 5.5].forEach((speed, i) => {
                ripples.current.push({ x, y, r: 3 + i * 10, alpha: 0.88 - i * 0.22, speed });
            });
        };

        section.addEventListener('mousemove', onMove);
        section.addEventListener('mouseleave', onLeave);
        section.addEventListener('click', onClick);

        const start = performance.now();
        const loop = () => {
            draw(ctx, w, h, (performance.now() - start) / 1000);
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            section.removeEventListener('mousemove', onMove);
            section.removeEventListener('mouseleave', onLeave);
            section.removeEventListener('click', onClick);
        };
    }, [init, draw]);

    return <canvas ref={canvasRef} className="grid-canvas" />;
};

// ─── Contacts ────────────────────────────────────────────────────────────────
const Contacts: React.FC = () => (
    <section className="contact-section">

        <RadialGridCanvas />
        <div className="bg-blobs" />

        {/* HUD corners */}
        <div className="hud-corner hud-corner--tl" />
        <div className="hud-corner hud-corner--tr" />
        <div className="hud-corner hud-corner--bl" />
        <div className="hud-corner hud-corner--br" />

        {/* System bar */}
        <div className="sys-bar">
            <span>SYS::CONTACT</span>
            <span className="sep">●</span>
            <span className="hi">TRANSMISSION OPEN</span>
            <span className="sep">●</span>
            <span>XENEX ASHURA</span>
        </div>

        <div className="contact-wrapper">
            <h1 className="contact-title">Let's <span>Connect</span></h1>
            <p className="contact-subtitle">// Initiate Contact Sequence</p>

            <div className="cards">

                {/* Card 1 — Info */}
                <div className="card card-info">
                    <div className="card-graphic" />
                    <div className="card-corner-br" />
                    <h2>Email &amp; Phone</h2>
                    <p><a href="mailto:mythicalxenon12@gmail.com">mythicalxenon12@gmail.com</a></p>
                    <p><a href="tel:+639853047403">+63-985-304-7403</a></p>
                </div>

                {/* Card 2 — Social */}
                <div className="card card-social">
                    <div className="card-graphic" />
                    <div className="card-corner-br" />
                    <h2>Find Me On</h2>
                    <div className="social-links">
                        <a href="https://www.linkedin.com/in/julle-myth-vicentillo-5b405021a/" aria-label="LinkedIn">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                <path d="M16 0C16.5304 0 17.0391 0.210714 17.4142 0.585786C17.7893 0.960859 18 1.46957 18 2V16C18 16.5304 17.7893 17.0391 17.4142 17.4142C17.0391 17.7893 16.5304 18 16 18H2C1.46957 18 0.960859 17.7893 0.585786 17.4142C0.210714 17.0391 0 16.5304 0 16V2C0 1.46957 0.210714 0.960859 0.585786 0.585786C0.960859 0.210714 1.46957 0 2 0H16ZM15.5 15.5V10.2C15.5 9.33539 15.1565 8.5062 14.5452 7.89483C13.9338 7.28346 13.1046 6.94 12.24 6.94C11.39 6.94 10.4 7.46 9.92 8.24V7.13H7.13V15.5H9.92V10.57C9.92 9.8 10.54 9.17 11.31 9.17C11.6813 9.17 12.0374 9.3175 12.2999 9.58005C12.5625 9.8426 12.71 10.1987 12.71 10.57V15.5H15.5ZM3.88 5.56C4.32556 5.56 4.75288 5.383 5.06794 5.06794C5.383 4.75288 5.56 4.32556 5.56 3.88C5.56 2.95 4.81 2.19 3.88 2.19C3.43178 2.19 3.00193 2.36805 2.68499 2.68499C2.36805 3.00193 2.19 3.43178 2.19 3.88C2.19 4.81 2.95 5.56 3.88 5.56ZM5.27 15.5V7.13H2.5V15.5H5.27Z" fill="currentColor" />
                            </svg>
                        </a>
                        <a href="https://x.com/AshuraXenex" aria-label="X / Twitter">
                            <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
                                <path d="M12.9418 9.392L20.5363 0.5H18.7363L12.1438 8.2205L6.87578 0.5H0.800781L8.76578 12.176L0.800781 21.5H2.60078L9.56378 13.346L15.1273 21.5H21.2023L12.9418 9.392ZM10.4773 12.278L9.67028 11.1155L3.24878 1.865H6.01328L11.1943 9.3305L12.0013 10.493L18.7378 20.198H15.9733L10.4773 12.278Z" fill="currentColor" />
                            </svg>
                        </a>
                        <a href="https://github.com/Jullemyth122" aria-label="GitHub">
                            <svg width="18" height="18" viewBox="0 0 21 20" fill="none">
                                <path d="M10.0273 0C8.71413 0 7.41376 0.258658 6.20051 0.761205C4.98725 1.26375 3.88486 2.00035 2.95628 2.92893C1.08091 4.8043 0.0273438 7.34784 0.0273438 10C0.0273438 14.42 2.89734 18.17 6.86734 19.5C7.36734 19.58 7.52734 19.27 7.52734 19V17.31C4.75734 17.91 4.16734 15.97 4.16734 15.97C3.70734 14.81 3.05734 14.5 3.05734 14.5C2.14734 13.88 3.12734 13.9 3.12734 13.9C4.12734 13.97 4.65734 14.93 4.65734 14.93C5.52734 16.45 6.99734 16 7.56734 15.76C7.65734 15.11 7.91734 14.67 8.19734 14.42C5.97734 14.17 3.64734 13.31 3.64734 9.5C3.64734 8.39 4.02734 7.5 4.67734 6.79C4.57734 6.54 4.22734 5.5 4.77734 4.15C4.77734 4.15 5.61734 3.88 7.52734 5.17C8.31734 4.95 9.17734 4.84 10.0273 4.84C10.8773 4.84 11.7373 4.95 12.5273 5.17C14.4373 3.88 15.2773 4.15 15.2773 4.15C15.8273 5.5 15.4773 6.54 15.3773 6.79C16.0273 7.5 16.4073 8.39 16.4073 9.5C16.4073 13.32 14.0673 14.16 11.8373 14.41C12.1973 14.72 12.5273 15.33 12.5273 16.26V19C12.5273 19.27 12.6873 19.59 13.1973 19.5C17.1673 18.16 20.0273 14.42 20.0273 10C20.0273 8.68678 19.7687 7.38642 19.2661 6.17317C18.7636 4.95991 18.027 3.85752 17.0984 2.92893C16.1698 2.00035 15.0674 1.26375 13.8542 0.761205C12.6409 0.258658 11.3406 0 10.0273 0Z" fill="currentColor" />
                            </svg>
                        </a>
                    </div>
                    <p className="social-label">// External Links — Verified</p>
                </div>

                {/* Card 3 — Form */}
                <div className="card card-form">
                    <div className="card-graphic" />
                    <div className="card-corner-br" />
                    <h2>Send A Message</h2>
                    <form>
                        <div className="field">
                            <label htmlFor="c-name">IDENT</label>
                            <input id="c-name" type="text" placeholder="Name" required />
                        </div>
                        <div className="field">
                            <label htmlFor="c-email">CHANNEL</label>
                            <input id="c-email" type="email" placeholder="Email" required />
                        </div>
                        <div className="field">
                            <label htmlFor="c-msg">PAYLOAD</label>
                            <textarea id="c-msg" rows={4} placeholder="Your message…" required />
                        </div>
                        <button type="submit"><span>TRANSMIT</span></button>
                    </form>
                </div>

            </div>

            {/* HUD bottom bar */}
            <div className="contact-hud-bar">
                <span><span className="live-dot" />LIVE</span>
                <span>SYS::CONTACT // XENEX ASHURA</span>
                <span>THREE.JS / WEBGPU</span>
            </div>
        </div>
    </section>
);

export default Contacts;