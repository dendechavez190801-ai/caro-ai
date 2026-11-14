/**
 * Archivo de conversaciones de CaRo Ai: cada chat se guarda localmente en
 * este equipo (nada sale del dispositivo). Comparte el lapso de retención
 * de la Bóveda (6 meses) y se puede exportar a Markdown/JSON.
 */

export interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
}

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
}

const CHATS_KEY = 'caroai.chats.v1';
/** Máximo de sesiones retenidas para no inflar localStorage. */
const MAX_SESSIONS = 50;

export function loadSessions(): ChatSession[] {
    try {
        const raw = localStorage.getItem(CHATS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function persist(sessions: ChatSession[]): void {
    try {
        localStorage.setItem(CHATS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
    } catch {
        /* cuota llena: se conserva lo que quepa */
    }
}

/** Inserta o actualiza la sesión activa (la más reciente). */
export function saveSession(session: ChatSession): void {
    const all = loadSessions();
    const idx = all.findIndex((s) => s.id === session.id);
    const next = idx >= 0
        ? all.map((s) => (s.id === session.id ? session : s))
        : [session, ...all];
    persist(next);
}

export function deleteSession(id: string): void {
    persist(loadSessions().filter((s) => s.id !== id));
}

/** Título automático: primeras palabras del primer mensaje del usuario. */
export function sessionTitle(messages: ChatMessage[], fallback = 'Chat'): string {
    const first = messages.find((m) => m.role === 'user' && m.text.trim());
    if (!first) return fallback;
    const clean = first.text.replace(/\s+/g, ' ').trim();
    return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}

/** Sesiones que superan el lapso de retención (6 meses sin actividad). */
export function expiredSessions(sessions: ChatSession[], retentionMs: number, now = Date.now()): ChatSession[] {
    return sessions.filter((s) => now - s.updatedAt > retentionMs);
}

/** Convierte una sesión a Markdown legible. */
export function sessionToMarkdown(s: ChatSession): string {
    const lines = [`# ${s.title}`, `> ${new Date(s.createdAt).toLocaleString('es')} · ${s.messages.length} mensajes`, ''];
    for (const m of s.messages) {
        lines.push(m.role === 'user' ? `**Tú:** ${m.text}` : `**${'Asistente'}:** ${m.text}`, '');
    }
    return lines.join('\n');
}
