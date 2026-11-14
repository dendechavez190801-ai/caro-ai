import { useEffect, useRef } from 'react';

/**
 * Wake word: escucha continua del nombre del agente mientras la app está
 * abierta (Web Speech API). NO funciona con la app cerrada — para eso se
 * necesita un servicio nativo del SO (pendiente por plataforma).
 *
 * - `enabled`: interruptor del usuario (Apariencia → Voz).
 * - `agentName`: palabra a detectar (ej. "Caro", "Hey Caro").
 * - `onWake`: se dispara una vez por detección (con cooldown de 8 s) y
 *   recibe la transcripción completa por si trae un comando detrás del nombre.
 *
 * Retorna `supported` para que la UI avise cuando el motor no existe
 * (Electron/Chromium no siempre trae servicio de reconocimiento).
 */

interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as Record<string, unknown>;
    return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as RecognitionCtor | null;
}

export function wakeWordSupported(): boolean {
    return getRecognitionCtor() !== null;
}

export function useWakeWord(enabled: boolean, agentName: string, onWake: (transcript: string) => void): void {
    const onWakeRef = useRef(onWake);
    onWakeRef.current = onWake;
    const lastFire = useRef(0);

    useEffect(() => {
        const Ctor = getRecognitionCtor();
        const name = agentName.trim().toLowerCase();
        if (!enabled || !Ctor || name.length < 2) return;

        let rec: SpeechRecognitionLike;
        try {
            rec = new Ctor();
        } catch {
            return;
        }
        rec.lang = 'es-MX';
        rec.continuous = true;
        rec.interimResults = false;
        rec.maxAlternatives = 1;

        rec.onresult = (e) => {
            // Solo la última alternativa de la última frase.
            const last = e.results[e.results.length - 1];
            const text = last?.[0]?.transcript?.toLowerCase() ?? '';
            if (!text) return;
            const hit = text.includes(name) || text.split(/\s+/).some((w) => w.replace(/[^a-záéíóúñ]/g, '') === name);
            const now = Date.now();
            if (hit && now - lastFire.current > 8000) {
                lastFire.current = now;
                onWakeRef.current(text);
            }
        };
        rec.onerror = () => { /* el navegador puede cortar; onend reintenta */ };
        rec.onend = () => {
            // Reconexión automática mientras siga habilitado.
            try { rec.start(); } catch { /* ya detenido */ }
        };
        try { rec.start(); } catch { /* permiso denegado o no soportado */ }

        return () => {
            try { rec.onend = null; rec.abort(); } catch { /* noop */ }
        };
    }, [enabled, agentName]);
}
