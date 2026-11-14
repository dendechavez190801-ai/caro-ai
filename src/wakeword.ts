import { useEffect, useRef } from 'react';
import { startMicRecording, stopMicRecording, transcribeBlob } from './speech';

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

    // Fallback whisper.cpp (Electron/Chromium no trae SpeechRecognition):
    // grabamos chunks de ~3.5 s, los transcribimos con el whisper local y
    // buscamos el nombre del agente. No es tan rápido como un wake-word
    // dedicado, pero funciona 100% local y offline.
    const whisperArmed = useRef(false);
    useEffect(() => {
        const Ctor = getRecognitionCtor();
        const name = agentName.trim().toLowerCase();
        if (!enabled || Ctor || name.length < 2 || !window.joyai?.speechStt) return;
        if (whisperArmed.current) return;
        whisperArmed.current = true;
        let dead = false;

        const matches = (text: string) => {
            const t = text.toLowerCase();
            return t.includes(name) || t.split(/\s+/).some((w) => w.replace(/[^a-záéíóúñ]/g, '') === name);
        };

        const tick = async () => {
            if (dead) return;
            try {
                await startMicRecording();
                await new Promise((r) => setTimeout(r, 3500));
                const blob = await stopMicRecording();
                const text = await transcribeBlob(blob);
                if (text && matches(text) && Date.now() - lastFire.current > 8000) {
                    lastFire.current = Date.now();
                    onWakeRef.current(text);
                }
            } catch { /* sin mic o sin whisper: reintenta en el siguiente ciclo */ }
            if (!dead) setTimeout(() => void tick(), 400);
        };
        void tick();

        return () => {
            dead = true;
            whisperArmed.current = false;
        };
    }, [enabled, agentName]);
}
