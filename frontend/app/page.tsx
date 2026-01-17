'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

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
}

interface PlayerData {
  name: string;
  color: string;
  activity: string;
  facialFeatures: FacialFeatures;
}

// Available facial feature options
const FACIAL_OPTIONS = {
  eyes: [
    { id: 'dreary', label: 'Dreary' }
  ],
  nose: [
    { id: 'kitty_opt', label: 'Kitty' }
  ],
  mouth: [
    { id: 'meow', label: 'Meow' }
  ]
};

// 3D Cat Preview with facial textures
function CatPreview({ facialFeatures, color }: { facialFeatures: FacialFeatures; color: string }) {
  const { scene } = useGLTF('/assets/models/TWISTED_cat_character.glb');
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  // Load facial textures
  const eyeTexture = useTexture(
    `/assets/textures/character_facial_textures/eyes/eyes_${facialFeatures.eyeStyle}.png`
  );
  const noseTexture = useTexture(
    `/assets/textures/character_facial_textures/nose/nose_${facialFeatures.noseStyle}.png`
  );
  const mouthTexture = useTexture(
    `/assets/textures/character_facial_textures/mouth/mouth_${facialFeatures.mouthStyle}.png`
  );

  // GLB models from Blender typically need flipY = false
  eyeTexture.flipY = false;
  noseTexture.flipY = false;
  mouthTexture.flipY = false;

  // Apply textures and colors to named meshes
  useEffect(() => {
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
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

  return (
    <group rotation={[0.2, 0.5, 0]}>
      <primitive object={clone} scale={0.6} position={[0, -0.8, 0]} />
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
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
      <div className="flex gap-2 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={`px-4 py-2 rounded-lg border transition ${
              selected === opt.id
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

export default function Home() {
  const router = useRouter();
  const [isReturning, setIsReturning] = useState(false);
  const [playerData, setPlayerData] = useState<PlayerData>({
    name: '',
    color: '#ff9500',
    activity: '',
    facialFeatures: {
      eyeStyle: 'dreary',
      noseStyle: 'kitty_opt',
      mouthStyle: 'meow',
    },
  });

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
          };
        }
        // Remove old shape field if present
        delete parsed.shape;
        setPlayerData(parsed);
        setIsReturning(true);
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
  };

  const colors = ['#ff9500', '#ff6b9d', '#6b9dff', '#9dff6b', '#ff6b6b', '#6bfff5', '#c06bff'];

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 overflow-hidden">
      {/* Fullscreen 3D Canvas */}
      <div className="fixed inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <pointLight position={[-10, -10, -10]} intensity={0.3} />
          <CatPreview facialFeatures={playerData.facialFeatures} color={playerData.color} />
        </Canvas>
      </div>

      {/* Title - centered top */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-20 text-center">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">
          WebHangin&apos;
        </h1>
        <p className="text-gray-400 mt-1 text-sm">Hang out with others while doing your thing</p>
      </div>

      {/* Floating Panel - left side */}
      <div className="fixed left-6 top-1/2 -translate-y-1/2 z-10 w-80 bg-black/50 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-5 max-h-[85vh] overflow-y-auto">
        {/* Welcome back message */}
        {isReturning && (
          <div className="px-4 py-2 bg-green-500/20 border border-green-500/50 rounded-lg">
            <p className="text-green-300 text-sm">Welcome back, <strong>{playerData.name}</strong>!</p>
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Your Name</label>
          <input
            type="text"
            value={playerData.name}
            onChange={(e) => setPlayerData({ ...playerData, name: e.target.value })}
            placeholder="Enter your name..."
            className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
          />
        </div>

        {/* Activity */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">What are you doing?</label>
          <input
            type="text"
            value={playerData.activity}
            onChange={(e) => setPlayerData({ ...playerData, activity: e.target.value })}
            placeholder="e.g. practicing guitar, drawing..."
            className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
          />
          <p className="mt-1 text-xs text-gray-500">This determines which themed room you&apos;ll join</p>
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Color</label>
          <div className="flex gap-2 flex-wrap">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setPlayerData({ ...playerData, color: c })}
                className={`w-9 h-9 rounded-full border-2 transition ${
                  playerData.color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Facial Features */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">Customize Face</h3>

          <FeatureSelector
            label="Eyes"
            options={FACIAL_OPTIONS.eyes}
            selected={playerData.facialFeatures.eyeStyle}
            onSelect={(id) => updateFacialFeature('eyeStyle', id)}
            featureType="eyes"
          />

          <FeatureSelector
            label="Nose"
            options={FACIAL_OPTIONS.nose}
            selected={playerData.facialFeatures.noseStyle}
            onSelect={(id) => updateFacialFeature('noseStyle', id)}
            featureType="nose"
          />

          <FeatureSelector
            label="Mouth"
            options={FACIAL_OPTIONS.mouth}
            selected={playerData.facialFeatures.mouthStyle}
            onSelect={(id) => updateFacialFeature('mouthStyle', id)}
            featureType="mouth"
          />
        </div>

        {/* Join Button */}
        <button
          onClick={handleJoin}
          className="w-full py-4 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 rounded-lg font-bold text-lg transition transform hover:scale-[1.02] active:scale-[0.98] text-white"
        >
          Join Room
        </button>
      </div>
    </div>
  );
}

// Preload the cat model so it's ready immediately
useGLTF.preload('/assets/models/TWISTED_cat_character.glb');
