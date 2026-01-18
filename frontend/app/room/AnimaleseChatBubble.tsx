'use client';

import { useEffect, useRef, useState } from 'react';
import { Billboard, Text } from '@react-three/drei';

// Declare global Animalese types
declare global {
    interface Window {
        Animalese?: any;
        RIFFWAVE?: any;
    }
}

interface AnimaleseChatBubbleProps {
    message: string;
    timestamp: number;
    position?: [number, number, number];
    onComplete?: () => void;
}

export function AnimaleseChatBubble({ message, timestamp, position = [0, 1.5, 0], onComplete }: AnimaleseChatBubbleProps) {
    const [displayedText, setDisplayedText] = useState('');
    const [isComplete, setIsComplete] = useState(false);
    const [isLibraryReady, setIsLibraryReady] = useState(false);
    const animaleseRef = useRef<any>(null);
    const isInitializedRef = useRef(false);

    // Initialize Animalese library
    useEffect(() => {
        if (isInitializedRef.current) return;

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
                    console.log('Animalese library loaded and ready');
                    setIsLibraryReady(true);
                });
            }
        };

        loadAnimalese();
    }, []);

    // Typing animation with Animalese audio
    useEffect(() => {
        if (!message) return;

        // Wait for library to be ready before starting animation
        if (!isLibraryReady) {
            console.log('Library not ready yet, will wait for it to load...');
            return;
        }

        console.log('Starting typing animation for:', message);
        setDisplayedText('');
        setIsComplete(false);

        let currentIndex = 0;
        const typeSpeed = 50; // milliseconds per character

        const typeNextChar = () => {
            if (currentIndex < message.length) {
                const nextChar = message[currentIndex];
                setDisplayedText(message.substring(0, currentIndex + 1));

                // Play Animalese sound for this character (only for letters)
                if (/[a-zA-Z]/.test(nextChar)) {
                    playAnimalese(nextChar);
                }

                currentIndex++;
                setTimeout(typeNextChar, typeSpeed);
            } else {
                setIsComplete(true);
                // Keep bubble visible for 3 seconds after typing completes
                setTimeout(() => {
                    if (onComplete) onComplete();
                }, 3000);
            }
        };

        // Small delay before starting to type
        const startDelay = setTimeout(() => {
            typeNextChar();
        }, 100);

        return () => {
            clearTimeout(startDelay);
        };
    }, [message, timestamp, isLibraryReady]);

    const playAnimalese = (char: string) => {
        if (!animaleseRef.current?.Animalese) return;

        try {
            // Generate Animalese audio for this character
            // Use shorten=false and pitch=1.2 for clearer sound
            const wave = animaleseRef.current.Animalese(char, false, 1.2);

            if (wave && wave.dataURI) {
                // Create audio element and play
                const audio = new Audio(wave.dataURI);
                audio.volume = 0.3; // Lower volume so it's not too loud
                audio.play().catch(err => {
                    console.warn('Failed to play Animalese audio:', err);
                });
            }
        } catch (err) {
            console.warn('Error generating Animalese:', err);
        }
    };

    if (!displayedText) return null;

    const truncatedText = displayedText.length > 35 ? displayedText.slice(0, 35) + '...' : displayedText;

    return (
        <Billboard position={position} follow={true} lockX={false} lockY={false} lockZ={false}>
            <mesh renderOrder={999}>
                <planeGeometry args={[Math.min(displayedText.length * 0.12 + 0.4, 3), 0.6]} />
                <meshBasicMaterial color="#222222" opacity={0.95} transparent depthWrite={false} />
            </mesh>
            <Text
                fontSize={0.18}
                color="white"
                anchorX="center"
                anchorY="middle"
                maxWidth={2.5}
                position={[0, 0, 0.01]}
                renderOrder={1000}
            >
                {truncatedText}
            </Text>
        </Billboard>
    );
}
