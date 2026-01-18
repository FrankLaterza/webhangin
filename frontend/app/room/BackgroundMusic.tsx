'use client';

import { useEffect, useRef, useState } from 'react';

interface BackgroundMusicProps {
    songs: { title: string; file: string }[];
    volume?: number;
    autoplay?: boolean;
}

export function BackgroundMusic({ songs, volume = 0.1, autoplay = true }: BackgroundMusicProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const isInitialized = useRef(false);

    // Initialize audio element ONCE
    useEffect(() => {
        if (isInitialized.current) return;

        const audio = new Audio();
        audio.volume = volume;
        audio.loop = false;
        audioRef.current = audio;
        isInitialized.current = true;

        // Auto-advance to next song when current ends
        const handleEnded = () => {
            setCurrentIndex((prev) => (prev + 1) % songs.length);
        };

        audio.addEventListener('ended', handleEnded);

        // Start playing first song if autoplay
        if (autoplay && songs.length > 0) {
            audio.src = songs[0].file;
            audio.play().catch(err => {
                console.log('Autoplay blocked, will play on first user interaction');
            });
        }

        return () => {
            audio.removeEventListener('ended', handleEnded);
            audio.pause();
            audio.src = '';
        };
    }, []); // Empty deps - only run once

    // Change song when index changes
    useEffect(() => {
        if (!audioRef.current || !isInitialized.current || songs.length === 0) return;

        const audio = audioRef.current;
        audio.src = songs[currentIndex].file;
        audio.play().catch(err => {
            console.log('Playback error:', err);
        });
    }, [currentIndex, songs]);

    // Update volume when prop changes
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    return null; // This component doesn't render anything
}
