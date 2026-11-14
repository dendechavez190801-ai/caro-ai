/**
 * Motor de tema de CaRo Ai.
 *
 * Acento personalizable (presets + color libre) y tipografias.
 * El acento se aplica con variables CSS (--accent, --accent-rgb, --accent-hex,
 * --accent-contrast) para que Tailwind pueda usarlo con opacidades.
 *
 * OJO: `rgb` guarda la terna SEPARADA POR ESPACIOS ("7 110 255"), no con
 * comas. `rgb(7, 110, 255/.2)` mezcla comas con slash y Chrome lo descarta;
 * `rgb(7 110 255/.2)` si es valido.
 */

export interface AccentColor {
    id: string;
    name: string;
    hex: string;
    /** Terna RGB separada por espacios, p. ej. "7 110 255". */
    rgb: string;
}

/** Presets rapidos; el usuario puede elegir cualquier otro color con el picker. */
export const ACCENTS: AccentColor[] = [
    { id: 'cyan-neon', name: 'Cyan Neón', hex: '#00e5ff', rgb: '0 229 255' },
    { id: 'purple-cyber', name: 'Púrpura Cyber', hex: '#a855f7', rgb: '168 85 247' },
    { id: 'pink-neon', name: 'Rosa Neón', hex: '#ff2d78', rgb: '255 45 120' },
    { id: 'electric-blue', name: 'Azul Eléctrico', hex: '#076eff', rgb: '7 110 255' },
    { id: 'matrix-green', name: 'Verde Matrix', hex: '#00ff9f', rgb: '0 255 159' },
    { id: 'pure-white', name: 'Blanco Puro', hex: '#ffffff', rgb: '255 255 255' },
];

export interface FontChoice {
    id: string;
    name: string;
    family: string;
    hint?: string;
}

export const FONTS: FontChoice[] = [
    { id: 'inter', name: 'Inter', family: "'Inter', system-ui, sans-serif", hint: 'Limpia y neutra' },
    { id: 'roboto', name: 'Roboto', family: "'Roboto', system-ui, sans-serif", hint: 'Android / Material' },
    { id: 'opensans', name: 'Open Sans', family: "'Open Sans', system-ui, sans-serif", hint: 'Legible' },
    { id: 'lato', name: 'Lato', family: "'Lato', system-ui, sans-serif", hint: 'Humanista' },
    { id: 'montserrat', name: 'Montserrat', family: "'Montserrat', system-ui, sans-serif", hint: 'Geométrica' },
    { id: 'poppins', name: 'Poppins', family: "'Poppins', system-ui, sans-serif", hint: 'Moderna redonda' },
    { id: 'nunito', name: 'Nunito', family: "'Nunito', system-ui, sans-serif", hint: 'Amigable' },
    { id: 'raleway', name: 'Raleway', family: "'Raleway', system-ui, sans-serif", hint: 'Elegante' },
    { id: 'oswald', name: 'Oswald', family: "'Oswald', system-ui, sans-serif", hint: 'Condensada' },
    { id: 'bebas', name: 'Bebas Neue', family: "'Bebas Neue', 'Oswald', sans-serif", hint: 'Display' },
    { id: 'playfair', name: 'Playfair Display', family: "'Playfair Display', Georgia, serif", hint: 'Serif editorial' },
    { id: 'merriweather', name: 'Merriweather', family: "'Merriweather', Georgia, serif", hint: 'Serif lectura' },
    { id: 'lora', name: 'Lora', family: "'Lora', Georgia, serif", hint: 'Serif moderna' },
    { id: 'sourcesans', name: 'Source Sans 3', family: "'Source Sans 3', system-ui, sans-serif", hint: 'Adobe' },
    { id: 'worksans', name: 'Work Sans', family: "'Work Sans', system-ui, sans-serif", hint: 'Profesional' },
    { id: 'manrope', name: 'Manrope', family: "'Manrope', system-ui, sans-serif", hint: 'Geométrica' },
    { id: 'spacegrotesk', name: 'Space Grotesk', family: "'Space Grotesk', system-ui, sans-serif", hint: 'Tech' },
    { id: 'orbitron', name: 'Orbitron', family: "'Orbitron', 'Segoe UI', sans-serif", hint: 'Sci-fi' },
    { id: 'jetbrains', name: 'JetBrains Mono', family: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace", hint: 'Código' },
    { id: 'ibmplex', name: 'IBM Plex Mono', family: "'IBM Plex Mono', Consolas, monospace", hint: 'Código' },
    { id: 'firacode', name: 'Fira Code', family: "'Fira Code', 'Cascadia Code', Consolas, monospace", hint: 'Código' },
    { id: 'caveat', name: 'Caveat', family: "'Caveat', cursive", hint: 'Cursiva' },
    { id: 'pacifico', name: 'Pacifico', family: "'Pacifico', cursive", hint: 'Cursiva' },
];

export const DEFAULT_ACCENT = 'pure-white';
export const DEFAULT_FONT = 'inter';

/** Convierte #rrggbb a terna "r g b". Devuelve null si el formato es invalido. */
export function hexToRgbTriplet(hex: string): string | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `${r} ${g} ${b}`;
}

/** Luminancia aproximada 0..1 para decidir el color de texto sobre el acento. */
export function hexLuminance(hex: string): number {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Acento a partir de un color libre (#rrggbb). */
export function accentFromHex(hex: string): AccentColor {
    const clean = hex.startsWith('#') ? hex : `#${hex}`;
    const rgb = hexToRgbTriplet(clean);
    if (!rgb) return getAccent(DEFAULT_ACCENT);
    return { id: 'custom', name: 'Personalizado', hex: clean.toLowerCase(), rgb };
}

export function getAccent(id: string): AccentColor {
    return ACCENTS.find((a) => a.id === id) ?? ACCENTS.find((a) => a.id === DEFAULT_ACCENT) ?? ACCENTS[0];
}

export function getFont(id: string): FontChoice {
    return FONTS.find((f) => f.id === id) ?? FONTS.find((f) => f.id === DEFAULT_FONT) ?? FONTS[0];
}
