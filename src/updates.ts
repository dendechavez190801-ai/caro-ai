/**
 * Notificaciones y actualizaciones de CaRo Ai.
 *
 * Hoy las notices se generan en local (estado de motores de voz, version).
 * Cuando exista backend, `checkAppUpdate` consultara un endpoint de releases
 * y las actualizaciones se aplicaran SOLO si el usuario lo aprueba.
 */
import { getSpeechStatus } from './speech';

/** Mantener sincronizado con package.json. */
export const APP_VERSION = '1.0.0';

export interface AppNotice {
    id: string;
    kind: 'info' | 'update' | 'warning';
    title: string;
    detail: string;
}

/** Recolecta las notificaciones actuales del sistema local. */
export async function collectNotices(): Promise<AppNotice[]> {
    const notices: AppNotice[] = [];

    try {
        const s = await getSpeechStatus();
        if (s.electron) {
            if (!s.piper) {
                notices.push({ id: 'piper-missing', kind: 'warning', title: 'Piper TTS no detectado', detail: 'Falta joy-ai-build/engines/piper; la voz usara el sistema.' });
            }
            if (!s.whisper) {
                notices.push({ id: 'whisper-missing', kind: 'warning', title: 'whisper STT no detectado', detail: 'Falta el modelo ggml-*.bin; el dictado usara el sistema.' });
            }
            if (s.piper && s.whisper) {
                notices.push({ id: 'voice-ready', kind: 'info', title: 'Voz local lista', detail: `${s.voices.length} voces Piper en español disponibles offline.` });
            }
        }
    } catch { /* sin puente: solo web */ }

    notices.push({
        id: 'app-version',
        kind: 'info',
        title: `CaRo Ai v${APP_VERSION}`,
        detail: 'Las actualizaciones se detectan y se aplican solo con tu permiso.',
    });

    return notices;
}

/**
 * Punto de extension para updates remotos (pendiente de backend).
 * Devuelve null hasta que exista un servidor de releases configurado.
 */
export async function checkAppUpdate(): Promise<{ version: string; notes?: string } | null> {
    void APP_VERSION;
    return null;
}
