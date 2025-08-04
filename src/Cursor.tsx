import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

const Cursor: React.FC = () => {
    const cursorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = cursorRef.current!;
        // Store target mouse coords & current position
        const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const pos = { x: mouse.x, y: mouse.y };

        // QuickSetters for X and Y
        const setX = gsap.quickSetter(el, 'x', 'px');
        const setY = gsap.quickSetter(el, 'y', 'px');

        // Update target on every mousemove (no tween)
        const onMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };
        window.addEventListener('mousemove', onMouseMove);

        // Tick runs ~60fps: lerp pos→mouse and apply with quickSetters
        const tick = () => {
            // Adjust the "0.15" factor for tighter/looser follow
            pos.x += (mouse.x - pos.x) * 0.15;
            pos.y += (mouse.y - pos.y) * 0.15;
            // Offset by half the width/height
            setX(pos.x - el.offsetWidth / 2);
            setY(pos.y - el.offsetHeight / 2);
        };
        gsap.ticker.add(tick);

        // Add hover effect for .sp_r_h1 > .link elements
        const links = document.querySelectorAll('.sp_r_h1 > .link');

        const onMouseEnter = () => {
            gsap.to(el, { scale: 1.5, filter:'blur(5px)', opacity:0.75, background: "#fff" ,duration: 0.3 });
        };

        const onMouseLeave = () => {
            gsap.to(el, { scale: 1, duration: 0.3, filter:'blur(0px)', opacity: 1, background:"#ffe066" });
        };

        links.forEach(link => {
            link.addEventListener('mouseenter', onMouseEnter);
            link.addEventListener('mouseleave', onMouseLeave);
        });

        // Cleanup on unmount
        return () => {
            links.forEach(link => {
                link.removeEventListener('mouseenter', onMouseEnter);
                link.removeEventListener('mouseleave', onMouseLeave);
            });
            window.removeEventListener('mousemove', onMouseMove);
            gsap.ticker.remove(tick);
        };
    }, []);

    return <div ref={cursorRef} className="cursor" />;
};

export default Cursor;