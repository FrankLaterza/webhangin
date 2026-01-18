'use client';

import { ReactNode, useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';

interface NineSliceBoxProps {
    children?: ReactNode;
    className?: string;
    /** Size of each tile in the 3x3 source texture (default 62 for 186x186 texture) */
    cornerSize?: number;
    /** Scale multiplier for rendered corners (default 0.35 = ~22px corners) */
    scale?: number;
    /** Optional custom texture path */
    texturePath?: string;
    /** Optional onClick handler */
    onClick?: () => void;
    /** Optional padding inside the box (CSS value) */
    padding?: string;
    /** Render as button, link, or div */
    as?: 'div' | 'button' | 'a';
    href?: string;
}

/**
 * NineSliceBox - Canvas-based 9-slice UI component
 *
 * Texture is a 186x186 image divided into a 3x3 grid (62px per tile):
 *   [TL] [T] [TR]
 *   [L]  [C] [R]
 *   [BL] [B] [BR]
 */
export function NineSliceBox({
    children,
    className = '',
    cornerSize = 62,
    scale = 0.35,
    texturePath = '/assets/textures/ui_generation_box_1.png',
    onClick,
    padding = '8px 12px',
    as = 'div',
    href,
}: NineSliceBoxProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [ready, setReady] = useState(false);

    // Load texture
    useEffect(() => {
        const img = new Image();
        img.onload = () => setImage(img);
        img.src = texturePath;
    }, [texturePath]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !image) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = container.getBoundingClientRect();
        const W = Math.ceil(rect.width);
        const H = Math.ceil(rect.height);
        if (W === 0 || H === 0) return;

        // High DPI support
        const dpr = window.devicePixelRatio || 1;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = false;

        // Source texture info
        const sw = image.width;
        const sh = image.height;
        const cs = cornerSize;

        // Rendered corner size
        const rc = cs * scale;
        const maxCorner = Math.min(rc, W / 2, H / 2);

        // Source middle section
        const smw = sw - cs * 2;
        const smh = sh - cs * 2;

        // Dest middle section
        const dmw = W - maxCorner * 2;
        const dmh = H - maxCorner * 2;

        ctx.clearRect(0, 0, W, H);

        // Round corner size to avoid seams
        const c = Math.round(maxCorner);
        // Add 1px overlap to prevent seams between tiles
        const overlap = 1;

        // Draw 9 slices with overlap to prevent seams
        // Top-left
        ctx.drawImage(image, 0, 0, cs, cs, 0, 0, c + overlap, c + overlap);
        // Top edge
        if (dmw > 0 && smw > 0) {
            ctx.drawImage(image, cs, 0, smw, cs, c, 0, W - c * 2, c + overlap);
        }
        // Top-right
        ctx.drawImage(image, sw - cs, 0, cs, cs, W - c - overlap, 0, c + overlap, c + overlap);
        // Left edge
        if (dmh > 0 && smh > 0) {
            ctx.drawImage(image, 0, cs, cs, smh, 0, c, c + overlap, H - c * 2);
        }
        // Center
        if (dmw > 0 && dmh > 0 && smw > 0 && smh > 0) {
            ctx.drawImage(image, cs, cs, smw, smh, c, c, W - c * 2, H - c * 2);
        }
        // Right edge
        if (dmh > 0 && smh > 0) {
            ctx.drawImage(image, sw - cs, cs, cs, smh, W - c - overlap, c, c + overlap, H - c * 2);
        }
        // Bottom-left
        ctx.drawImage(image, 0, sh - cs, cs, cs, 0, H - c - overlap, c + overlap, c + overlap);
        // Bottom edge
        if (dmw > 0 && smw > 0) {
            ctx.drawImage(image, cs, sh - cs, smw, cs, c, H - c - overlap, W - c * 2, c + overlap);
        }
        // Bottom-right
        ctx.drawImage(image, sw - cs, sh - cs, cs, cs, W - c - overlap, H - c - overlap, c + overlap, c + overlap);

    }, [image, cornerSize, scale]);

    // Mark ready after first render to trigger draw
    useLayoutEffect(() => {
        setReady(true);
    }, []);

    // Observe and redraw
    useEffect(() => {
        if (!containerRef.current || !image || !ready) return;

        // Initial draw with slight delay to ensure layout is complete
        const timer = setTimeout(() => draw(), 10);

        const observer = new ResizeObserver(() => requestAnimationFrame(draw));
        observer.observe(containerRef.current);

        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [image, draw, ready]);

    // Always use a div wrapper for consistent ref/sizing behavior
    // The semantic element is handled via onClick/href behavior
    const handleClick = (e: React.MouseEvent) => {
        if (as === 'a' && href) {
            // Let the nested anchor handle navigation
            return;
        }
        onClick?.();
    };

    // Don't override position if className has positioning classes (let Tailwind handle it)
    const hasPositionClass = /\b(absolute|relative|fixed|sticky)\b/.test(className);

    const containerStyle: React.CSSProperties = {
        ...(!hasPositionClass && { position: 'relative' }),
        display: 'inline-block',
    };

    const canvasStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        imageRendering: 'pixelated',
    };

    const contentStyle: React.CSSProperties = {
        position: 'relative',
        zIndex: 1,
        padding,
        cursor: onClick || as === 'button' || as === 'a' ? 'pointer' : 'default',
    };

    // Render content based on semantic type
    const renderContent = () => {
        if (as === 'a' && href) {
            return (
                <a href={href} style={{ ...contentStyle, display: 'block', textDecoration: 'none', color: 'inherit' }}>
                    {children}
                </a>
            );
        }
        if (as === 'button') {
            return (
                <button onClick={onClick} style={{ ...contentStyle, display: 'block', border: 'none', background: 'none', width: '100%', textAlign: 'left' }}>
                    {children}
                </button>
            );
        }
        return (
            <div style={contentStyle} onClick={onClick}>
                {children}
            </div>
        );
    };

    return (
        <div ref={containerRef} className={className} style={containerStyle}>
            <canvas ref={canvasRef} style={canvasStyle} />
            {renderContent()}
        </div>
    );
}

// Button variant
interface NineSliceButtonProps extends Omit<NineSliceBoxProps, 'as'> {
    disabled?: boolean;
}

export function NineSliceButton({ onClick, disabled, className = '', ...props }: NineSliceButtonProps) {
    return (
        <NineSliceBox
            {...props}
            as="button"
            onClick={disabled ? undefined : onClick}
            className={`${className} ${disabled ? 'opacity-50' : 'hover:brightness-110 active:brightness-95'} transition-all`}
        />
    );
}

// Link variant
interface NineSliceLinkProps extends Omit<NineSliceBoxProps, 'as'> {
    href: string;
}

export function NineSliceLink({ href, className = '', ...props }: NineSliceLinkProps) {
    return (
        <NineSliceBox
            {...props}
            as="a"
            href={href}
            className={`${className} hover:brightness-110 transition-all`}
        />
    );
}
