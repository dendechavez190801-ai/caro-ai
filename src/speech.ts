/**
 * Voz local para CaRo Ai: Piper (TTS) + whisper.cpp (STT) via IPC de Electron.
 *
 * - En Electron (`window.joyai.speech*`) usa los binarios locales: 100% offline.
 * - En navegador/preview cae al Web Speech API del sistema (`voice.ts`).
 *
 * Las voces Piper en espanol disponibles hoy: 3F, 3M y variantes. No hay voces
 * infantiles/nina en Piper ES; quedan como preset "demo" hasta sumar otro motor.
 */
import { speak as webSpeak } from './voice';

export interface LocalVoice {
    id: string;
    /** Archivo .onnx dentro de engines/voices. */
    file: string;
    name: string;
    gender: 'female' | 'male' | 'child' | 'girl';
    locale: string;
    /** Multiplicador de tono (1 = normal). Voces agudas sobre base adulta. */
    pitch?: number;
}

/** Catalogo de voces Piper en espanol (los archivos se verifican en speech:voices). */
export const PIPER_VOICES: LocalVoice[] = [
    { id: 'claude', file: 'es_MX-claude-high.onnx', name: 'Clara', gender: 'female', locale: 'es-MX' },
    { id: 'mls10246', file: 'es_ES-mls_10246-low.onnx', name: 'Lucía', gender: 'female', locale: 'es-ES' },
    { id: 'mls9972', file: 'es_ES-mls_9972-low.onnx', name: 'Elena', gender: 'female', locale: 'es-ES' },
    { id: 'davefx', file: 'es_ES-davefx-medium.onnx', name: 'Dave', gender: 'male', locale: 'es-ES' },
    { id: 'sharvard', file: 'es_ES-sharvard-medium.onnx', name: 'Raúl', gender: 'male', locale: 'es-ES' },
    { id: 'ald', file: 'es_MX-ald-medium.onnx', name: 'Andrés', gender: 'male', locale: 'es-MX' },
    // Voces agudas: mismas voces base + pitch via ffmpeg (niño/niña).
    { id: 'nico', file: 'es_MX-ald-medium.onnx', name: 'Nico (niño)', gender: 'child', locale: 'es-MX', pitch: 1.45 },
    { id: 'luna', file: 'es_ES-mls_9972-low.onnx', name: 'Luna (niña)', gender: 'girl', locale: 'es-ES', pitch: 1.4 },
    { id: 'cora', file: 'es_MX-claude-high.onnx', name: 'Cora (niña)', gender: 'girl', locale: 'es-MX', pitch: 1.3 },
    { id: 'mia', file: 'es_ES-mls_10246-low.onnx', name: 'Mía (niña)', gender: 'girl', locale: 'es-ES', pitch: 1.25 },
];

/** Voces Kokoro (naturales, ~90MB ONNX) — valor guardado como 'kokoro:<voz>'. */
export const KOKORO_VOICES: LocalVoice[] = [
    { id: 'kdora', file: 'kokoro:ef_dora', name: 'Kokoro Dora (natural F)', gender: 'female', locale: 'es' },
    { id: 'kalex', file: 'kokoro:em_alex', name: 'Kokoro Alex (natural M)', gender: 'male', locale: 'es' },
    { id: 'ksanta', file: 'kokoro:em_santa', name: 'Kokoro Santa (natural M)', gender: 'male', locale: 'es' },
];

export interface SpeechStatus {
    electron: boolean;
    piper: boolean;
    whisper: boolean;
    kokoro?: boolean;
    espeak?: boolean;
    /** Voces del catalogo cuyo .onnx existe en disco. */
    voices: LocalVoice[];
}

/** Estado de los motores de voz locales. */
export async function getSpeechStatus(): Promise<SpeechStatus> {
    const joyai = window.joyai;
    if (!joyai?.speechStatus) {
        return { electron: false, piper: false, whisper: false, voices: [] };
    }
    const [status, files] = await Promise.all([
        joyai.speechStatus(),
        joyai.speechVoices?.() ?? Promise.resolve([]),
    ]);
    const have = new Set(files);
    return {
        electron: true,
        piper: status.piper,
        whisper: status.whisper,
        kokoro: (status as { kokoro?: boolean }).kokoro,
        espeak: (status as { espeak?: boolean }).espeak,
        voices: PIPER_VOICES.filter((v) => have.has(v.file)),
    };
}

/* ── Nivel de la voz de la IA (para visualizadores de llamada/avatar) ──
 * Mientras suena el TTS local se expone un nivel RMS 0-1 via onSpeakLevel.
 * La voz web (speechSynthesis) no es analizable: queda en 0.
 */
const speakLevelListeners = new Set<(v: number) => void>();
export function onSpeakLevel(cb: (v: number) => void): () => void {
    speakLevelListeners.add(cb);
    return () => speakLevelListeners.delete(cb);
}
function emitSpeakLevel(v: number): void {
    speakLevelListeners.forEach((cb) => { try { cb(v); } catch { /* noop */ } });
}

/** Reproduce audio desde WAV en base64 midiendo su volumen real. */
function playWavBase64(wavBase64: string): Promise<void> {
    return new Promise((resolve) => {
        const bytes = Uint8Array.from(atob(wavBase64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        const fallback = () => {
            const audio = new Audio(url);
            audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
            audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            void audio.play();
        };
        // Web Audio: decode + analyser para medir el volumen mientras habla.
        const AC: typeof AudioContext | undefined =
            window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) { fallback(); return; }
        void (async () => {
            try {
                const ctx = new AC();
                const ab = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
                const src = ctx.createBufferSource();
                src.buffer = ab;
                const an = ctx.createAnalyser();
                an.fftSize = 512;
                src.connect(an);
                an.connect(ctx.destination);
                const buf = new Uint8Array(an.frequencyBinCount);
                let raf = 0;
                const tick = () => {
                    an.getByteTimeDomainData(buf);
                    let sum = 0;
                    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
                    emitSpeakLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
                    raf = requestAnimationFrame(tick);
                };
                src.onended = () => {
                    cancelAnimationFrame(raf);
                    emitSpeakLevel(0);
                    void ctx.close().catch(() => {});
                    URL.revokeObjectURL(url);
                    resolve();
                };
                tick();
                src.start();
            } catch {
                fallback();
            }
        })();
    });
}

/**
 * Habla con una voz Piper local. Devuelve true si hablo con el motor local;
 * false si no hay motor (el llamador puede usar el fallback web).
 */
export async function speakLocal(text: string, voiceFile?: string): Promise<boolean> {
    const joyai = window.joyai;
    // Voz clonada del usuario (OpenVoice V2, local). 'clone:' o 'clone:<ruta>'.
    if (voiceFile === 'clone:' || voiceFile?.startsWith('clone:')) {
        const clone = joyai?.speechClone;
        if (!clone) return false;
        const r = await clone({ text });
        if (!r.ok || !r.wavBase64) return false;
        await playWavBase64(r.wavBase64);
        return true;
    }
    // Voces Kokoro (naturales): 'kokoro:<voz>'.
    if (voiceFile?.startsWith('kokoro:')) {
        const tts = joyai?.speechTtsKokoro;
        if (!tts) return false;
        const r = await tts({ text, voice: voiceFile.slice(7) });
        if (!r.ok || !r.wavBase64) return false;
        await playWavBase64(r.wavBase64);
        return true;
    }
    const tts = joyai?.speechTts;
    if (!tts) return false;
    // 'archivo.onnx#p1.4' = voz base + tono agudo (niño/niña).
    const [voice, pitchStr] = (voiceFile ?? PIPER_VOICES[0]?.file).split('#p');
    const pitch = pitchStr ? Number(pitchStr) : undefined;
    const r = await tts({ text, voice, pitch });
    if (!r.ok || !r.wavBase64) return false;
    await playWavBase64(r.wavBase64);
    return true;
}

/** Habla: primero Piper local, si no Web Speech del sistema. */
export async function speak(text: string, voiceFile?: string): Promise<void> {
    const ok = await speakLocal(text, voiceFile).catch(() => false);
    if (!ok) webSpeak(text);
}

// --- Grabacion de microfono -> WAV 16 kHz -> whisper.cpp ---

let recorder: MediaRecorder | null = null;
let micStream: MediaStream | null = null;
let chunks: Blob[] = [];

/** Empieza a grabar audio del microfono. Lanza si no hay permiso/dispositivo
 *  o si el usuario bloqueó el micrófono en Permisos de CaRo Ai. */
export async function startMicRecording(): Promise<void> {
    const { permEnabled } = await import('./permissions');
    if (!permEnabled('mic')) throw new Error('Micrófono bloqueado en Permisos de CaRo Ai');
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    recorder = mime ? new MediaRecorder(micStream, { mimeType: mime }) : new MediaRecorder(micStream);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start();
}

/** Detiene la grabacion y devuelve el audio como Blob. */
export async function stopMicRecording(): Promise<Blob> {
    const rec = recorder;
    if (!rec) return new Blob();
    const blob = await new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        rec.stop();
    });
    micStream?.getTracks().forEach((t) => t.stop());
    recorder = null;
    micStream = null;
    return blob;
}

/** Decodifica el Blob y lo re-codifica a WAV PCM 16 kHz mono (lo que pide whisper). */
async function blobToWavBase64(blob: Blob): Promise<string> {
    const ab = await blob.arrayBuffer();
    const ctx = new AudioContext();
    const audio = await ctx.decodeAudioData(ab);
    await ctx.close();

    const targetRate = 16000;
    const src = audio.getChannelData(0);
    const ratio = audio.sampleRate / targetRate;
    const len = Math.max(1, Math.floor(src.length / ratio));
    const pcm = new Int16Array(len);
    for (let i = 0; i < len; i++) {
        const s = src[Math.min(src.length - 1, Math.floor(i * ratio))] ?? 0;
        pcm[i] = Math.max(-1, Math.min(1, s)) * 0x7fff;
    }

    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const v = new DataView(buf);
    const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, targetRate, true); v.setUint32(28, targetRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    writeStr(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);

    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

/** Transcribe un Blob de audio con whisper local. Devuelve texto o null. */
export async function transcribeBlob(blob: Blob): Promise<string | null> {
    const stt = window.joyai?.speechStt;
    if (!stt || !blob.size) return null;
    const wavBase64 = await blobToWavBase64(blob);
    const r = await stt({ wavBase64, lang: 'es' });
    return r.ok ? (r.text ?? '') : null;
}

/**
 * Graba `ms` milisegundos y transcribe con whisper local.
 * Devuelve el texto o null si no hay motor local.
 */
export async function transcribeRecording(ms = 6000): Promise<string | null> {
    if (!window.joyai?.speechStt) return null;
    await startMicRecording();
    await new Promise((r) => setTimeout(r, ms));
    const blob = await stopMicRecording();
    return transcribeBlob(blob);
}
