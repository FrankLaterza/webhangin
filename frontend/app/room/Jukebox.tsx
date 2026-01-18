'use client';

import { useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

interface JukeboxProps {
    position: [number, number, number];
    onInteract: () => void;
}

export function Jukebox({ position, onInteract }: JukeboxProps) {
    const groupRef = useRef<THREE.Group>(null);
    const [hovered, setHovered] = useState(false);

    // Load jukebox model
    const obj = useLoader(OBJLoader, '/assets/models/jukbox.obj');

    // Clone the model to avoid issues with multiple instances
    const model = obj.clone();

    // Set cursor style on hover
    useFrame(() => {
        if (typeof document !== 'undefined') {
            document.body.style.cursor = hovered ? 'pointer' : 'auto';
        }
    });

    return (
        <group ref={groupRef} position={position}>
            <primitive
                object={model}
                scale={0.5}
                rotation={[-Math.PI / 2, 0, 0]}
                onClick={(e: any) => {
                    e.stopPropagation();
                    onInteract();
                }}
                onPointerOver={(e: any) => {
                    e.stopPropagation();
                    setHovered(true);
                }}
                onPointerOut={() => setHovered(false)}
            />

            {/* Glow effect when hovered */}
            {hovered && (
                <pointLight
                    position={[0, 1, 0]}
                    intensity={2}
                    distance={3}
                    color="#00ff88"
                />
            )}
        </group>
    );
}
