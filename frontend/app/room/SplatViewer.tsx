'use client';

import { useEffect, useState } from 'react';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import * as THREE from 'three';

interface SplatViewerProps {
    url: string;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
}

export function SplatViewer({ url, position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1] }: SplatViewerProps) {
    const [viewer, setViewer] = useState<any>(null);

    useEffect(() => {
        const v = new GaussianSplats3D.DropInViewer({
            gpuAcceleratedSort: false,
            sharedMemoryForWorkers: false
        });

        v.addSplatScene(url, {
            position,
            rotation,
            scale,
            splatAlphaRemovalThreshold: 5,
            showLoadingUI: true
        })
            .then(() => {

                // Debug: Check Bounding Box (Restored)
                try {
                    const splatScene = v.getSplatScene(0);
                    if (splatScene && splatScene.splatMesh) {
                        const mesh = splatScene.splatMesh;
                        mesh.geometry.computeBoundingBox();
                        const bbox = mesh.geometry.boundingBox;

                        if (bbox) {
                            const center = new THREE.Vector3();
                            bbox.getCenter(center);
                            console.error('📍 Splat Center:', center);
                            const size = new THREE.Vector3();
                            bbox.getSize(size);
                            console.error('📏 Splat Size:', size);
                            console.error('📦 BBox:', bbox);
                        }
                    }
                } catch (e) {
                    console.error('Error logging bbox:', e);
                }
            })
            .catch((err: any) => {
                if (err.toString().includes('Aborted') || err.toString().includes('Scene disposed')) {
                    // Ignore strict mode double-mount aborts
                    return;
                }
                console.error('❌ Error loading splat:', err);
            });

        setViewer(v);

        return () => {
            v.dispose();
        };
    }, [url]);

    if (!viewer) return null;

    return <primitive object={viewer} />;
}
