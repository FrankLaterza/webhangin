'use client';

import { useState } from 'react';

interface Song {
    title: string;
    file: string;
}

interface JukeboxUIProps {
    isOpen: boolean;
    onClose: () => void;
    songs: Song[];
    currentSongIndex: number;
    isPlaying: boolean;
    volume: number;
    onPlayPause: () => void;
    onNext: () => void;
    onPrevious: () => void;
    onSelectSong: (index: number) => void;
    onVolumeChange: (volume: number) => void;
}

export function JukeboxUI({
    isOpen,
    onClose,
    songs,
    currentSongIndex,
    isPlaying,
    volume,
    onPlayPause,
    onNext,
    onPrevious,
    onSelectSong,
    onVolumeChange
}: JukeboxUIProps) {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                border: '2px solid #00ff88',
                borderRadius: '12px',
                padding: '20px',
                minWidth: '400px',
                maxWidth: '500px',
                zIndex: 1000,
                color: 'white',
                fontFamily: 'monospace'
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '24px', color: '#00ff88' }}>🎵 Jukebox</h2>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff4444',
                        fontSize: '24px',
                        cursor: 'pointer'
                    }}
                >
                    ✕
                </button>
            </div>

            {/* Now Playing */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'rgba(0, 255, 136, 0.1)', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '5px' }}>NOW PLAYING</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{songs[currentSongIndex]?.title || 'No song selected'}</div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '20px' }}>
                <button
                    onClick={onPrevious}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#333',
                        border: '1px solid #666',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '18px'
                    }}
                >
                    ⏮
                </button>
                <button
                    onClick={onPlayPause}
                    style={{
                        padding: '10px 30px',
                        backgroundColor: isPlaying ? '#ff4444' : '#00ff88',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'black',
                        cursor: 'pointer',
                        fontSize: '24px',
                        fontWeight: 'bold'
                    }}
                >
                    {isPlaying ? '⏸' : '▶'}
                </button>
                <button
                    onClick={onNext}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#333',
                        border: '1px solid #666',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '18px'
                    }}
                >
                    ⏭
                </button>
            </div>

            {/* Volume Control */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>VOLUME</div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume * 100}
                    onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
                    style={{
                        width: '100%',
                        accentColor: '#00ff88'
                    }}
                />
            </div>

            {/* Playlist */}
            <div>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>PLAYLIST</div>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {songs.map((song, index) => (
                        <div
                            key={index}
                            onClick={() => onSelectSong(index)}
                            style={{
                                padding: '10px',
                                backgroundColor: index === currentSongIndex ? 'rgba(0, 255, 136, 0.2)' : 'transparent',
                                borderLeft: index === currentSongIndex ? '3px solid #00ff88' : '3px solid transparent',
                                cursor: 'pointer',
                                marginBottom: '5px',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                if (index !== currentSongIndex) {
                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (index !== currentSongIndex) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }
                            }}
                        >
                            <div style={{ fontSize: '14px' }}>
                                {index === currentSongIndex && isPlaying ? '🎶 ' : ''}
                                {song.title}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
