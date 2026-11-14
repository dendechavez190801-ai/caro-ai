/**
 * Vinculación entre dispositivos propios de CaRo Ai.
 *
 * Cada instalación genera un código único local ("código de conexión"). El
 * usuario lo copia en su otro dispositivo (Windows → Android, etc.) y ahí lo
 * pega para agregarlo. NO hay servidor central: la vinculación inicial es
 * manual por diseño (privacidad); el canal de datos entre dispositivos se
 * establece después por LAN/WebRTC directo.
 */

const CODE_KEY = 'caroai.linkcode.v1';
const DEVICES_KEY = 'caroai.linked-devices.v1';

export interface LinkedDevice {
    id: string;
    name: string;
    /** Código que ese dispositivo mostró al vincularse. */
    code: string;
    addedAt: number;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I ambiguos

function randomCode(): string {
    const seg = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    return `CARO-${seg()}-${seg()}`;
}

/** Código único de esta instalación (se genera una sola vez y persiste). */
export function getLinkCode(): string {
    try {
        const existing = localStorage.getItem(CODE_KEY);
        if (existing) return existing;
        const code = randomCode();
        localStorage.setItem(CODE_KEY, code);
        return code;
    } catch {
        return randomCode();
    }
}

export function loadLinkedDevices(): LinkedDevice[] {
    try {
        const raw = localStorage.getItem(DEVICES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveLinkedDevices(devices: LinkedDevice[]): void {
    try {
        localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
    } catch { /* noop */ }
}

export function normalizeCode(input: string): string | null {
    const clean = input.trim().toUpperCase().replace(/\s+/g, '');
    return /^CARO-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(clean) ? clean : null;
}

/** Regenera el código (por si se sospecha que se compartió por error). */
export function regenerateLinkCode(): string {
    const code = randomCode();
    try { localStorage.setItem(CODE_KEY, code); } catch { /* noop */ }
    return code;
}
