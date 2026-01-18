'use client';

import { useEffect, useRef, useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, Billboard, useTexture, useGLTF, useAnimations } from '@react-three/drei';
import { PublishTransport, SubscribeTransport } from 'rheomesh';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SplatViewer } from './SplatViewer';

interface Position {
    x: number;
    y: number;
    z: number;
}

interface PlayerData {
    id: string;
    name: string;
    shape: string;
    color: string;
    activity: string;
    position: Position;
    rotation: number;
    isMoving: boolean;
}

interface RemoteStream {
    publisherId: string;
    stream: MediaStream;
}

// Animation types that can be triggered
type AnimationType = 'jump' | 'wave' | 'dance' | null;

// Shared animation logic hook
function usePlayerAnimation() {
    const animationProgress = useRef(0);
    const currentAnimation = useRef<AnimationType>(null);

    const triggerAnimation = (animation: AnimationType) => {
        if (!currentAnimation.current && animation) {
            currentAnimation.current = animation;
            animationProgress.current = 0;
        }
    };

    const updateAnimation = (delta: number): number => {
        if (currentAnimation.current || animationProgress.current > 0) {
            animationProgress.current += delta * 3;
            if (animationProgress.current >= 1) {
                animationProgress.current = 0;
                currentAnimation.current = null;
            }
        }

        // Return height offset based on animation
        if (currentAnimation.current === 'jump' || animationProgress.current > 0) {
            return Math.sin(animationProgress.current * Math.PI) * 1.5;
        }
        return 0;
    };

    return { triggerAnimation, updateAnimation, currentAnimation, animationProgress };

}

// Hook to manage character animations state machine
function useCharacterAnimations(
    actions: any,
    mixer: THREE.AnimationMixer,
    animation: AnimationType,
    isMoving: boolean,
    playerName: string
) {
    const currentAction = useRef<THREE.AnimationAction | null>(null);

    useEffect(() => {
        console.log(`DEBUG [${playerName}]: Actions available:`, Object.keys(actions));
        console.log(`DEBUG [${playerName}]: State:`, { animation, isMoving });

        const fadeTime = 0.2;
        let nextAction: THREE.AnimationAction | null = null;
        let nextFadeTime = fadeTime;

        // 1. Determine target action based on state priority
        // Priority: Jump (One-shot) > Move (Loop) > Idle (Loop)

        if (animation === 'jump') {
            console.log('🐈 Animation: JUMP');
            if (currentAction.current) {
                currentAction.current.fadeOut(0.05); // Faster fade out for jump
                currentAction.current = null;
            }
            return;
        }

        if (isMoving) {
            nextAction = actions['WalkingAnimation'] || actions['WalkingStash'] || actions['Walk'];
            nextFadeTime = 0.1;
        } else {
            nextAction = actions['IdleAnimation'] || actions['IdleStash'] || actions['Idle'];
            // If we are coming from "nothing" (Jump/Spawn), fade is faster (0.3s)
            // If we are coming from Walk, fade is .6s
            nextFadeTime = currentAction.current ? 0.6 : 0.3;
        }

        // 2. Transition
        if (nextAction !== currentAction.current) {
            // Fade out current
            if (currentAction.current) {
                currentAction.current.fadeOut(nextFadeTime);
                // Fade in next (smooth transition)
                nextAction?.reset().fadeIn(nextFadeTime).play();
            } else {
                // First action (Spawn): Snap instantly
                nextAction?.reset().play();
                // Force mixer to update immediately to apply pose
                mixer.update(0);
            }

            // Logging
            if (nextAction) {
                if (isMoving) console.log(`🐈 Animation: WALK (Snap: ${!currentAction.current})`);
                else console.log(`🐈 Animation: IDLE (Snap: ${!currentAction.current})`);
            }

            currentAction.current = nextAction;
        }
    }, [actions, mixer, animation, isMoving, playerName]);
}

// Cat Avatar Component
function CatAvatar({ animation, isMoving, playerName }: { animation: AnimationType; isMoving: boolean; playerName: string }) {
    const { scene, animations } = useGLTF('/assets/models/TWISTED_cat_character.glb');
    // Clone scene using SkeletonUtils to properly handle SkinnedMeshes (animations)
    const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
    const { actions, mixer } = useAnimations(animations, clone);

    // Use centralized animation logic
    useCharacterAnimations(actions, mixer, animation, isMoving, playerName);

    return <primitive object={clone} scale={0.5} position={[0, -0.5, 0]} />;
}

// Unified Avatar Mesh Component
// Unified Avatar Mesh Component
function AvatarMesh({ shape, color, animation, isMoving, playerName }: { shape: string; color: string; animation: AnimationType; isMoving: boolean; playerName: string }) {
    if (shape === 'cat') {
        return <CatAvatar animation={animation} isMoving={isMoving} playerName={playerName} />;
    }

    return (
        <mesh>
            {shape === 'circle' ? (
                <sphereGeometry args={[0.5, 32, 32]} />
            ) : (
                <boxGeometry args={[0.8, 0.8, 0.8]} />
            )}
            <meshStandardMaterial color={color} />
        </mesh>
    );
}

// Player avatar component with animation support
function PlayerAvatar({ player, animation }: { player: PlayerData; animation: AnimationType }) {
    const groupRef = useRef<THREE.Group>(null);
    const { triggerAnimation, updateAnimation } = usePlayerAnimation();

    // Trigger animation when prop changes
    useEffect(() => {
        if (animation) {
            triggerAnimation(animation);
        }
    }, [animation, triggerAnimation]);

    // Use explicit isMoving state from player data
    const isMoving = player.isMoving;

    // Movement interpolation
    useFrame((_, delta) => {
        if (!groupRef.current) return;

        const targetPos = new THREE.Vector3(player.position.x, player.position.y, player.position.z);

        // Smoothly interpolate to target position
        groupRef.current.position.lerp(targetPos, 0.1);
        groupRef.current.rotation.y = player.rotation;

        // Apply animation offset
        const heightOffset = updateAnimation(delta);
        groupRef.current.position.y = player.position.y + heightOffset;
    });

    return (
        <group ref={groupRef} position={[player.position.x, player.position.y, player.position.z]}>
            {/* Mesh handles shape rendering */}
            <AvatarMesh shape={player.shape} color={player.color} animation={animation} isMoving={isMoving} playerName={player.name} />

            <Billboard position={[0, 1, 0]} follow={true} lockX={false} lockY={false} lockZ={false}>
                <Text
                    fontSize={0.3}
                    color="white"
                    anchorX="center"
                    anchorY="bottom"
                >
                    {player.name}
                </Text>
            </Billboard>
        </group>
    );
}

// Local player with WASD controls
function LocalPlayer({
    player,
    onMove,
    onAnimation
}: {
    player: PlayerData;
    onMove: (position: Position, rotation: number, isMoving: boolean) => void;
    onAnimation: (animation: AnimationType) => void;
}) {
    const groupRef = useRef<THREE.Group>(null);
    const { camera } = useThree();
    const keysPressed = useRef<Set<string>>(new Set());
    const positionRef = useRef<Position>({ ...player.position });
    const rotationRef = useRef<number>(player.rotation);
    const { triggerAnimation, updateAnimation, currentAnimation } = usePlayerAnimation();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            keysPressed.current.add(e.key.toLowerCase());
            if (e.key === ' ') keysPressed.current.add(' ');
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            keysPressed.current.delete(e.key.toLowerCase());
            if (e.key === ' ') keysPressed.current.delete(' ');
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Track inputs
    const forward = keysPressed.current.has('w');
    const backward = keysPressed.current.has('s');
    const left = keysPressed.current.has('a');
    const right = keysPressed.current.has('d');
    const jump = keysPressed.current.has(' ');

    // Track movement state
    const [isMoving, setIsMoving] = useState(false);
    const isMovingRef = useRef(false);
    const wasMovingRef = useRef(false);

    // Initial movement injection ("W tap" workaround for T-pose)
    const [initialInjection, setInitialInjection] = useState(true);

    useEffect(() => {
        // Force a tiny movement state for 100ms on spawn
        // This wakes up the animation mixer / state machine
        const timer = setTimeout(() => {
            setInitialInjection(false);
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // Track active animation state for rendering
    const [activeAnimation, setActiveAnimation] = useState<AnimationType>(null);

    useFrame((_, delta) => {
        if (!groupRef.current) return;

        const speed = 5 * delta;
        const rotSpeed = 2 * delta;
        let moved = false;

        // W-tap injection
        if (initialInjection) {
            moved = true;
        }

        // Rotation
        if (keysPressed.current.has('a')) {
            rotationRef.current += rotSpeed;
            moved = true;
        }
        if (keysPressed.current.has('d')) {
            rotationRef.current -= rotSpeed;
            moved = true;
        }

        // Forward/backward movement based on rotation
        const direction = new THREE.Vector3(
            Math.sin(rotationRef.current),
            0,
            Math.cos(rotationRef.current)
        );

        if (keysPressed.current.has('w')) {
            positionRef.current.x += direction.x * speed;
            positionRef.current.z += direction.z * speed;
            moved = true;
        }
        if (keysPressed.current.has('s')) {
            positionRef.current.x -= direction.x * speed;
            positionRef.current.z -= direction.z * speed;
            moved = true;
        }

        // Update walking state
        if (moved !== isMovingRef.current) {
            isMovingRef.current = moved;
            setIsMoving(moved);
        }

        // Clamp to room boundaries (Removed for Camp scene)
        // positionRef.current.x = Math.max(-5, Math.min(5, positionRef.current.x));
        // positionRef.current.z = Math.max(-5, Math.min(5, positionRef.current.z));

        // Continuous jump when spacebar is held
        if (keysPressed.current.has(' ') && !currentAnimation.current) {
            triggerAnimation('jump');
            onAnimation('jump');
        }

        // Update animation and get height offset
        const heightOffset = updateAnimation(delta);

        // Sync active animation state if changed (e.g. jump finished)
        if (currentAnimation.current !== activeAnimation) {
            setActiveAnimation(currentAnimation.current);
            onAnimation(currentAnimation.current);
        }

        // Apply to group (which contains mesh and text)
        groupRef.current.position.set(
            positionRef.current.x,
            positionRef.current.y + heightOffset,
            positionRef.current.z
        );
        groupRef.current.rotation.y = rotationRef.current;

        // Update camera to follow
        camera.position.set(
            positionRef.current.x - Math.sin(rotationRef.current) * 5,
            positionRef.current.y + 3 + heightOffset * 0.5,
            positionRef.current.z - Math.cos(rotationRef.current) * 5
        );
        camera.lookAt(positionRef.current.x, positionRef.current.y + 0.5 + heightOffset, positionRef.current.z);

        // Send position update if moved OR if moving state changed (e.g. stopped)
        // We track previous moving state to ensure we send the "stop" event
        if (moved || isMovingRef.current !== wasMovingRef.current) {
            onMove({ ...positionRef.current }, rotationRef.current, isMovingRef.current);
            wasMovingRef.current = isMovingRef.current;
        }
    });

    return (
        <group ref={groupRef} position={[player.position.x, player.position.y, player.position.z]}>
            <AvatarMesh shape={player.shape} color={player.color} animation={activeAnimation} isMoving={isMoving} playerName={player.name} />
            <Billboard position={[0, 1, 0]} follow={true} lockX={false} lockY={false} lockZ={false}>
                <Text
                    fontSize={0.3}
                    color="white"
                    anchorX="center"
                    anchorY="bottom"
                >
                    {player.name} (you)
                </Text>
            </Billboard>
        </group>
    );
}

// Room floor
function RoomFloor() {
    const floorTexture = useTexture('/assets/textures/floor_texture_v1.png');
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(1, 1);

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
            <planeGeometry args={[12, 12]} />
            <meshStandardMaterial map={floorTexture} />
        </mesh>
    );
}

// Textured walls
function RoomWalls() {
    const wallTexture = useTexture('/assets/textures/wall_texture_v1.png');
    wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(1, 1);

    return (
        <group position={[0, 2.5, 0]}>
            {/* Back Wall */}
            <mesh position={[0, 0, -6]}>
                <planeGeometry args={[12, 6]} />
                <meshStandardMaterial map={wallTexture} />
            </mesh>
            {/* Front Wall */}
            <mesh position={[0, 0, 6]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[12, 6]} />
                <meshStandardMaterial map={wallTexture} />
            </mesh>
            {/* Left Wall */}
            <mesh position={[-6, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[12, 6]} />
                <meshStandardMaterial map={wallTexture} />
            </mesh>
            {/* Right Wall */}
            <mesh position={[6, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[12, 6]} />
                <meshStandardMaterial map={wallTexture} />
            </mesh>
        </group>
    );
}

export default function RoomPage() {
    const searchParams = useSearchParams();
    const [isConnected, setIsConnected] = useState(false);
    const [roomTheme, setRoomTheme] = useState('');
    const [localPlayer, setLocalPlayer] = useState<PlayerData | null>(null);
    const [remotePlayers, setRemotePlayers] = useState<PlayerData[]>([]);
    const [chatMessages, setChatMessages] = useState<{ sender: string; message: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
    const [playerAnimations, setPlayerAnimations] = useState<Record<string, AnimationType>>({});

    const wsRef = useRef<WebSocket | null>(null);
    const publishTransportRef = useRef<PublishTransport | null>(null);
    const subscribeTransportRef = useRef<SubscribeTransport | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const publisherIdsRef = useRef<string[]>([]);
    const subscribedIdsRef = useRef<Set<string>>(new Set());
    const moveThrottleRef = useRef<number>(0);

    const peerConnectionConfig: RTCConfiguration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    useEffect(() => {
        // Connect with player data from query params
        const name = searchParams.get('name') || 'Anonymous';
        const shape = searchParams.get('shape') || 'circle';
        const color = searchParams.get('color') || '#ff9500';
        const activity = searchParams.get('activity') || 'hanging out';

        const params = new URLSearchParams({ name, shape, color, activity });
        const ws = new WebSocket(`ws://localhost:3001/stream?${params.toString()}`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to server');
            setIsConnected(true);
            startPublishPeer();
            startSubscribePeer();
        };

        ws.onclose = () => {
            console.log('Disconnected from server');
            setIsConnected(false);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onmessage = (event) => {
            console.log('Received message:', event.data);
            const message = JSON.parse(event.data);
            handleMessage(message);
        };

        // Ping interval
        const pingInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ action: 'Ping' }));
            }
        }, 5000);

        return () => {
            clearInterval(pingInterval);
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach((track) => track.stop());
            }
            ws.close();
        };
    }, [searchParams]);

    const startPublishPeer = () => {
        if (!publishTransportRef.current && wsRef.current) {
            const publishTransport = new PublishTransport(peerConnectionConfig);
            publishTransportRef.current = publishTransport;

            wsRef.current.send(JSON.stringify({ action: 'PublisherInit' }));

            publishTransport.on('icecandidate', (candidate) => {
                wsRef.current?.send(JSON.stringify({ action: 'PublisherIce', candidate }));
            });

            publishTransport.on('negotiationneeded', (offer) => {
                wsRef.current?.send(JSON.stringify({ action: 'Offer', sdp: offer }));
            });
        }
    };

    const startSubscribePeer = () => {
        if (!subscribeTransportRef.current && wsRef.current) {
            const subscribeTransport = new SubscribeTransport(peerConnectionConfig);
            subscribeTransportRef.current = subscribeTransport;

            wsRef.current.send(JSON.stringify({ action: 'SubscriberInit' }));

            subscribeTransport.on('icecandidate', (candidate) => {
                wsRef.current?.send(JSON.stringify({ action: 'SubscriberIce', candidate }));
            });
        }
    };

    const handleMessage = (message: any) => {
        console.log('Received:', message.action);

        switch (message.action) {
            case 'Pong':
                break;

            case 'RoomState':
                setRoomTheme(message.roomTheme);
                // Use yourPlayerId to correctly identify which player is us
                const allPlayers = message.players as PlayerData[];
                const myId = message.yourPlayerId as string;
                const me = allPlayers.find((p: PlayerData) => p.id === myId);
                const others = allPlayers.filter((p: PlayerData) => p.id !== myId);
                if (me) {
                    setLocalPlayer(me);
                }
                setRemotePlayers(others);
                break;

            case 'PlayerJoined':
                setRemotePlayers((prev) => [...prev, message.player]);
                break;

            case 'PlayerLeft':
                setRemotePlayers((prev) => prev.filter((p) => p.id !== message.playerId));
                break;

            case 'PlayerMoved':
                setRemotePlayers((prev) =>
                    prev.map((p) =>
                        p.id === message.playerId
                            ? { ...p, position: message.position, rotation: message.rotation, isMoving: message.isMoving }
                            : p
                    )
                );
                break;

            case 'PlayerAnimation':
                // Trigger animation for the player with the animation type
                const animType = message.animation as AnimationType;
                setPlayerAnimations((prev) => ({ ...prev, [message.playerId]: animType }));
                // Auto-clear after animation duration
                setTimeout(() => {
                    setPlayerAnimations((prev) => ({ ...prev, [message.playerId]: null }));
                }, 500);
                break;

            case 'ChatMessage':
                setChatMessages((prev) => [...prev, { sender: message.sender, message: message.message }]);
                break;

            case 'Answer':
                if (publishTransportRef.current) {
                    publishTransportRef.current.setAnswer(message.sdp);
                }
                break;

            case 'Offer':
                if (subscribeTransportRef.current) {
                    subscribeTransportRef.current.setOffer(message.sdp).then((answer) => {
                        wsRef.current?.send(JSON.stringify({ action: 'Answer', sdp: answer }));
                    });
                }
                break;

            case 'PublisherIce':
                publishTransportRef.current?.addIceCandidate(message.candidate);
                break;

            case 'SubscriberIce':
                subscribeTransportRef.current?.addIceCandidate(message.candidate);
                break;

            case 'Published':
                message.publisherIds.forEach((publisherId: string) => {
                    if (!publisherIdsRef.current.includes(publisherId) && !subscribedIdsRef.current.has(publisherId)) {
                        subscribedIdsRef.current.add(publisherId);
                        subscribeToPublisher(publisherId);
                    }
                });
                break;

            case 'Subscribed':
                break;

            case 'Unpublished':
                subscribedIdsRef.current.delete(message.publisherId);
                setRemoteStreams((prev) => prev.filter((s) => s.publisherId !== message.publisherId));
                break;
        }
    };

    const subscribeToPublisher = (publisherId: string) => {
        if (!subscribeTransportRef.current || !wsRef.current) return;

        wsRef.current.send(JSON.stringify({ action: 'Subscribe', publisherId }));

        subscribeTransportRef.current.subscribe(publisherId).then((subscriber) => {
            const stream = new MediaStream([subscriber.track]);
            setRemoteStreams((prev) => {
                if (prev.some((s) => s.publisherId === publisherId)) return prev;
                return [...prev, { publisherId, stream }];
            });
        });
    };

    const handlePlayerMove = (position: Position, rotation: number, isMoving: boolean) => {
        // Throttle movement updates to ~20fps
        const now = Date.now();
        if (now - moveThrottleRef.current < 1) return;
        moveThrottleRef.current = now;

        wsRef.current?.send(JSON.stringify({ action: 'PlayerMove', position, rotation, isMoving }));
    };

    const handleAnimation = (animation: AnimationType) => {
        if (animation) {
            wsRef.current?.send(JSON.stringify({ action: 'PlayAnimation', animation }));
        }
    };

    const sendChat = () => {
        if (!wsRef.current || !chatInput.trim()) return;
        wsRef.current.send(JSON.stringify({ action: 'ChatMessage', message: chatInput.trim() }));
        setChatInput('');
    };

    const startStreaming = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            localStreamRef.current = stream;

            // Publish tracks
            if (publishTransportRef.current && wsRef.current) {
                for (const track of stream.getTracks()) {
                    const publisher = await publishTransportRef.current.publish(track);
                    wsRef.current.send(JSON.stringify({ action: 'Offer', sdp: publisher.offer }));
                    wsRef.current.send(JSON.stringify({ action: 'Publish', publisherId: publisher.id }));
                    publisherIdsRef.current.push(publisher.id);
                }
            }
        } catch (error) {
            console.error('Error starting stream:', error);
        }
    };

    const stopStreaming = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        publisherIdsRef.current.forEach((id) => {
            wsRef.current?.send(JSON.stringify({ action: 'StopPublish', publisherId: id }));
        });
        publisherIdsRef.current = [];
    };

    return (
        <div className="h-screen w-screen bg-gray-900 flex">
            {/* 3D Room */}
            <div className="flex-1 relative">
                <Canvas>
                    <ambientLight intensity={0.4} />
                    <pointLight position={[0, 4, 0]} intensity={108} />
                    {/* <RoomFloor /> */}
                    {/* <RoomWalls /> */}
                    <SplatViewer url="/assets/fixed.ply" position={[0, -1.8, 0]} rotation={[1, 0, 0, 0]} scale={[7, 7, 7]} />
                    <Suspense fallback={null}>
                        {localPlayer && (
                            <LocalPlayer player={localPlayer} onMove={handlePlayerMove} onAnimation={handleAnimation} />
                        )}
                        {remotePlayers.map((player) => (
                            <PlayerAvatar
                                key={player.id}
                                player={player}
                                animation={playerAnimations[player.id] || null}
                            />
                        ))}
                    </Suspense>
                </Canvas>

                {/* Room info overlay */}
                <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
                    <h2 className="text-white font-bold">{roomTheme || 'Loading...'}</h2>
                    <p className="text-gray-400 text-sm">{remotePlayers.length + 1} players</p>
                    <p className="text-gray-500 text-xs mt-1">WASD to move</p>
                </div>

                {/* Back button */}
                <a href="/" className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    ← Leave Room
                </a>
            </div>

            {/* Sidebar: Chat & Streams */}
            <div className="w-80 bg-gray-800 flex flex-col border-l border-gray-700">
                {/* Streams */}
                <div className="p-3 border-b border-gray-700">
                    <div className="flex gap-2 mb-2">
                        <button
                            onClick={startStreaming}
                            className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded text-sm text-white"
                        >
                            🎥 Share Screen
                        </button>
                        <button
                            onClick={stopStreaming}
                            className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded text-sm text-white"
                        >
                            ⏹ Stop
                        </button>
                    </div>

                    {/* Local stream */}
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-24 bg-black rounded mb-2" />

                    {/* Remote streams */}
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                        {remoteStreams
                            .filter((s) => s.stream.getVideoTracks().length > 0)
                            .map((remote) => (
                                <video
                                    key={remote.publisherId}
                                    autoPlay
                                    playsInline
                                    className="w-full h-20 bg-black rounded"
                                    ref={(el) => {
                                        if (el && el.srcObject !== remote.stream) el.srcObject = remote.stream;
                                    }}
                                />
                            ))}
                    </div>
                </div>

                {/* Chat */}
                <div className="flex-1 flex flex-col p-3 overflow-hidden">
                    <h3 className="text-white font-semibold mb-2">Chat</h3>
                    <div className="flex-1 overflow-y-auto bg-gray-900 rounded p-2 space-y-1">
                        {chatMessages.length === 0 ? (
                            <p className="text-gray-500 text-sm">No messages yet...</p>
                        ) : (
                            chatMessages.map((msg, i) => (
                                <div key={i} className="text-sm">
                                    <span className="text-orange-400 font-medium">{msg.sender}:</span>{' '}
                                    <span className="text-gray-300">{msg.message}</span>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="flex gap-2 mt-2">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                            disabled={!isConnected}
                            placeholder="Type a message..."
                            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 disabled:opacity-50"
                        />
                        <button
                            onClick={sendChat}
                            disabled={!isConnected}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm disabled:opacity-50"
                        >
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
