import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

const Cursor: React.FC = () => {
    const cursorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = cursorRef.current!;
        // store target mouse coords & current pos
        const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const pos   = { x: mouse.x, y: mouse.y };

        // quickSetters for X and Y
        const setX = gsap.quickSetter(el, 'x', 'px');
        const setY = gsap.quickSetter(el, 'y', 'px');

        // update target on every mousemove (no tween)
        const onMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };
        window.addEventListener('mousemove', onMouseMove);

        // tick() runs ~60fps: lerp pos→mouse and apply with quickSetters
        const tick = () => {
            // adjust the “0.15” factor for tighter/looser follow
            pos.x += (mouse.x - pos.x) * 0.15;
            pos.y += (mouse.y - pos.y) * 0.15;
            // offset by half the width/height
            setX(pos.x - el.offsetWidth / 2);
            setY(pos.y - el.offsetHeight / 2);
        };
        gsap.ticker.add(tick);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            gsap.ticker.remove(tick);
        };
    }, []);

    return <div ref={cursorRef} className="cursor" />;
};

export default Cursor;
