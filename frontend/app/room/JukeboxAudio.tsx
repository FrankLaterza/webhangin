'use client';

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface JukeboxAudioProps {
    audioSrc: string;
    position: THREE.Vector3;
    isPlaying: boolean;
    volume: number;
    soundRadius?: number;
    onEnded?: () => void;
}

export function JukeboxAudio({
    audioSrc,
    position,
    isPlaying,
    volume,
    soundRadius = 30,
    onEnded
}: JukeboxAudioProps) {
    const { camera } = useThree();
    const audioContextRef = useRef<AudioContext | null>(null);
    const pannerNodeRef = useRef<PannerNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);

    // Load and set up audio
    useEffect(() => {
        if (!audioSrc) return;

        const setupAudio = async () => {
            try {
                // Create or resume audio context
                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                }
                const audioContext = audioContextRef.current;

                // Resume context if suspended (browser autoplay policy)
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                // Fetch and decode audio
                const response = await fetch(audioSrc);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                audioBufferRef.current = audioBuffer;

                // Create gain node for volume control
                const gainNode = audioContext.createGain();
                gainNode.gain.value = volume;
                gainNodeRef.current = gainNode;

                // Create panner node for 3D positioning
                const panner = audioContext.createPanner();
                panner.panningModel = 'HRTF';
                panner.distanceModel = 'inverse';
                panner.refDistance = 5;
                panner.maxDistance = soundRadius;
                panner.rolloffFactor = 2;
                panner.coneInnerAngle = 360;
                panner.coneOuterAngle = 360;
                panner.coneOuterGain = 0;

                // Set initial position
                if (panner.positionX) {
                    panner.positionX.value = position.x;
                    panner.positionY.value = position.y;
                    panner.positionZ.value = position.z;
                }

                pannerNodeRef.current = panner;

                console.log(`🎵 Loaded jukebox audio: ${audioSrc}`);
            } catch (err) {
                console.error(`❌ Failed to load jukebox audio:`, err);
            }
        };

        setupAudio();

        return () => {
            // Cleanup will happen when component unmounts
        };
    }, [audioSrc, position, soundRadius]);

    // Handle play/pause
    useEffect(() => {
        if (!audioContextRef.current || !audioBufferRef.current || !pannerNodeRef.current || !gainNodeRef.current) {
            return;
        }

        const audioContext = audioContextRef.current;
        const audioBuffer = audioBufferRef.current;
        const panner = pannerNodeRef.current;
        const gainNode = gainNodeRef.current;

        if (isPlaying) {
            // Stop any existing source
            if (sourceNodeRef.current) {
                sourceNodeRef.current.stop();
                sourceNodeRef.current.disconnect();
            }

            // Create new source
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.loop = false;

            // Handle track end
            source.onended = () => {
                if (onEnded) {
                    onEnded();
                }
            };

            // Connect: source → gain → panner → destination
            source.connect(gainNode);
            gainNode.connect(panner);
            panner.connect(audioContext.destination);

            source.start(0);
            sourceNodeRef.current = source;

            console.log(`▶️ Playing jukebox audio`);
        } else {
            // Stop playback
            if (sourceNodeRef.current) {
                sourceNodeRef.current.stop();
                sourceNodeRef.current.disconnect();
                sourceNodeRef.current = null;
            }
        }

        return () => {
            if (sourceNodeRef.current) {
                try {
                    sourceNodeRef.current.stop();
                    sourceNodeRef.current.disconnect();
                } catch (e) {
                    // Already stopped
                }
                sourceNodeRef.current = null;
            }
        };
    }, [isPlaying, onEnded]);

    // Update volume
    useEffect(() => {
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = volume;
        }
    }, [volume]);

    // Update positions every frame
    useFrame(() => {
        if (!pannerNodeRef.current || !audioContextRef.current || !camera) return;

        const panner = pannerNodeRef.current;
        const listener = audioContextRef.current.listener;

        // Update listener position (camera)
        if (listener.positionX) {
            listener.positionX.value = camera.position.x;
            listener.positionY.value = camera.position.y;
            listener.positionZ.value = camera.position.z;
        }

        // Update listener orientation
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(camera.quaternion);

        const up = new THREE.Vector3(0, 1, 0);
        up.applyQuaternion(camera.quaternion);

        if (listener.forwardX) {
            listener.forwardX.value = forward.x;
            listener.forwardY.value = forward.y;
            listener.forwardZ.value = forward.z;
            listener.upX.value = up.x;
            listener.upY.value = up.y;
            listener.upZ.value = up.z;
        }
    });

    return null;
}
