'use client';

import { useEffect, useRef, useState } from 'react';

// Declare global Animalese types
declare global {
    interface Window {
        Animalese?: any;
        RIFFWAVE?: any;
    }
}

interface AnimaleseSpeechBubbleProps {
    message: string;
    timestamp: number;
    onComplete?: () => void;
}

// Random phrases for facial feature selection
export const FEATURE_PHRASES = [
    "oooh, I like this one!",
    "how do I look?",
    "this is so me!",
    "perfect!",
    "hmmm...",
    "amazing!",
    "ooh la la!",
    "I'm lookin' good!",
    "I hope you're a judge!"
];

export function getRandomPhrase(): string {
    return FEATURE_PHRASES[Math.floor(Math.random() * FEATURE_PHRASES.length)];
}

export function AnimaleseSpeechBubble({ message, timestamp, onComplete }: AnimaleseSpeechBubbleProps) {
    const [displayedText, setDisplayedText] = useState('');
    const [isLibraryReady, setIsLibraryReady] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const animaleseRef = useRef<any>(null);
    const isInitializedRef = useRef(false);

    // Initialize Animalese library
    useEffect(() => {
        if (isInitializedRef.current) {
            // Already initialized, just mark as ready
            if (window.Animalese && animaleseRef.current) {
                setIsLibraryReady(true);
            }
            return;
        }

        const loadAnimalese = () => {
            // Check if scripts are already loaded
            if (window.RIFFWAVE && window.Animalese) {
                isInitializedRef.current = true;
                initializeAnimalese();
                return;
            }

            // Load RIFFWAVE first
            const riffwaveScript = document.createElement('script');
            riffwaveScript.src = '/lib/riffwave.js';
            riffwaveScript.onload = () => {
                // Then load Animalese
                const animaleseScript = document.createElement('script');
                animaleseScript.src = '/lib/animalese.js';
                animaleseScript.onload = () => {
                    isInitializedRef.current = true;
                    initializeAnimalese();
                };
                document.body.appendChild(animaleseScript);
            };
            document.body.appendChild(riffwaveScript);
        };

        const initializeAnimalese = () => {
            if (window.Animalese) {
                animaleseRef.current = new window.Animalese('/lib/animalese.wav', () => {
                    setIsLibraryReady(true);
                });
            }
        };

        loadAnimalese();
    }, []);

    // Typing animation with Animalese audio
    useEffect(() => {
        if (!message) return;

        // Reset state for new message
        setDisplayedText('');
        setIsVisible(true);

        // Wait for library to be ready before starting animation
        if (!isLibraryReady) {
            return;
        }

        let currentIndex = 0;
        const typeSpeed = 50; // milliseconds per character
        let timeoutId: NodeJS.Timeout;

        const typeNextChar = () => {
            if (currentIndex < message.length) {
                const nextChar = message[currentIndex];
                setDisplayedText(message.substring(0, currentIndex + 1));

                // Play Animalese sound for this character (only for letters)
                if (/[a-zA-Z]/.test(nextChar)) {
                    playAnimalese(nextChar);
                }

                currentIndex++;
                timeoutId = setTimeout(typeNextChar, typeSpeed);
            } else {
                // Keep bubble visible for 2 seconds after typing completes
                timeoutId = setTimeout(() => {
                    setIsVisible(false);
                    if (onComplete) onComplete();
                }, 2000);
            }
        };

        // Small delay before starting to type
        timeoutId = setTimeout(() => {
            typeNextChar();
        }, 100);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [message, timestamp, isLibraryReady]);

    const playAnimalese = (char: string) => {
        if (!animaleseRef.current?.Animalese) return;

        try {
            // Generate Animalese audio for this character
            const wave = animaleseRef.current.Animalese(char, false, 1.2);

            if (wave && wave.dataURI) {
                const audio = new Audio(wave.dataURI);
                audio.volume = 0.3;
                audio.play().catch(() => {
                    // Ignore autoplay errors
                });
            }
        } catch {
            // Ignore errors
        }
    };

    if (!isVisible || !displayedText) return null;

    return (
        <div className="pointer-events-none">
            {/* Speech bubble - matching main game style */}
            <div className="relative bg-[#222222]/95 text-white px-5 py-3 rounded-xl shadow-lg max-w-[320px] whitespace-nowrap">
                <span className="text-lg font-medium">{displayedText}</span>
                {/* Speech bubble tail */}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-3 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[12px] border-t-[#222222]/95" />
            </div>
        </div>
    );
}
