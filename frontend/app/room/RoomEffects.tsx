import React from 'react';
import { EffectComposer, Pixelation, Vignette, HueSaturation, Noise, Sepia } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

export function RoomEffects({ variant = 'default' }: { variant?: 'default' | 'camping' }) {
    if (variant === 'default') {
        return (
            <EffectComposer enableNormalPass>
                <Pixelation granularity={2} />
                {/* Subtle vignette for default room */}
                {/* <Vignette eskil={false} offset={0.1} darkness={0.3} /> */}
            </EffectComposer>
        );
    }

    // Webfishing / Camping Aesthetic
    return (
        <EffectComposer enableNormalPass>
            {/* Lo-fi Pixelation (DS/Flash vibe) */}
            <Pixelation granularity={0} />

            {/* Muted Colors (Fall vibes) */}
            {/* <HueSaturation saturation={0.2} /> */}

            {/* Warmth (Sepia) */}
            {/* <Sepia intensity={0.0} /> */}

            {/* Cozy Vignette */}
            {/* <Vignette eskil={false} offset={0.1} darkness={0.5} /> */}

            {/* Texture/Grain */}
            {/* <Noise opacity={0.05} blendFunction={BlendFunction.OVERLAY} /> */}
        </EffectComposer>
    );
}
