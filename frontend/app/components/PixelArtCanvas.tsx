'use client';

import { Canvas } from '@react-three/fiber';
import { ComponentProps } from 'react';

// ============================================================================
// PIXEL ART RENDERING UTILITIES
// ============================================================================

/**
 * PixelArtCanvas - A drop-in replacement for Canvas with pixel art rendering.
 * Renders at low resolution and scales up with nearest-neighbor filtering.
 *
 * @param pixelSize - Controls pixel size (lower = bigger pixels). Default: 0.25
 * @param disabled - When true, renders a regular Canvas without pixel art effects
 *
 * @example
 * <PixelArtCanvas pixelSize={0.25}>
 *   <mesh>...</mesh>
 * </PixelArtCanvas>
 */

type PixelArtCanvasProps = Omit<ComponentProps<typeof Canvas>, 'dpr' | 'gl'> & {
  pixelSize?: number;
  disabled?: boolean;
};

export function PixelArtCanvas({
  children,
  pixelSize = 0.25,
  disabled = false,
  style,
  ...props
}: PixelArtCanvasProps) {
  // When disabled, render a regular Canvas without pixel art effects
  if (disabled) {
    return (
      <Canvas {...props} style={style}>
        {children}
      </Canvas>
    );
  }

  return (
    <Canvas
      {...props}
      dpr={pixelSize}
      gl={{ antialias: false }}
      style={{
        imageRendering: 'pixelated',
        ...style
      }}
    >
      {children}
    </Canvas>
  );
}
