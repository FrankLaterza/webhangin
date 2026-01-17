'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';

function Donut() {
  const meshRef = useRef<THREE.Mesh>(null);
  const [clicked, setClicked] = useState(false);
  const [backendMessage, setBackendMessage] = useState<string>('');

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.5;
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  const handleClick = async () => {
    setClicked(!clicked);
    console.log('Donut clicked!', { timestamp: new Date().toISOString(), clickCount: clicked ? 'odd' : 'even' });

    try {
      const response = await fetch('http://localhost:3001/api/click', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Donut was clicked from frontend!',
        }),
      });

      const data = await response.json();
      console.log('Backend response:', data.response);
      setBackendMessage(data.response);
      alert(`Backend says: ${data.response}`);
    } catch (error) {
      console.error('Error calling backend:', error);
      alert('Failed to connect to backend!');
    }
  };

  return (
    <mesh ref={meshRef} onClick={handleClick}>
      <torusGeometry args={[1, 0.4, 16, 100]} />
      <meshStandardMaterial color={clicked ? '#ff6b9d' : '#ff9500'} />
    </mesh>
  );
}

export default function Home() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a1a', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
        <a
          href="/stream"
          style={{
            padding: '12px 24px',
            background: '#ff9500',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}
        >
          🎥 Go to Stream Room
        </a>
      </div>
      <Canvas camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <Donut />
      </Canvas>
    </div>
  );
}
