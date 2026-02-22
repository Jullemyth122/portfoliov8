import React, { useEffect, useRef, useState } from 'react';
import mp1 from '../assets/Razihel - Love U.mp3';
import mp2 from '../assets/Tropic Love - Diviners.mp3';
import mp3 from '../assets/Vanze - Forever.mp3';
import '../scss/header.scss';

interface Track {
    title: string;
    src: string;
}

const musicList: Track[] = [
    { title: 'Razihel - Love U', src: mp1 },
    { title: 'Tropic Love - Diviners', src: mp2 },
    { title: 'Vanze - Forever', src: mp3 },
];

const NUM_BARS = 5;
const MIN_HEIGHT = 3;
const MAX_HEIGHT = 18;
const DEFAULT_VOLUME = 0.35;

const Header: React.FC = () => {
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [barHeights, setBarHeights] = useState<number[]>(Array(NUM_BARS).fill(MIN_HEIGHT));

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const animIdRef = useRef<number>(0);
    const phaseRef = useRef(0);

    // ── Bar animation ─────────────────────────────────────────────────────────
    const animateBars = () => {
        setBarHeights(Array.from({ length: NUM_BARS }, (_, i) => {
            const wave = (Math.sin(phaseRef.current + (i * Math.PI) / 2) + 1) / 2;
            return MIN_HEIGHT + wave * (MAX_HEIGHT - MIN_HEIGHT);
        }));
        phaseRef.current += 0.14;
        animIdRef.current = requestAnimationFrame(animateBars);
    };

    useEffect(() => {
        if (isPlaying) {
            cancelAnimationFrame(animIdRef.current);
            animIdRef.current = requestAnimationFrame(animateBars);
        } else {
            cancelAnimationFrame(animIdRef.current);
            setBarHeights(Array(NUM_BARS).fill(MIN_HEIGHT));
            phaseRef.current = 0;
        }
        return () => cancelAnimationFrame(animIdRef.current);
    }, [isPlaying]);

    // ── Audio sync ────────────────────────────────────────────────────────────
    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        a.volume = DEFAULT_VOLUME;
        isPlaying ? a.play().catch(() => { }) : a.pause();
    }, [currentTrackIndex, isPlaying]);

    const togglePlay = () => { if (audioRef.current) setIsPlaying(p => !p); };
    const prevTrack = () => { setCurrentTrackIndex(i => (i === 0 ? musicList.length - 1 : i - 1)); setIsPlaying(true); };
    const nextTrack = () => { setCurrentTrackIndex(i => (i === musicList.length - 1 ? 0 : i + 1)); setIsPlaying(true); };

    return (
        <header className="header">

            {/* ── Left: brand ───────────────────────────────────────────────── */}
            <div className="header__brand">
                <div className="header__brand-bracket" />

                <span className="header__brand-name">
                    Xenex Ashura
                </span>

                <span className="header__brand-pip" />

                <span className="header__brand-tag">Portfolio</span>
            </div>

            {/* ── Right: music player ───────────────────────────────────────── */}
            <div className="header__player">

                {/* EQ bars */}
                <div className="header__eq">
                    {barHeights.map((h, i) => (
                        <div
                            key={i}
                            className="header__eq-bar"
                            style={{ height: h }}
                        />
                    ))}
                </div>

                <div className="header__player-divider" />

                {/* Track name */}
                <span key={currentTrackIndex} className="header__track">
                    {musicList[currentTrackIndex].title}
                </span>

                <div className="header__player-divider" />

                {/* Controls */}
                <button className="hdr-btn" onClick={prevTrack} aria-label="Previous" type="button">
                    <svg width="13" height="13" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M11 2.5a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.79.407L5 8.972V13a.5.5 0 0 1-1 0V3a.5.5 0 0 1 1 0v4.028l5.71-4.435A.5.5 0 0 1 11 2.5z" />
                    </svg>
                </button>

                <button className="hdr-play" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} type="button">
                    {isPlaying ? (
                        <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M5 3h2v10H5V3zm4 0h2v10H9V3z" />
                        </svg>
                    ) : (
                        <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M10.804 8 5 4.633v6.734zm.792-.696a.802.802 0 0 1 0 1.392l-6.363 3.692C4.713 12.69 4 12.345 4 11.692V4.308c0-.653.713-.998 1.233-.696z" />
                        </svg>
                    )}
                </button>

                <button className="hdr-btn" onClick={nextTrack} aria-label="Next" type="button">
                    <svg width="13" height="13" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M5 2.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .79.407L11 8.972V13a.5.5 0 0 0 1 0V3a.5.5 0 0 0-1 0v4.028l-5.71-4.435A.5.5 0 0 0 5 2.5z" />
                    </svg>
                </button>

                {/* Live indicator */}
                <div className="header__player-divider" />
                <div className={`header__live header__live--${isPlaying ? 'playing' : 'idle'}`}>
                    <span className={`header__live-dot header__live-dot--${isPlaying ? 'playing' : 'idle'}`} />
                    <span className="header__live-label">
                        {isPlaying ? 'LIVE' : 'IDLE'}
                    </span>
                </div>
            </div>

            {/* Right bracket accent */}
            <div className="header__bracket-right" />

            <audio
                ref={audioRef}
                src={musicList[currentTrackIndex].src}
                onEnded={nextTrack}
                preload="auto"
            />
        </header>
    );
};

export default Header;