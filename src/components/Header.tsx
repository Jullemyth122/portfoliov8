import React, { useEffect, useRef, useState } from 'react';
import mp1 from '../assets/holilive.mp3'
import mp2 from '../assets/hololive2.mp3'

interface Track {
    title: string;
    src: string;
}

const musicList: Track[] = [
    {
        title: 'Lofi - Angle',
        src: mp1,
    },
    {
        title: 'Lofi - Chill',
        src: mp2,
    },
];

const NUM_BARS = 5;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 20;

const Header: React.FC = () => {
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [barHeights, setBarHeights] = useState<number[]>(
        Array(NUM_BARS).fill(MIN_HEIGHT)
    );

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const animationIdRef = useRef<number>(0);
    const phaseRef = useRef(0);

    // animate bars using a simple sine wave
    const animateBars = () => {
        const newHeights = Array.from({ length: NUM_BARS }, (_, i) => {
        const phase = phaseRef.current + (i * Math.PI) / 2;
        const wave = (Math.sin(phase) + 1) / 2; // 0 → 1
        return MIN_HEIGHT + wave * (MAX_HEIGHT - MIN_HEIGHT);
        });
        phaseRef.current += 0.15;
        setBarHeights(newHeights);
        animationIdRef.current = requestAnimationFrame(animateBars);
    };

    // start/stop the animation loop
    useEffect(() => {
        if (isPlaying) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = requestAnimationFrame(animateBars);
        } else {
        cancelAnimationFrame(animationIdRef.current);
        setBarHeights(Array(NUM_BARS).fill(MIN_HEIGHT));
        phaseRef.current = 0;
        }
        // cleanup on unmount or when dependencies change
        return () => cancelAnimationFrame(animationIdRef.current);
    }, [isPlaying]);

    // keep audio in sync when track or play state changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
        audio.play().catch(() => {
            /* ignore play promise rejections */
        });
        } else {
        audio.pause();
        }
    }, [currentTrackIndex, isPlaying]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        setIsPlaying((prev) => !prev);
    };

    const prevTrack = () => {
        setCurrentTrackIndex((i) =>
        i === 0 ? musicList.length - 1 : i - 1
        );
        setIsPlaying(true);
    };

    const nextTrack = () => {
        setCurrentTrackIndex((i) =>
        i === musicList.length - 1 ? 0 : i + 1
        );
        setIsPlaying(true);
    };

    return (
        <div className="header_comp w-full">
            <ul className="flex flex-wrap items-center justify-between h-full px-4 md:px-6">
                <div className="owner_name flex items-center px-3 py-1.5 md:px-5 md:py-2 rounded-lg">
                    <h1 className="text-black text-base md:text-lg">Julle Myth Vicentillo</h1>
                </div>
                <div className="soundtrip flex items-center px-3 py-1 md:px-5 md:py-1 space-x-3 md:space-x-4 rounded-lg">
                    <div className="flex items-end space-x-1 gap-1 p-2" style={{ width: 36 }}>
                        {barHeights.map((height, i) => (
                            <div
                                key={i}
                                className="bg-black rounded"
                                style={{
                                    width: 3,
                                    height: `${height}px`,
                                    transition: 'height 0.16s cubic-bezier(.4,0,.2,1)'
                                }}
                            />
                        ))}
                    </div>

                    <div className="italic text-gray-600 text-xs md:text-sm whitespace-nowrap">
                        {musicList[currentTrackIndex].title}
                    </div>

                    <div className="h-8 border-l border-gray-300 mx-2"></div>

                    <div className="flex items-center space-x-2 gap-1.5">
                        <button
                            onClick={prevTrack}
                            className="p-1 rounded hover:bg-gray-100"
                            aria-label="Previous Track"
                            type="button"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                fill="currentColor"
                                viewBox="0 0 16 16"
                            >
                                <path d="M11 2.5a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.79.407L5 8.972V13a.5.5 0 0 1-1 0V3a.5.5 0 0 1 1 0v4.028l5.71-4.435A.5.5 0 0 1 11 2.5z" />
                            </svg>
                        </button>

                        <button
                            onClick={togglePlay}
                            className="bg-black text-white p-2 rounded-full hover:bg-gray-800 flex items-center justify-center"
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                            type="button"
                        >
                            {isPlaying ? (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    fill="currentColor"
                                    viewBox="0 0 16 16"
                                >
                                    <path d="M5 3h2v10H5V3zm4 0h2v10H9V3z" />
                                </svg>
                            ) : (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    fill="currentColor"
                                    viewBox="0 0 16 16"
                                >
                                    <path d="M10.804 8 5 4.633v6.734zm.792-.696a.802.802 0 0 1 0 1.392l-6.363 3.692C4.713 12.69 4 12.345 4 11.692V4.308c0-.653.713-.998 1.233-.696z" />
                                </svg>
                            )}
                        </button>

                        <button
                            onClick={nextTrack}
                            className="p-1 rounded hover:bg-gray-100"
                            aria-label="Next Track"
                            type="button"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                fill="currentColor"
                                viewBox="0 0 16 16"
                            >
                                <path d="M5 2.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .79.407L11 8.972V13a.5.5 0 0 0 1 0V3a.5.5 0 0 0-1 0v4.028l-5.71-4.435A.5.5 0 0 0 5 2.5z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </ul>

            <audio
                ref={audioRef}
                src={musicList[currentTrackIndex].src}
                onEnded={nextTrack}
                preload="auto"
            />
        </div>
    );
};

export default Header;
