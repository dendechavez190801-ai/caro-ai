/**
 * Escenas de fondo para el avatar (punto 3 del feedback #3).
 *
 * Cada escena es un SVG generado en código (original, sincopyright,
 * ~2-4KB) con variante "día" y "noche". El modo "auto" elige según la
 * hora local del equipo (6:00-19:00 = día). Se guardan como dataURL en
 * state.avatarBg con el formato: scene:<id>:auto|day|night
 */

export type AvatarSceneId = 'parque' | 'ciudad' | 'espacio';
export type AvatarSceneMode = 'auto' | 'day' | 'night';

export interface AvatarSceneDef {
    id: AvatarSceneId;
    label: string;
    desc: string;
}

export const AVATAR_SCENES: AvatarSceneDef[] = [
    { id: 'parque', label: 'Parque', desc: 'Colinas verdes, sol o luna' },
    { id: 'ciudad', label: 'Ciudad', desc: 'Skyline al atardecer o de noche' },
    { id: 'espacio', label: 'Espacio', desc: 'Estrellas y planeta' },
];

/** ¿Es de día según la hora local? 6:00–19:00 = día. */
export function isDaytime(now = new Date()): boolean {
    const h = now.getHours();
    return h >= 6 && h < 19;
}

/** Parsea el valor guardado en avatarBg. Devuelve null si no es escena. */
export function parseAvatarScene(bg: string | null): { id: AvatarSceneId; mode: AvatarSceneMode } | null {
    if (!bg || !bg.startsWith('scene:')) return null;
    const [, id, mode] = bg.split(':');
    if (!AVATAR_SCENES.some((s) => s.id === id)) return null;
    return { id: id as AvatarSceneId, mode: (mode === 'day' || mode === 'night' ? mode : 'auto') as AvatarSceneMode };
}

/** Resuelve la dataURL de la escena según la hora (auto) o modo fijo. */
export function resolveAvatarScene(bg: string | null): string | null {
    const p = parseAvatarScene(bg);
    if (!p) return null;
    const variant = p.mode === 'auto' ? (isDaytime() ? 'day' : 'night') : p.mode;
    return sceneSvg(p.id, variant);
}

function stars(seed: number, n: number, w = 800, h = 500): string {
    // Estrellas pseudo-aleatorias deterministas (mismo seed = mismo cielo).
    let s = '';
    let x = seed;
    const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    for (let i = 0; i < n; i++) {
        const cx = (rnd() * w).toFixed(0), cy = (rnd() * h * 0.6).toFixed(0), r = (0.6 + rnd() * 1.6).toFixed(1);
        s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`;
    }
    return s;
}

export function sceneSvg(id: AvatarSceneId, variant: 'day' | 'night'): string {
    const W = 800, H = 500;
    const night = variant === 'night';
    let body = '';

    if (id === 'parque') {
        const sky = night
            ? ['#050816', '#101a3a', '#1c2a55']
            : ['#4a90d9', '#87c5f0', '#d8ecff'];
        const sunMoon = night
            ? `<circle cx="620" cy="110" r="46" fill="#e8ecf7"/><circle cx="604" cy="98" r="40" fill="${sky[0]}" opacity="0.9"/>`
            : `<circle cx="620" cy="110" r="60" fill="#fff3b0"/><circle cx="620" cy="110" r="80" fill="#fff3b0" opacity="0.25"/>`;
        const hill1 = night ? '#0d1a2e' : '#3e7d4f';
        const hill2 = night ? '#081120' : '#2f6339';
        const leaf = night ? '#0a1626' : '#1f4d2b';
        body = `
            <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${sky[0]}"/><stop offset="0.6" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/>
            </linearGradient></defs>
            <rect width="${W}" height="${H}" fill="url(#sky)"/>
            ${night ? stars(7, 40) : ''}
            ${sunMoon}
            <ellipse cx="180" cy="430" rx="340" ry="120" fill="${hill1}"/>
            <ellipse cx="620" cy="470" rx="380" ry="140" fill="${hill2}"/>
            <path d="M120 330 l14 -60 l14 60 z M150 330 l12 -48 l12 48 z M560 300 l16 -70 l16 70 z M600 310 l13 -52 l13 52 z" fill="${leaf}"/>`;
    } else if (id === 'ciudad') {
        const sky = night
            ? ['#03040c', '#0a1030', '#1b1440']
            : ['#2b1055', '#7597de', '#ff9a5a'];
        const b1 = night ? '#0b0f1e' : '#241a38';
        const b2 = night ? '#060a16' : '#170f26';
        let buildings = '';
        let x = 0;
        let seed = 11;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        while (x < W) {
            const bw = 40 + rnd() * 70, bh = 90 + rnd() * 210;
            const front = rnd() > 0.5;
            buildings += `<rect x="${x}" y="${H - bh}" width="${bw}" height="${bh}" fill="${front ? b1 : b2}"/>`;
            if (night) {
                // ventanas encendidas
                for (let wy = H - bh + 12; wy < H - 16; wy += 22) {
                    for (let wx = x + 8; wx < x + bw - 10; wx += 16) {
                        if (rnd() > 0.55) buildings += `<rect x="${wx}" y="${wy}" width="7" height="10" fill="#ffd77a" opacity="0.9"/>`;
                    }
                }
            }
            x += bw + 4;
        }
        body = `
            <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${sky[0]}"/><stop offset="0.55" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/>
            </linearGradient></defs>
            <rect width="${W}" height="${H}" fill="url(#sky)"/>
            ${night ? stars(3, 60) : `<circle cx="620" cy="330" r="52" fill="#ffb45e"/><circle cx="620" cy="330" r="90" fill="#ffb45e" opacity="0.2"/>`}
            ${buildings}`;
    } else {
        // espacio
        const bg = night ? ['#02030a', '#0a0f24'] : ['#1b2a52', '#3d5a99'];
        body = `
            <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/>
            </linearGradient></defs>
            <rect width="${W}" height="${H}" fill="url(#sky)"/>
            ${stars(21, night ? 120 : 60)}
            <circle cx="560" cy="180" r="120" fill="${night ? '#7a5cff' : '#5a7bd9'}" opacity="0.35"/>
            <circle cx="560" cy="180" r="72" fill="${night ? '#8f6bff' : '#6d8ce8'}"/>
            <ellipse cx="560" cy="180" rx="150" ry="26" fill="none" stroke="#c9b8ff" stroke-width="6" opacity="0.7" transform="rotate(-18 560 180)"/>
            ${night ? `<circle cx="560" cy="180" r="58" fill="#0a0f24" opacity="0.55"/>` : ''}`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
