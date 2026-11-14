import React from 'react';
import { useApp } from './store';

/**
 * Isla dinámica de CaRo Ai — ventana compacta independiente (400x88, sin
 * marco, siempre visible encima de todo). Se abre con ?island=1 en la URL
 * (la crea electron/main.cjs). Clic en cualquier parte restaura la app.
 * No carga el store completo de la app: solo nombre del agente y estado.
 */
export const IslandPage: React.FC = () => {
    const { state } = useApp();
    const restore = () => { void window.joyai?.islandRestore?.(); };

    return (
        <div
            onClick={restore}
            title="Clic para abrir CaRo Ai"
            style={{
                width: '100vw', height: '100vh',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', cursor: 'pointer',
                userSelect: 'none',
            }}
        >
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 22px',
                borderRadius: 999,
                background: 'rgba(10,10,10,0.92)',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
                backdropFilter: 'blur(12px)',
                color: '#f5f5f5',
            }}>
                <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 10px #22c55e',
                    animation: 'islaPulse 2s ease-in-out infinite',
                }} />
                <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: 0.3 }}>
                    {state.agentName || 'CaRo'}
                </span>
                <span style={{ fontSize: 11, opacity: 0.55 }}>en línea · clic para abrir</span>
            </div>
            <style>{`@keyframes islaPulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
        </div>
    );
};
