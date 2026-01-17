'use client';

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SpatialAudioProps {
    audioStream: MediaStream;
    targetPosition: THREE.Vector3; // Position of the audio source (player)
    playerId: string;
    soundRadius?: number; // Distance at which sound becomes silent
}

export function SpatialAudio({ audioStream, targetPosition, playerId, soundRadius = 20 }: SpatialAudioProps) {
    const { camera } = useThree();
    const audioElementRef = useRef<HTMLAudioElement | null>(null);

    // Set up audio element
    useEffect(() => {
        if (!audioStream) return;

        console.log(`🔊 Setting up spatial audio for player ${playerId}`);
        console.log(`   Stream tracks:`, audioStream.getTracks().map(t => `${t.kind} - ${t.enabled ? 'enabled' : 'disabled'}`));

        // Create audio element
        const audioElement = document.createElement('audio');
        audioElement.srcObject = audioStream;
        audioElement.loop = false;
        audioElement.autoplay = false;
        audioElement.volume = 1.0; // Start at full volume

        // Start playing
        audioElement.play().then(() => {
            console.log(`✅ Audio playing for player ${playerId} - initial volume: ${audioElement.volume}`);
        }).catch((err) => {
            console.error(`❌ Failed to play audio for player ${playerId}:`, err);
        });

        audioElementRef.current = audioElement;

        return () => {
            console.log(`🧹 Cleaning up audio for player ${playerId}`);
            if (audioElement) {
                audioElement.pause();
                audioElement.srcObject = null;
            }
            audioElementRef.current = null;
        };
    }, [audioStream, playerId]);

    // Update volume based on distance every frame
    useFrame(() => {
        if (!audioElementRef.current || !targetPosition) return;

        // Calculate distance between camera and audio source
        const distance = camera.position.distanceTo(targetPosition);

        // Calculate volume based on distance
        let volume = 0;
        if (distance <= soundRadius) {
            // Linear falloff: 1 at distance 0, 0 at soundRadius
            volume = Math.max(0, Math.min(1, 1 - (distance / soundRadius)));
        }

        // Set volume on the audio element
        const previousVolume = audioElementRef.current.volume;
        audioElementRef.current.volume = volume;
        const actualVolume = audioElementRef.current.volume;

        // Detailed debug logging every 5 seconds
        if (Math.floor(Date.now() / 5000) !== Math.floor((Date.now() - 16) / 5000)) {
            // Calculate direction vector from camera to player
            const directionVector = new THREE.Vector3()
                .subVectors(targetPosition, camera.position)
                .normalize();

            // Get camera's forward direction (where it's looking)
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);

            // Calculate angle between camera forward and direction to player
            const angle = cameraDirection.angleTo(directionVector);
            const angleDegrees = THREE.MathUtils.radToDeg(angle);

            // Calculate left/right (use cross product to determine side)
            const cross = new THREE.Vector3().crossVectors(cameraDirection, directionVector);
            const side = cross.y > 0 ? 'RIGHT' : 'LEFT';

            // Determine position relative to camera
            let relativePosition = '';
            if (angleDegrees < 45) relativePosition = 'FRONT';
            else if (angleDegrees > 135) relativePosition = 'BEHIND';
            else relativePosition = side;

            console.log(`
🎧 SPATIAL AUDIO DEBUG - Player: ${playerId.slice(0, 8)}
├─ 📍 Distance: ${distance.toFixed(2)} units
├─ 🔊 Calculated Volume: ${(volume * 100).toFixed(0)}%
├─ 🎚️  Previous Volume: ${(previousVolume * 100).toFixed(0)}%
├─ ✅ Actual Volume Set: ${(actualVolume * 100).toFixed(0)}%
├─ ⚠️  Volume Changed: ${previousVolume !== actualVolume ? 'YES' : 'NO'}
├─ 📐 Angle: ${angleDegrees.toFixed(0)}° (${relativePosition})
├─ 🧭 Direction: ${side}
├─ 📌 Player Pos: (${targetPosition.x.toFixed(1)}, ${targetPosition.y.toFixed(1)}, ${targetPosition.z.toFixed(1)})
├─ 👁️  Camera Pos: (${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})
├─ 🎚️  Audio State: ${audioElementRef.current.paused ? '⏸️ PAUSED' : '▶️ PLAYING'}
├─ 🔇 Muted: ${audioElementRef.current.muted ? 'YES' : 'NO'}
└─ 🆔 Audio Element ID: ${audioElementRef.current ? 'EXISTS' : 'NULL'}
            `.trim());
        }
    });

    return null; // This component doesn't render anything
}
