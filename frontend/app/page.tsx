'use client';

import { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture, useAnimations } from '@react-three/drei';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import localFont from 'next/font/local';
import { AnimaleseSpeechBubble, getRandomPhrase } from './AnimaleseSpeechBubble';
import { PixelArtCanvas } from './components/PixelArtCanvas';

// Load custom font for character creation page
const thinSans = localFont({
  src: '../public/assets/ThinSans.ttf',
  variable: '--font-thin-sans',
});

// ============================================================================
// PIXEL ART TEXTURE UTILITIES
// ============================================================================

/**
 * usePixelTexture - Hook to load a texture with pixel art settings (no antialiasing).
 * Applies NearestFilter for crisp, hard-edged pixels.
 *
 * @param path - Path to the texture file
 * @param flipY - Whether to flip the texture vertically (default: true, set false for GLB models)
 *
 * @example
 * const texture = usePixelTexture('/path/to/texture.png', false);
 */
function usePixelTexture(path: string, flipY: boolean = true): THREE.Texture {
  const texture = useTexture(path);

  texture.flipY = flipY;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  return texture;
}

/**
 * applyPixelTextureSettings - Utility to apply pixel art settings to an existing texture.
 * Use this when you already have a texture and want to make it crisp.
 *
 * @param texture - The texture to modify
 * @param flipY - Whether to flip the texture vertically (default: true)
 *
 * @example
 * const texture = useTexture('/path/to/texture.png');
 * applyPixelTextureSettings(texture, false);
 */
function applyPixelTextureSettings(texture: THREE.Texture, flipY: boolean = true): void {
  texture.flipY = flipY;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
}

// ============================================================================
// END PIXEL ART UTILITIES
// ============================================================================

// ============================================================================
// SCROLLING TILED BACKGROUND
// ============================================================================

/**
 * ScrollingTiledBackground - A tiled background that scrolls diagonally.
 * Uses a canvas for proper pixelated rendering.
 *
 * @param imageSrc - Path to the tile image
 * @param tileSize - Size of each tile in pixels (default: 128)
 * @param scrollSpeed - Speed of diagonal scroll in pixels per second (default: 20)
 * @param pixelated - Whether to use pixelated rendering (default: true)
 * @param pixelScale - Resolution scale for chunky pixels (lower = bigger pixels, default: 1)
 */
function ScrollingTiledBackground({
  imageSrc,
  tileSize = 128,
  scrollSpeed = 20,
  pixelated = true,
  pixelScale = 1,
}: {
  imageSrc: string;
  tileSize?: number;
  scrollSpeed?: number;
  pixelated?: boolean;
  pixelScale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load the image
    const img = new Image();
    img.src = imageSrc;
    imageRef.current = img;

    let animationId: number;
    let lastTime = performance.now();

    // Scale down canvas resolution for chunkier pixels
    const scaledTileSize = tileSize * pixelScale;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth * pixelScale;
      canvas.height = window.innerHeight * pixelScale;
    };

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // Update offset (scaled)
      offsetRef.current.x = (offsetRef.current.x + scrollSpeed * pixelScale * deltaTime) % scaledTileSize;
      offsetRef.current.y = (offsetRef.current.y + scrollSpeed * pixelScale * deltaTime) % scaledTileSize;

      // Clear and draw
      if (imageRef.current?.complete) {
        ctx.imageSmoothingEnabled = !pixelated;

        // Draw tiles to cover the entire canvas
        const startX = -offsetRef.current.x;
        const startY = -offsetRef.current.y;

        for (let y = startY; y < canvas.height; y += scaledTileSize) {
          for (let x = startX; x < canvas.width; x += scaledTileSize) {
            ctx.drawImage(imageRef.current, x, y, scaledTileSize, scaledTileSize);
          }
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    img.onload = () => {
      resizeCanvas();
      animationId = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', resizeCanvas);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [imageSrc, tileSize, scrollSpeed, pixelated, pixelScale]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      style={{ imageRendering: pixelated ? 'pixelated' : 'auto' }}
    />
  );
}

// ============================================================================
// END SCROLLING TILED BACKGROUND
// ============================================================================

// Cookie helpers
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days: number = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

interface FacialFeatures {
  eyeStyle: string;
  noseStyle: string;
  mouthStyle: string;
  characterType: 'cat' | 'dog';
}

interface PlayerData {
  name: string;
  color: string;
  activity: string;
  facialFeatures: FacialFeatures;
}

// Available facial feature options per character type
const FACIAL_OPTIONS = {
  cat: {
    eyes: [
      { id: 'dreary', label: 'Dreary' },
      { id: 'awake', label: 'Awake' },
      { id: 'stars', label: 'Stars' },
      { id: 'woozy', label: 'Woozy' }
    ],
    nose: [
      { id: 'kitty_opt', label: 'Kitty' },
      { id: 'button', label: 'Button' },
      { id: 'emoticon', label: 'Emoticon' },
      { id: 'floppy', label: 'Floppy' },
      { id: 'stub', label: 'Stub' }
    ],
    mouth: [
      { id: 'meow', label: 'Meow' },
      { id: 'bah', label: 'Bah' },
      { id: 'cheek', label: 'Cheek' },
      { id: 'hmph', label: 'Hmph' },
      { id: 'meowhaha', label: 'Meowhaha' }
    ]
  },
  dog: {
    eyes: [
      { id: 'dog_eye_1', label: 'Sweet' }
    ],
    nose: [
      { id: 'dog_nose_1', label: 'Normal' },
      { id: 'dog_nose_2', label: 'Wet' },
      { id: 'dog_nose_3', label: 'Snoot' }
    ],
    mouth: [] // No dog mouth options yet
  }
};

// 3D Cat Preview with facial textures
function CatPreview({ facialFeatures, color }: { facialFeatures: FacialFeatures; color: string }) {
  const { scene, animations } = useGLTF('/assets/models/TWISTED_cat_character.glb');
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, clone);

  // Play idle animation on mount
  useEffect(() => {
    const idleAction = actions['IdleAnimation'] || actions['IdleStash'] || actions['Idle'];
    if (idleAction) {
      idleAction.reset().fadeIn(0.3).play();
    }
    return () => {
      if (idleAction) idleAction.fadeOut(0.3);
    };
  }, [actions]);

  // Load facial textures with pixel art settings (flipY=false for GLB models)
  const eyeTexture = usePixelTexture(
    `/assets/textures/character_facial_textures/eyes/eyes_${facialFeatures.eyeStyle}.png`,
    false
  );
  const noseTexture = usePixelTexture(
    `/assets/textures/character_facial_textures/nose/nose_${facialFeatures.noseStyle}.png`,
    false
  );
  const mouthTexture = usePixelTexture(
    `/assets/textures/character_facial_textures/mouth/mouth_${facialFeatures.mouthStyle}.png`,
    false
  );

  // Apply textures and colors to named meshes
  useEffect(() => {
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Apply NearestFilter to any existing textures for crisp pixels
        if (child.material instanceof THREE.MeshStandardMaterial) {
          if (child.material.map) {
            child.material.map.minFilter = THREE.NearestFilter;
            child.material.map.magFilter = THREE.NearestFilter;
            child.material.map.generateMipmaps = false;
            child.material.map.needsUpdate = true;
          }
        }

        switch (child.name) {
          case 'twisted_cat':
            // Apply fur color to body mesh
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.color.set(color);
              child.material.needsUpdate = true;
            }
            break;
          case 'twisted_cat_eyes_mesh':
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.map = eyeTexture;
              child.material.transparent = true;
              child.material.alphaTest = 0.1;
              child.material.color.set(0xffffff); // White base so texture shows correctly
              child.material.needsUpdate = true;
            }
            break;
          case 'twisted_cat_nose_mesh':
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.map = noseTexture;
              child.material.transparent = true;
              child.material.alphaTest = 0.1;
              child.material.color.set(0xffffff);
              child.material.needsUpdate = true;
            }
            break;
          case 'twisted_cat_mouth_mesh':
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.map = mouthTexture;
              child.material.transparent = true;
              child.material.alphaTest = 0.1;
              child.material.color.set(0xffffff);
              child.material.needsUpdate = true;
            }
            break;
        }
      }
    });
  }, [clone, color, eyeTexture, noseTexture, mouthTexture]);

  return <primitive object={clone} scale={0.6} position={[0, -0.8, 0]} />;
}

// 3D Dog Preview with facial textures
function DogPreview({ facialFeatures, color }: { facialFeatures: FacialFeatures; color: string }) {
  const { scene, animations } = useGLTF('/assets/models/TWISTED_dog_character.glb');
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, clone);

  // Play idle animation on mount
  useEffect(() => {
    const idleAction = actions['IdleAnimation'] || actions['IdleStash'] || actions['Idle'];
    if (idleAction) {
      idleAction.reset().fadeIn(0.3).play();
    }
    return () => {
      if (idleAction) idleAction.fadeOut(0.3);
    };
  }, [actions]);

  // Load facial textures with pixel art settings (dog uses different naming convention)
  const eyeTexture = usePixelTexture(
    `/assets/textures/character_facial_textures/eyes/${facialFeatures.eyeStyle}.png`,
    false
  );
  const noseTexture = usePixelTexture(
    `/assets/textures/character_facial_textures/nose/${facialFeatures.noseStyle}.png`,
    false
  );

  // Apply textures and colors to named meshes
  useEffect(() => {
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Apply NearestFilter to any existing textures for crisp pixels
        if (child.material instanceof THREE.MeshStandardMaterial) {
          if (child.material.map) {
            child.material.map.minFilter = THREE.NearestFilter;
            child.material.map.magFilter = THREE.NearestFilter;
            child.material.map.generateMipmaps = false;
            child.material.map.needsUpdate = true;
          }
        }

        switch (child.name) {
          case 'twisted_dog':
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.color.set(color);
              child.material.needsUpdate = true;
            }
            break;
          case 'twisted_dog_eyes_mesh':
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.map = eyeTexture;
              child.material.transparent = true;
              child.material.alphaTest = 0.1;
              child.material.color.set(0xffffff);
              child.material.needsUpdate = true;
            }
            break;
          case 'twisted_dog_nose_mesh':
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.map = noseTexture;
              child.material.transparent = true;
              child.material.alphaTest = 0.1;
              child.material.color.set(0xffffff);
              child.material.needsUpdate = true;
            }
            break;
        }
      }
    });
  }, [clone, color, eyeTexture, noseTexture]);

  return <primitive object={clone} scale={0.6} position={[0, -0.8, 0]} />;
}

// Default rotation for character preview
const DEFAULT_ROTATION: [number, number, number] = [0, 0.9, 0];

// Interactive character preview with drag rotation
function InteractiveCharacterPreview({
  facialFeatures,
  color
}: {
  facialFeatures: FacialFeatures;
  color: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { gl } = useThree();

  // Track drag state
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const currentRotation = useRef({ x: DEFAULT_ROTATION[0], y: DEFAULT_ROTATION[1] });
  const targetRotation = useRef({ x: DEFAULT_ROTATION[0], y: DEFAULT_ROTATION[1] });
  const releaseTime = useRef<number | null>(null); // Track when mouse was released
  const GRACE_PERIOD = 1000; // 1 second grace period before easing back

  // Set up mouse event listeners
  useEffect(() => {
    const canvas = gl.domElement;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      releaseTime.current = null; // Cancel any pending ease-back
      lastMouse.current = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const deltaX = e.clientX - lastMouse.current.x;

      // Update target rotation based on drag - only Y axis (horizontal spin)
      targetRotation.current.y += deltaX * 0.01;

      lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        canvas.style.cursor = 'grab';
        // Start grace period timer
        releaseTime.current = Date.now();
      }
    };

    const handleMouseLeave = () => {
      if (isDragging.current) {
        isDragging.current = false;
        canvas.style.cursor = 'grab';
        // Start grace period timer
        releaseTime.current = Date.now();
      }
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [gl]);

  // Animate rotation with easing
  useFrame(() => {
    if (!groupRef.current) return;

    // Check if grace period has passed and we should ease back to default
    const shouldEaseBack = releaseTime.current !== null &&
      Date.now() - releaseTime.current > GRACE_PERIOD;

    if (shouldEaseBack) {
      // Set target back to default
      targetRotation.current.x = DEFAULT_ROTATION[0];
      targetRotation.current.y = DEFAULT_ROTATION[1];
    }

    const easeSpeed = isDragging.current ? 0.3 : 0.05; // Faster when dragging, slower ease-back

    // Lerp current rotation toward target
    currentRotation.current.x += (targetRotation.current.x - currentRotation.current.x) * easeSpeed;
    currentRotation.current.y += (targetRotation.current.y - currentRotation.current.y) * easeSpeed;

    // Apply rotation to group - only X (tilt) and Y (spin), lock Z to 0
    groupRef.current.rotation.set(
      currentRotation.current.x,
      currentRotation.current.y,
      0,
      'YXZ' // Rotation order: Y first, then X - prevents gimbal lock issues
    );
  });

  return (
    <group ref={groupRef} rotation-order="YXZ">
      {facialFeatures.characterType === 'cat' ? (
        <CatPreview facialFeatures={facialFeatures} color={color} />
      ) : (
        <DogPreview facialFeatures={facialFeatures} color={color} />
      )}
    </group>
  );
}

// Feature selector component
function FeatureSelector({
  label,
  options,
  selected,
  onSelect,
  featureType
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
  featureType: 'eyes' | 'nose' | 'mouth';
}) {
  return (
    <div className="pb-1">
      <label className="block text-xs font-medium text-black mb-2">{label}</label>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition ${selected === opt.id
              ? 'bg-orange-500 border-orange-500 text-white'
              : 'bg-black/30 border-white/20 hover:border-white/40 text-gray-300'
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Animated journal sprite sheet container
function AnimatedJournal({ children }: { children: React.ReactNode }) {
  const [dimensions, setDimensions] = useState({ width: 720, height: 900 });

  // Base sprite dimensions
  const BASE_WIDTH = 720;
  const BASE_HEIGHT = 900;
  const ASPECT_RATIO = BASE_WIDTH / BASE_HEIGHT;

  // Calculate responsive dimensions based on viewport
  useEffect(() => {
    const calculateDimensions = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // Target: 90% of viewport height, with some padding
      const maxHeight = vh * 0.9;
      // Also limit width to not exceed 45% of viewport width
      const maxWidth = vw * 0.45;

      // Calculate dimensions maintaining aspect ratio
      let height = Math.min(maxHeight, BASE_HEIGHT);
      let width = height * ASPECT_RATIO;

      // If width exceeds max, scale down based on width instead
      if (width > maxWidth) {
        width = maxWidth;
        height = width / ASPECT_RATIO;
      }

      setDimensions({ width, height });
    };

    calculateDimensions();
    window.addEventListener('resize', calculateDimensions);
    return () => window.removeEventListener('resize', calculateDimensions);
  }, []);

  return (
    <div
      className="fixed right-12 top-1/2 -translate-y-1/2 z-10"
      style={{
        width: dimensions.width,
        height: dimensions.height,
      }}
    >
      {/* Animated gif background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'url(/assets/textures/character_creation_journal.gif)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
          imageRendering: 'pixelated',
        }}
      />
      {/* Children rendered directly for absolute positioning support */}
      {children}
    </div>
  );
}

// Content area within the journal (for scrollable form content)
function JournalContent({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 px-12 pb-8 overflow-y-auto z-10"
      style={{ paddingTop: '32%' }}
    >
      {children}
    </div>
  );
}

// Scaling text input that fills the box height and scales down when text is too wide
function ScalingTextInput({
  value,
  onChange,
  placeholder,
  position,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  position: { left: string; top: string; width: string; height: string };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(48); // Start with a large font size

  // Recalculate font size when value or container changes
  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const containerHeight = container.offsetHeight;
    const containerWidth = container.offsetWidth;

    // Base font size to fill the height (with some padding)
    const baseFontSize = containerHeight * 0.40;

    // Measure text width at base font size
    measure.style.fontSize = `${baseFontSize}px`;
    const textWidth = measure.offsetWidth;

    // If text is wider than container, scale down proportionally
    let newFontSize = baseFontSize;
    if (textWidth > containerWidth && value.length > 0) {
      newFontSize = baseFontSize * (containerWidth / textWidth);
    }

    // Clamp to reasonable bounds
    newFontSize = Math.max(12, Math.min(baseFontSize, newFontSize));
    setFontSize(newFontSize);
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="absolute z-20"
      style={position}
    >
      {/* Hidden span to measure text width */}
      <span
        ref={measureRef}
        className="absolute opacity-0 pointer-events-none whitespace-nowrap"
        style={{ fontFamily: 'inherit' }}
      >
        {value || placeholder}
      </span>
      {/* Actual input */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-full bg-transparent border-none text-gray-800 placeholder-gray-400/50 focus:outline-none cursor-text"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: 1,
        }}
      />
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [playerData, setPlayerData] = useState<PlayerData>({
    name: '',
    color: '#ff9500',
    activity: '',
    facialFeatures: {
      eyeStyle: 'dreary',
      noseStyle: 'kitty_opt',
      mouthStyle: 'meow',
      characterType: 'cat',
    },
  });

  // Speech bubble state for animalese chat
  const [speechBubble, setSpeechBubble] = useState<{ message: string; timestamp: number } | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);
  const SPEECH_COOLDOWN = 5000; // 5 seconds cooldown

  // Trigger a random phrase with animalese (with cooldown)
  const triggerSpeech = () => {
    const now = Date.now();
    if (now - lastSpeechTimeRef.current < SPEECH_COOLDOWN) {
      return; // Still in cooldown
    }
    lastSpeechTimeRef.current = now;
    setSpeechBubble({
      message: getRandomPhrase(),
      timestamp: now,
    });
  };

  // Load saved player data on mount
  useEffect(() => {
    const saved = getCookie('webhangin_player');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migrate old format (had 'shape', no 'facialFeatures')
        if (!parsed.facialFeatures) {
          parsed.facialFeatures = {
            eyeStyle: 'dreary',
            noseStyle: 'kitty_opt',
            mouthStyle: 'meow',
            characterType: 'cat',
          };
        }
        // Add characterType if missing (migration)
        if (!parsed.facialFeatures.characterType) {
          parsed.facialFeatures.characterType = 'cat';
        }
        // Remove old shape field if present
        delete parsed.shape;
        setPlayerData(parsed);
      } catch (e) {
        console.error('Failed to parse saved player data');
      }
    }
  }, []);

  const handleJoin = () => {
    if (!playerData.name.trim() || !playerData.activity.trim()) {
      alert('Please enter your name and activity!');
      return;
    }

    // Save to cookie
    setCookie('webhangin_player', JSON.stringify(playerData));

    // Navigate to room with query params
    const params = new URLSearchParams({
      name: playerData.name,
      color: playerData.color,
      activity: playerData.activity,
      eyeStyle: playerData.facialFeatures.eyeStyle,
      noseStyle: playerData.facialFeatures.noseStyle,
      mouthStyle: playerData.facialFeatures.mouthStyle,
      characterType: playerData.facialFeatures.characterType,
    });
    router.push(`/room?${params.toString()}`);
  };

  const updateFacialFeature = (feature: keyof FacialFeatures, value: string) => {
    setPlayerData({
      ...playerData,
      facialFeatures: {
        ...playerData.facialFeatures,
        [feature]: value,
      },
    });
    triggerSpeech();
  };

  const colors = ['#ff9500', '#ff6b9d', '#6b9dff', '#9dff6b', '#ff6b6b', '#6bfff5', '#c06bff'];

  return (
    <div className={`h-screen w-screen overflow-hidden ${thinSans.className}`}>
      {/* Scrolling tiled background */}
      <ScrollingTiledBackground
        imageSrc="/assets/textures/character_creation_background_tile.png"
        tileSize={200}
        scrollSpeed={5}
        pixelated={true}
        pixelScale={0.5}
      />

      {/* 3D Canvas - Left side */}
      <div className="fixed left-0 top-0 bottom-0 w-1/2 z-0">
        <PixelArtCanvas
          camera={{ position: [1, 0, 2], fov: 50 }}
          flat
          pixelSize={0.25}
        >
          <ambientLight intensity={3.0} />
          <Suspense fallback={null}>
            <InteractiveCharacterPreview
              facialFeatures={playerData.facialFeatures}
              color={playerData.color}
            />
          </Suspense>
        </PixelArtCanvas>

        {/* Speech bubble - positioned above character */}
        {speechBubble && (
          <div className="absolute left-1/2 top-[12%] -translate-x-1/2 z-10">
            <AnimaleseSpeechBubble
              message={speechBubble.message}
              timestamp={speechBubble.timestamp}
              onComplete={() => setSpeechBubble(null)}
            />
          </div>
        )}
      </div>

      {/* Logo - centered top */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-20">
        <img
          src="/assets/textures/webhangin_logo.gif"
          alt="WebHangin'"
          className="h-24 w-auto"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* Floating Panel - right side */}
      <AnimatedJournal>
        {/* Name input - positioned to match sprite's "My name is: ___" line */}
        <ScalingTextInput
          value={playerData.name}
          onChange={(name) => setPlayerData({ ...playerData, name })}
          placeholder="mr. cat"
          position={{ left: '56.67%', top: '1.89%', width: '41.11%', height: '7.56%' }}
        />

        {/* Activity input - positioned to match sprite's "What are you doing?: ___" line */}
        <ScalingTextInput
          value={playerData.activity}
          onChange={(activity) => setPlayerData({ ...playerData, activity })}
          placeholder="gaming"
          position={{ left: '44.40%', top: '12.20%', width: '54.86%', height: '8.11%' }}
        />

        <JournalContent>
        <div className="space-y-3">

        {/* Color */}
        <div>
          <label className="block text-xs font-medium text-black mb-1">Color</label>
          <div className="flex gap-1.5 flex-wrap">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setPlayerData({ ...playerData, color: c })}
                className={`w-7 h-7 rounded-full border-2 transition ${playerData.color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                  }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Character Type Selector */}
        <div>
          <label className="block text-xs font-medium text-black mb-1">Character</label>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                setPlayerData({
                  ...playerData,
                  facialFeatures: {
                    eyeStyle: 'dreary',
                    noseStyle: 'kitty_opt',
                    mouthStyle: 'meow',
                    characterType: 'cat',
                  },
                });
                triggerSpeech();
              }}
              className={`flex-1 py-2 text-sm rounded-lg border transition font-medium ${playerData.facialFeatures.characterType === 'cat'
                ? 'bg-orange-500 border-orange-500 text-white'
                : 'bg-black/30 border-white/20 hover:border-white/40 text-gray-300'
                }`}
            >
              🐱 Cat
            </button>
            <button
              onClick={() => {
                setPlayerData({
                  ...playerData,
                  facialFeatures: {
                    eyeStyle: 'dog_eye_1',
                    noseStyle: 'dog_nose_1',
                    mouthStyle: '',
                    characterType: 'dog',
                  },
                });
                triggerSpeech();
              }}
              className={`flex-1 py-2 text-sm rounded-lg border transition font-medium ${playerData.facialFeatures.characterType === 'dog'
                ? 'bg-orange-500 border-orange-500 text-white'
                : 'bg-black/30 border-white/20 hover:border-white/40 text-gray-300'
                }`}
            >
              🐶 Dog
            </button>
          </div>
        </div>

        {/* Facial Features */}
        <div className="space-y-3">
          <h3 className="block text-xs font-medium text-black mb-1">Customize Face</h3>

          <FeatureSelector
            label="Eyes"
            options={FACIAL_OPTIONS[playerData.facialFeatures.characterType].eyes}
            selected={playerData.facialFeatures.eyeStyle}
            onSelect={(id) => updateFacialFeature('eyeStyle', id)}
            featureType="eyes"
          />

          <FeatureSelector
            label="Nose"
            options={FACIAL_OPTIONS[playerData.facialFeatures.characterType].nose}
            selected={playerData.facialFeatures.noseStyle}
            onSelect={(id) => updateFacialFeature('noseStyle', id)}
            featureType="nose"
          />

          {FACIAL_OPTIONS[playerData.facialFeatures.characterType].mouth.length > 0 && (
            <FeatureSelector
              label="Mouth"
              options={FACIAL_OPTIONS[playerData.facialFeatures.characterType].mouth}
              selected={playerData.facialFeatures.mouthStyle}
              onSelect={(id) => updateFacialFeature('mouthStyle', id)}
              featureType="mouth"
            />
          )}
        </div>

        {/* Join Button */}
        <button
          onClick={handleJoin}
          className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 rounded-lg font-bold text-sm transition transform hover:scale-[1.02] active:scale-[0.98] text-white"
        >
          Join Room
        </button>
        </div>
        </JournalContent>
      </AnimatedJournal>
    </div>
  );
}

// Preload models so they're ready immediately
useGLTF.preload('/assets/models/TWISTED_cat_character.glb');
useGLTF.preload('/assets/models/TWISTED_dog_character.glb');

// Preload all facial textures so switching is instant (no flicker)
// Cat eyes (uses eyes_${id}.png format)
useTexture.preload('/assets/textures/character_facial_textures/eyes/eyes_dreary.png');
useTexture.preload('/assets/textures/character_facial_textures/eyes/eyes_awake.png');
useTexture.preload('/assets/textures/character_facial_textures/eyes/eyes_stars.png');
useTexture.preload('/assets/textures/character_facial_textures/eyes/eyes_woozy.png');
// Cat noses (uses nose_${id}.png format)
useTexture.preload('/assets/textures/character_facial_textures/nose/nose_kitty_opt.png');
useTexture.preload('/assets/textures/character_facial_textures/nose/nose_button.png');
useTexture.preload('/assets/textures/character_facial_textures/nose/nose_emoticon.png');
useTexture.preload('/assets/textures/character_facial_textures/nose/nose_floppy.png');
useTexture.preload('/assets/textures/character_facial_textures/nose/nose_stub.png');
// Cat mouths (uses mouth_${id}.png format)
useTexture.preload('/assets/textures/character_facial_textures/mouth/mouth_meow.png');
useTexture.preload('/assets/textures/character_facial_textures/mouth/mouth_bah.png');
useTexture.preload('/assets/textures/character_facial_textures/mouth/mouth_cheek.png');
useTexture.preload('/assets/textures/character_facial_textures/mouth/mouth_hmph.png');
useTexture.preload('/assets/textures/character_facial_textures/mouth/mouth_meowhaha.png');
// Dog eyes (uses ${id}.png format directly)
useTexture.preload('/assets/textures/character_facial_textures/eyes/dog_eye_1.png');
// Dog noses (uses ${id}.png format directly)
useTexture.preload('/assets/textures/character_facial_textures/nose/dog_nose_1.png');
useTexture.preload('/assets/textures/character_facial_textures/nose/dog_nose_2.png');
useTexture.preload('/assets/textures/character_facial_textures/nose/dog_nose_3.png');
