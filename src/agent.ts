/**
 * Detección de intenciones del agente en mensajes del chat (español).
 * Nivel 1: patrones directos del usuario ("abre X", "ejecuta Y", "busca Z").
 * Devuelve la acción a ejecutar localmente; el chat la reporta.
 */

export interface AgentAction {
    type: 'app' | 'path' | 'url' | 'search' | 'shell';
    target: string;
    label: string;
}

/**
 * Nivel 2 (tool-calling): se añade como mensaje `system` en el chat para que
 * la IA proponga acciones locales con bloques [[ACCION:tipo:objetivo]].
 * El chat las muestra como tarjetas y el USUARIO confirma antes de ejecutar —
 * la IA nunca ejecuta nada por su cuenta.
 */
export const AGENT_ACTIONS_HINT = [
    'Eres un asistente con capacidad de ejecutar acciones locales en el equipo del usuario.',
    'Cuando el usuario pida ABRIR algo, EJECUTAR un comando, BUSCAR en internet o ACTUAR en el sistema, incluye al final de tu respuesta una o más líneas EXACTAS con este formato:',
    '[[ACCION:app:Nombre de la app]]  — abrir una aplicación (ej. [[ACCION:app:Spotify]])',
    '[[ACCION:path:C:\\ruta\\al\\archivo]]  — abrir archivo o carpeta del equipo',
    '[[ACCION:url:https://sitio.com]]  — abrir una URL en el navegador',
    '[[ACCION:search:consulta de búsqueda]]  — buscar en Google',
    '[[ACCION:shell:comando]]  — ejecutar un comando en la terminal (SOLO si el usuario lo pidió explícitamente; es peligroso)',
    'Reglas: máximo una acción por bloque; el objetivo va completo en la misma línea; no uses acciones para responder preguntas ni saludos; si no estás seguro de la ruta, pregunta en vez de adivinar.',
].join('\n');

const ACTION_RE = /\[\[ACCION:(app|path|url|search|shell):([^\]]+)\]\]/g;

/** Sitios web conocidos: "abre youtube" en chat/vista previa abre la web aquí. */
export const SITE_MAP: Record<string, string> = {
    youtube: 'https://www.youtube.com',
    tiktok: 'https://www.tiktok.com',
    google: 'https://www.google.com',
    facebook: 'https://www.facebook.com',
    instagram: 'https://www.instagram.com',
    twitter: 'https://x.com',
    netflix: 'https://www.netflix.com',
    spotify: 'https://open.spotify.com',
    github: 'https://github.com',
    reddit: 'https://www.reddit.com',
    twitch: 'https://www.twitch.tv',
    whatsapp: 'https://web.whatsapp.com',
    telegram: 'https://web.telegram.org',
};

/** URL de vista previa para una acción, o null si no aplica (app/path/shell). */
export function previewUrlForAction(a: AgentAction): string | null {
    if (a.type === 'url' || a.type === 'search') return a.target;
    if (a.type === 'app') {
        const key = a.target.toLowerCase().replace(/\s+/g, '');
        return SITE_MAP[key] ?? null;
    }
    return null;
}

const ACTION_LABELS: Record<string, string> = {
    app: 'Abrir app',
    path: 'Abrir archivo/carpeta',
    url: 'Abrir URL',
    search: 'Buscar en Google',
    shell: 'Ejecutar comando',
};

/** Extrae los bloques [[ACCION:...]] de la respuesta de la IA. */
export function parseAgentActions(text: string): { text: string; actions: AgentAction[] } {
    const actions: AgentAction[] = [];
    const cleanText = text.replace(ACTION_RE, (_m, type: string, target: string) => {
        const t = target.trim();
        if (t) actions.push({ type: type as AgentAction['type'], target: t, label: ACTION_LABELS[type] ?? type });
        return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { text: cleanText, actions };
}

const clean = (s: string) => s.trim().replace(/[.,;:!?¿¡"'()]+$/g, '').trim();

/** Detecta una acción ejecutable en el texto del usuario. null si es chat normal. */
export function detectAction(text: string): AgentAction | null {
    const t = text.trim();
    if (!t) return null;

    // URL directa.
    const urlMatch = t.match(/https?:\/\/\S+/i);
    if (urlMatch && /^(abre|abrir|ve a|visita|ábreme|open)\b/i.test(t)) {
        return { type: 'url', target: urlMatch[0], label: `abrir ${urlMatch[0]}` };
    }

    // Ruta absoluta (Windows C:\... o Unix /...).
    const pathMatch = t.match(/(?:abre|abrir|abre la carpeta|ve a|open)\s+(?:la\s+)?(?:carpeta\s+|archivo\s+|directorio\s+)?([A-Za-z]:[\\/][^\s,;]+|\/[\w\-./ ]+)/i);
    if (pathMatch) {
        return { type: 'path', target: clean(pathMatch[1]), label: `abrir ${pathMatch[1]}` };
    }

    // "abre X" / "ejecuta X" / "inicia X" → app del sistema.
    const appMatch = t.match(/^(?:abre|abrir|ábreme|inicia|ejecuta|lanza|open)\s+(?:la\s+app(?:licación)?\s+|el\s+programa\s+)?(.+)$/i);
    if (appMatch && !/chat|hola|qué|como|por favor ayúdame/i.test(t)) {
        const target = clean(appMatch[1]);
        if (target.length >= 2 && target.length <= 80) {
            return { type: 'app', target, label: `abrir ${target}` };
        }
    }

    // "busca X" / "investiga X" → búsqueda web en el navegador del usuario.
    const searchMatch = t.match(/^(?:busca|buscar|investiga|googlea|search)\s+(.+)$/i);
    if (searchMatch) {
        const q = clean(searchMatch[1]);
        return { type: 'search', target: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: `buscar "${q.slice(0, 40)}"` };
    }

    return null;
}

/** Ejecuta la acción vía IPC del sistema. 'shell' usa la terminal real. */
export async function runAction(a: AgentAction): Promise<{ ok: boolean; error?: string; output?: string }> {
    const joyai = window.joyai;
    if (!joyai) return { ok: false, error: 'acciones del sistema solo en la app de escritorio' };
    if (a.type === 'shell') {
        const exec = joyai.shellExec;
        if (!exec) return { ok: false, error: 'terminal no disponible' };
        const r = await exec(a.target.slice(0, 2000));
        return { ok: r.ok, error: r.error, output: r.output };
    }
    const open = joyai.osOpen;
    if (!open) return { ok: false, error: 'acciones del sistema solo en la app de escritorio' };
    return open({ type: a.type === 'search' ? 'url' : a.type, target: a.target });
}
