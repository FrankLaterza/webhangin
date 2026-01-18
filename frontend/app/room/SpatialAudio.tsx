'use client';

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SpatialAudioProps {
    audioStream: MediaStream;
    targetPosition: THREE.Vector3; // Position of the audio source (player)
    localPlayerPosition: THREE.Vector3; // Position of the local player (listener)
    playerId: string;
    soundRadius?: number; // Distance at which sound becomes silent
}

export function SpatialAudio({ audioStream, targetPosition, localPlayerPosition, playerId, soundRadius = 20 }: SpatialAudioProps) {
    const { camera } = useThree();
    const audioElementRef = useRef<HTMLAudioElement | null>(null);

    // Set up audio element
    useEffect(() => {
        if (!audioStream) return;

        // Create audio element
        const audioElement = document.createElement('audio');
        audioElement.srcObject = audioStream;
        audioElement.loop = false;
        audioElement.autoplay = false;
        audioElement.volume = 1.0; // Start at full volume

        // Start playing
        audioElement.play().catch((err) => {
            console.error(`❌ Failed to play audio for player ${playerId}:`, err);
        });

        audioElementRef.current = audioElement;

        return () => {
            if (audioElement) {
                audioElement.pause();
                audioElement.srcObject = null;
            }
            audioElementRef.current = null;
        };
    }, [audioStream, playerId]);

    // Update volume based on distance every frame
    useFrame(() => {
        if (!audioElementRef.current || !targetPosition || !localPlayerPosition) return;

        // Calculate distance between local player and audio source (remote player)
        const distance = localPlayerPosition.distanceTo(targetPosition);

        // Calculate volume based on distance
        let volume = 0;
        if (distance <= soundRadius) {
            // Linear falloff: 1 at distance 0, 0 at soundRadius
            volume = Math.max(0, Math.min(1, 1 - (distance / soundRadius)));
        }

        // Set volume on the audio element
        audioElementRef.current.volume = volume;
    });

    return null; // This component doesn't render anything
}
