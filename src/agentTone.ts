/**
 * Tonos del agente: definición única usada por MemoryModule (selector) y
 * ChatPage (prompt del sistema). Se guarda solo el índice en localStorage.
 */

export interface AgentTone {
    id: string;
    name: string;
    /** Instrucción que se inyecta al prompt del sistema del chat. */
    prompt: string;
}

export const AGENT_TONES: AgentTone[] = [
    { id: 'pro', name: 'Profesional & Técnico', prompt: 'Responde de forma profesional, precisa y técnica; usa términos correctos y estructura clara.' },
    { id: 'alegre', name: 'Alegre & Dinámico', prompt: 'Responde con energía positiva, humor ligero y dinamismo; cercano pero respetuoso.' },
    { id: 'escritor', name: 'Rol Ficticio / Escritor Libre', prompt: 'Actúa como un escritor creativ@ en modo ficción: personajes, tramas y estilo literario cuando se pida.' },
    { id: 'nino', name: 'Rol Niño & Educativo', prompt: 'Actúa como un asistente infantil educador: lenguaje simple, paciente, con ejemplos y paciencia para niños.' },
    { id: 'empatico', name: 'Conversacional & Empático', prompt: 'Responde con calidez y empatía, como una conversación entre amigos; escucha antes de opinar.' },
    { id: 'creativo', name: 'Sin Filtros / Creativo Libre', prompt: 'Responde con libertad creativa y pensamiento fuera de la caja; ideas originales y asociativas.' },
];

const TONE_KEY = 'caroai.agent-tone.v1';
const LOCK_KEY = 'caroai.tone-lock.v1';

/** Índice del tono "Sin Filtros" (creativo libre). */
export const UNLOCKED_TONE_INDEX = AGENT_TONES.findIndex((t) => t.id === 'creativo');

/**
 * Candado del modo sin filtro: una vez activado por el usuario (con su
 * aceptación de responsabilidad en el aviso de política), no se puede cambiar
 * de tono de forma casual — hay que desbloquearlo explícitamente.
 */
export function isToneLocked(): boolean {
    try { return localStorage.getItem(LOCK_KEY) === '1'; } catch { return false; }
}

export function setToneLocked(locked: boolean): void {
    try {
        if (locked) localStorage.setItem(LOCK_KEY, '1');
        else localStorage.removeItem(LOCK_KEY);
    } catch { /* noop */ }
}

export function loadToneIndex(): number {
    try {
        const raw = localStorage.getItem(TONE_KEY);
        const n = raw ? parseInt(raw, 10) : 0;
        return Number.isFinite(n) && n >= 0 && n < AGENT_TONES.length ? n : 0;
    } catch { return 0; }
}

export function saveToneIndex(i: number): void {
    try { localStorage.setItem(TONE_KEY, String(i)); } catch { /* noop */ }
}
