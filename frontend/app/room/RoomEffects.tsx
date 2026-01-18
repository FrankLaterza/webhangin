import React from 'react';
import { EffectComposer, Pixelation, Vignette, HueSaturation, Noise, Sepia } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

export function RoomEffects({ variant = 'default' }: { variant?: 'default' | 'camping' }) {
    if (variant === 'default') {
        return (
            <EffectComposer disableNormalPass>
                <Pixelation granularity={3} />
                {/* Subtle vignette for default room */}
                {/* @ts-expect-error postprocessing types */}
                <Vignette eskil={false} offset={0.1} darkness={0.3} />
            </EffectComposer>
        );
    }

    // Webfishing / Camping Aesthetic
    return (
        <EffectComposer disableNormalPass>
            {/* Lo-fi Pixelation (DS/Flash vibe) */}
            <Pixelation granularity={0} />

            {/* Muted Colors (Fall vibes) */}
            {/* @ts-expect-error postprocessing types */}
            <HueSaturation saturation={0.2} />

            {/* Warmth (Sepia) */}
            {/* @ts-expect-error postprocessing types */}
            <Sepia intensity={0.0} />

            {/* Cozy Vignette */}
            {/* @ts-expect-error postprocessing types */}
            {/* <Vignette eskil={false} offset={0.1} darkness={0.5} /> */}

            {/* Texture/Grain */}
            {/* @ts-expect-error postprocessing types */}
            {/* <Noise opacity={0.05} blendFunction={BlendFunction.OVERLAY} /> */}
        </EffectComposer>
    );
}
