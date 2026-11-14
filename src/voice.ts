/**
 * Voz de CaRo Ai: STT (habla->texto) y TTS (texto->voz).
 *
 * Ahora usa la Web Speech API del navegador/Electron como puente funcional.
 * OJO: eso NO es 100% local/privado (pasa por el motor del sistema). Para voz
 * realmente local y privada se integrara un sidecar con Vosk (STT) y Piper (TTS)
 * en una fase posterior; esta capa ya deja el contrato listo para cambiarlo.
 */

export function sttSupported(): boolean {
    return typeof window !== 'undefined'
        && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
            ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
}

export function ttsSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickSpanishVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis?.getVoices() ?? [];
    return voices.find((v) => v.lang.toLowerCase().startsWith('es') && /female|mujer|google/i.test(v.name))
        ?? voices.find((v) => v.lang.toLowerCase().startsWith('es'))
        ?? voices[0]
        ?? null;
}

/** Texto -> voz. Cancela lo que este sonando para no encimar. */
export function speak(text: string, opts?: { rate?: number; pitch?: number; lang?: string }): void {
    if (!ttsSupported() || !text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts?.lang ?? 'es-ES';
    u.rate = opts?.rate ?? 1;
    u.pitch = opts?.pitch ?? 1;
    const v = pickSpanishVoice();
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
    if (ttsSupported()) window.speechSynthesis.cancel();
}

export interface ListenHandlers {
    onResult?: (transcript: string) => void;
    onEnd?: () => void;
    onError?: (err: string) => void;
}

/**
 * Inicia escucha de un solo turno. Devuelve un handle para detenerla, o null si
 * el navegador no soporta STT. `lang` por defecto es-ES.
 */
export function startListening(lang = 'es-ES', handlers: ListenHandlers = {}): { stop: () => void } | null {
    if (!sttSupported()) return null;
    const w = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: SpeechRecognitionEventLike) => {
        const text = Array.from(e.results)
            .map((r) => r[0]?.transcript ?? '')
            .join(' ')
            .trim();
        handlers.onResult?.(text);
    };
    rec.onend = () => handlers.onEnd?.();
    rec.onerror = (e: { error?: string }) => handlers.onError?.(e?.error ?? 'error');

    try {
        rec.start();
    } catch {
        handlers.onError?.('start_failed');
        return null;
    }
    return { stop: () => { try { rec.stop(); } catch { /* ya detenido */ } } };
}

// Tipos minimos locales para no depender de lib.dom de SpeechRecognition.
interface SpeechRecognitionResultLike { 0?: { transcript?: string } }
interface SpeechRecognitionEventLike { results: ArrayLike<SpeechRecognitionResultLike> }
interface SpeechRecognitionLike {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((e: SpeechRecognitionEventLike) => void) | null;
    onend: (() => void) | null;
    onerror: ((e: { error?: string }) => void) | null;
    start: () => void;
    stop: () => void;
}
