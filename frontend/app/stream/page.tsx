'use client';

import { useEffect, useRef, useState } from 'react';
import { PublishTransport, SubscribeTransport } from 'rheomesh';

export default function StreamPage() {
  const [roomId, setRoomId] = useState('lobby');
  const [isConnected, setIsConnected] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [status, setStatus] = useState('Disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const publishTransportRef = useRef<PublishTransport | null>(null);
  const subscribeTransportRef = useRef<SubscribeTransport | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const publisherIdsRef = useRef<string[]>([]);

  const peerConnectionConfig: RTCConfiguration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const connect = () => {
    const ws = new WebSocket(`ws://localhost:3001/stream?room=${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to server');
      setIsConnected(true);
      setStatus('Connected');
      startPublishPeer();
      startSubscribePeer();
    };

    ws.onclose = () => {
      console.log('Disconnected from server');
      setIsConnected(false);
      setStatus('Disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('Connection error');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleMessage(message);
    };

    setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ action: 'Ping' }));
      }
    }, 5000);
  };

  const startPublishPeer = () => {
    if (!publishTransportRef.current && wsRef.current) {
      const publishTransport = new PublishTransport(peerConnectionConfig);
      publishTransportRef.current = publishTransport;

      wsRef.current.send(JSON.stringify({ action: 'PublisherInit' }));

      publishTransport.on('icecandidate', (candidate) => {
        wsRef.current?.send(
          JSON.stringify({
            action: 'PublisherIce',
            candidate: candidate,
          })
        );
      });

      publishTransport.on('negotiationneeded', (offer) => {
        wsRef.current?.send(
          JSON.stringify({
            action: 'Offer',
            sdp: offer,
          })
        );
      });
    }
  };

  const startSubscribePeer = () => {
    if (!subscribeTransportRef.current && wsRef.current) {
      const subscribeTransport = new SubscribeTransport(peerConnectionConfig);
      subscribeTransportRef.current = subscribeTransport;

      wsRef.current.send(JSON.stringify({ action: 'SubscriberInit' }));

      subscribeTransport.on('icecandidate', (candidate) => {
        wsRef.current?.send(
          JSON.stringify({
            action: 'SubscriberIce',
            candidate: candidate,
          })
        );
      });
    }
  };

  const startCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      localStreamRef.current = stream;

      await publishStream(stream);
      setIsPublishing(true);
      setStatus('Publishing stream');
    } catch (error) {
      console.error('Error capturing media:', error);
      setStatus('Failed to capture media');
    }
  };

  const publishStream = async (stream: MediaStream) => {
    if (!publishTransportRef.current || !wsRef.current) return;

    const tracks = stream.getTracks();
    for (const track of tracks) {
      const publisher = await publishTransportRef.current.publish(track);
      wsRef.current.send(
        JSON.stringify({
          action: 'Offer',
          sdp: publisher.offer,
        })
      );
      wsRef.current.send(
        JSON.stringify({
          action: 'Publish',
          publisherId: publisher.id,
        })
      );
      publisherIdsRef.current.push(publisher.id);
    }
  };

  const stopCapture = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    publisherIdsRef.current.forEach((id) => {
      wsRef.current?.send(
        JSON.stringify({
          action: 'StopPublish',
          publisherId: id,
        })
      );
    });
    publisherIdsRef.current = [];

    setIsPublishing(false);
    setStatus('Stopped publishing');
  };

  const handleMessage = (message: any) => {
    console.log('Received message:', message);

    switch (message.action) {
      case 'Pong':
        console.log('Pong received');
        break;

      case 'Answer':
        if (publishTransportRef.current) {
          publishTransportRef.current.setAnswer(message.sdp);
        }
        break;

      case 'Offer':
        if (subscribeTransportRef.current) {
          subscribeTransportRef.current.setOffer(message.sdp).then((answer) => {
            wsRef.current?.send(
              JSON.stringify({
                action: 'Answer',
                sdp: answer,
              })
            );
          });
        }
        break;

      case 'PublisherIce':
        if (publishTransportRef.current) {
          publishTransportRef.current.addIceCandidate(message.candidate);
        }
        break;

      case 'SubscriberIce':
        if (subscribeTransportRef.current) {
          subscribeTransportRef.current.addIceCandidate(message.candidate);
        }
        break;

      case 'Published':
        console.log('Publishers available:', message.publisherIds);
        message.publisherIds.forEach((publisherId: string) => {
          // Don't subscribe to our own streams
          if (!publisherIdsRef.current.includes(publisherId)) {
            subscribeToPublisher(publisherId);
          }
        });
        break;

      case 'Subscribed':
        console.log('Subscribed to:', message.subscriberId);
        setStatus('Receiving remote stream');
        break;

      default:
        console.log('Unknown message type:', message);
    }
  };

  const subscribeToPublisher = (publisherId: string) => {
    if (!subscribeTransportRef.current || !wsRef.current) return;

    wsRef.current.send(
      JSON.stringify({
        action: 'Subscribe',
        publisherId: publisherId,
      })
    );

    subscribeTransportRef.current.subscribe(publisherId).then((subscriber) => {
      const stream = new MediaStream([subscriber.track]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">WebHangin - Stream Room</h1>

        <div className="mb-6 flex gap-4 items-center">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            disabled={isConnected}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white disabled:opacity-50"
            placeholder="Room ID"
          />
          <button
            onClick={connect}
            disabled={isConnected}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnected ? 'Connected' : 'Connect'}
          </button>
          <span className="px-4 py-2 bg-gray-800 rounded">{status}</span>
        </div>

        <div className="flex gap-4 mb-6">
          <button
            onClick={startCapture}
            disabled={!isConnected || isPublishing}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Streaming
          </button>
          <button
            onClick={stopCapture}
            disabled={!isPublishing}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Stop Streaming
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-3">Your Stream</h2>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full bg-black rounded-lg border border-gray-700"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-3">Remote Stream</h2>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full bg-black rounded-lg border border-gray-700"
            />
          </div>
        </div>

        <div className="mt-8">
          <a href="/" className="text-blue-400 hover:text-blue-300">
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
