'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';

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

interface PlayerData {
  name: string;
  shape: 'circle' | 'square';
  color: string;
  activity: string;
}

// 3D Preview of player shape
function ShapePreview({ shape, color }: { shape: 'circle' | 'square'; color: string }) {
  return (
    <mesh rotation={[0.5, 0.5, 0]}>
      {shape === 'circle' ? (
        <sphereGeometry args={[1, 32, 32]} />
      ) : (
        <boxGeometry args={[1.5, 1.5, 1.5]} />
      )}
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export default function Home() {
  const router = useRouter();
  const [isReturning, setIsReturning] = useState(false);
  const [playerData, setPlayerData] = useState<PlayerData>({
    name: '',
    shape: 'circle',
    color: '#ff9500',
    activity: '',
  });

  // Load saved player data on mount
  useEffect(() => {
    const saved = getCookie('webhangin_player');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as PlayerData;
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
      shape: playerData.shape,
      color: playerData.color,
      activity: playerData.activity,
    });
    router.push(`/room?${params.toString()}`);
  };

  const colors = ['#ff9500', '#ff6b9d', '#6b9dff', '#9dff6b', '#ff6b6b', '#6bfff5', '#c06bff'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white flex flex-col items-center justify-center p-8">
      {/* Title */}
      <h1 className="text-6xl font-bold mb-2 bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">
        WebHangin&apos;
      </h1>
      <p className="text-gray-400 mb-8 text-lg">Hang out with others while doing your thing</p>

      {/* Welcome back message */}
      {isReturning && (
        <div className="mb-6 px-6 py-3 bg-green-500/20 border border-green-500/50 rounded-lg">
          <p className="text-green-300">👋 Welcome back, <strong>{playerData.name}</strong>!</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 items-center max-w-4xl w-full">
        {/* 3D Preview */}
        <div className="w-64 h-64 bg-black/30 rounded-2xl border border-white/10 overflow-hidden">
          <Canvas camera={{ position: [0, 0, 4] }}>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <ShapePreview shape={playerData.shape} color={playerData.color} />
          </Canvas>
        </div>

        {/* Character Creator Form */}
        <div className="flex-1 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 space-y-6">
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

          {/* Shape */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Shape</label>
            <div className="flex gap-3">
              <button
                onClick={() => setPlayerData({ ...playerData, shape: 'circle' })}
                className={`flex-1 py-3 rounded-lg border transition ${playerData.shape === 'circle'
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-black/30 border-white/20 hover:border-white/40'
                  }`}
              >
                ⚪ Circle
              </button>
              <button
                onClick={() => setPlayerData({ ...playerData, shape: 'square' })}
                className={`flex-1 py-3 rounded-lg border transition ${playerData.shape === 'square'
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-black/30 border-white/20 hover:border-white/40'
                  }`}
              >
                ⬜ Square
              </button>
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setPlayerData({ ...playerData, color: c })}
                  className={`w-10 h-10 rounded-full border-2 transition ${playerData.color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                    }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Activity */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">What are you doing?</label>
            <input
              type="text"
              value={playerData.activity}
              onChange={(e) => setPlayerData({ ...playerData, activity: e.target.value })}
              placeholder="e.g. practicing guitar, drawing, coding..."
              className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
            />
            <p className="mt-1 text-xs text-gray-500">This determines which themed room you&apos;ll join</p>
          </div>

          {/* Join Button */}
          <button
            onClick={handleJoin}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 rounded-lg font-bold text-lg transition transform hover:scale-[1.02] active:scale-[0.98]"
          >
            🎮 Join Room
          </button>
        </div>
      </div>
    </div>
  );
}
