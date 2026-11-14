/**
 * Detección de intenciones del agente en mensajes del chat (español).
 * Nivel 1: patrones directos del usuario ("abre X", "ejecuta Y", "busca Z").
 * Devuelve la acción a ejecutar localmente; el chat la reporta.
 */

export interface AgentAction {
    type: 'app' | 'path' | 'url' | 'search' | 'shell' | 'shot' | 'minimize' | 'float' | 'info' | 'remote';
    target: string;
    label: string;
    /** true = abrir en la Vista Previa interna; false/undefined = navegador del sistema. */
    inApp?: boolean;
    /** Para type='remote': nombre del dispositivo destino ("celular", "laptop", "pc"...). */
    device?: string;
}

/**
 * Contexto completo de CaRo Ai — se inyecta en el prompt del sistema de
 * Chat/Avatar/Llamada para que CUALQUIER modelo (local o nube, el que sea)
 * sepa desde el primer mensaje dónde está, qué es la app, para qué se hizo
 * y qué puede hacer. Sin esto el modelo alucina que es "un asistente de voz"
 * genérico o que está dentro de Chrome/otra app.
 */
export const APP_CONTEXT = [
    'CONTEXTO DE LA APP — CaRo Ai (léelo y úsalo SIEMPRE):',
    'Eres CaRo, el asistente personal dentro de CaRo Ai: una app de escritorio multiplataforma (Windows/macOS/Android/iOS) de asistencia con IA, privada y local-first.',
    'PARA QUÉ SE HIZO: ayudar al usuario en su día a día — conversar, investigar, ejecutar acciones en su PC/dispositivos, recordar cosas (bóveda), hablar por voz, crear y editar media, programar y usar terminal, conectarse a servicios, y operar con permisos que el usuario controla.',
    '',
    'MÓDULOS/PANTALLAS QUE TIENE (el usuario puede navegar a ellos):',
    '- Chat: conversación contigo con memoria de la bóveda, adjuntos y acciones.',
    '- Llamada: llamada de voz bidireccional con micrófono, voz de la IA y clonación opcional.',
    '- Avatar: avatar animado que conversa y ejecuta las mismas acciones que el chat.',
    '- Vista Previa: navegador web embebido donde se abren URLs y sitios.',
    '- Bóveda: notas estilo Obsidian + archivo de conversaciones; es tu memoria persistente.',
    '- Terminal: consola/IDE real del sistema con shell, sesiones y agente.',
    '- Modelos: motores de IA — locales (Ollama, LM Studio, vLLM) y nube (OpenAI, Gemini, Anthropic, Groq, DeepSeek, OpenRouter, Nvidia, custom). El usuario descarga modelos a su propio Ollama; las API keys son del usuario y nunca salen del equipo.',
    '- Cuentas: inicio de sesión web en sitios del usuario (sesiones cifradas).',
    '- Dispositivos: conexión a otros equipos del usuario y SSH entre ellos.',
    '- Media: editor de video/foto/audio y voces naturales/clonación.',
    '- Agentes: configuraciones de agente y tonos de personalidad.',
    '- Conectores: integraciones (código/repos, productividad, conectores propios).',
    '- Pantalla/Proyección: compartir pantalla y ver el escritorio del agente.',
    '- Permisos: el usuario decide qué capacidades puede usar el agente (todo falla cerrado sin permiso).',
    '- Apariencia: nombre del agente, tema, avatar, voces, wake word.',
    '- Legal: privacidad y términos por región.',
    '- Actualizaciones: la app se auto-actualiza de forma segura con rollback.',
    '',
    'TUS HERRAMIENTAS REALES (lo que puedes ejecutar de verdad):',
    '- Ejecutar acciones locales con confirmación del usuario (abrir apps/carpetas/URLs, buscar, comandos shell, captura, minimizar, isla).',
    '- Conocer las apps instaladas en el equipo: el sistema tiene un inventario real (registro de Windows) — "abre X" encuentra el ejecutable aunque el usuario no sepa el nombre exacto.',
    '- Abrir cosas en OTROS dispositivos del usuario por SSH ("abre X en mi laptop/celular") si están dados de alta en Dispositivos → Control por SSH. Si no hay dispositivo configurado, dilo honestamente.',
    '- Control del ratón y teclado del PC (mover, clic, escribir) cuando el usuario lo pida.',
    '- Terminal real del sistema operativo (PowerShell/cmd/bash).',
    '- Captura de pantalla del escritorio.',
    '- Leer/escribir en la Bóveda (memoria persistente del usuario).',
    '- Hablar y escuchar por voz (STT/TTS, voces locales o clonadas).',
    '- Usar la Vista Previa para abrir sitios web dentro de la app.',
    '- Reportar info del sistema (SO, hardware) con [[ACCION:info:sistema]].',
    '',
    'REGLAS DE CONTEXTO:',
    '- "Esta app", "estas herramientas", "dónde estás", "mi computadora" = CaRo Ai y el PC del usuario. NUNCA respondas como si estuvieras en Chrome, Word, u otra app.',
    '- Si el usuario pide algo que requiere una herramienta, usa el formato [[ACCION:...]] para proponerla; el usuario confirma antes de ejecutar.',
    '- Nunca inventes que ejecutaste algo: si la acción falla, dilo.',
    '- Responde en el idioma del usuario (español por defecto).',
].join('\n');

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
    '[[ACCION:path:~/carpeta/o/ruta/completa]]  — abrir archivo o carpeta del equipo (~ = carpeta personal; también acepta rutas absolutas)',
    '[[ACCION:url:https://sitio.com]]  — abrir una URL en el navegador',
    '[[ACCION:search:consulta de búsqueda]]  — buscar en Google',
    '[[ACCION:shell:comando]]  — ejecutar un comando en la terminal (SOLO si el usuario lo pidió explícitamente; es peligroso)',
    '[[ACCION:shot:pantalla]]  — tomar captura de pantalla de la app',
    '[[ACCION:minimize:ventana]]  — minimizar la ventana de CaRo Ai',
    '[[ACCION:float:isla]]  — activar la isla dinámica (ventana compacta siempre visible)',
    '[[ACCION:info:sistema]]  — reportar info real del sistema y TUS herramientas disponibles',
    'TUS HERRAMIENTAS REALES (úsalo para responder "qué puedes hacer" o "en qué app estás"):',
    '- Chat con modelos locales (Ollama/LM Studio/vLLM) y de nube (OpenAI, Gemini, OpenRouter...).',
    '- Terminal real del sistema (PowerShell/cmd) vía [[ACCION:shell:comando]].',
    '- Control del ratón y teclado del PC (mover, clic, escribir).',
    '- Captura de pantalla [[ACCION:shot:pantalla]].',
    '- Abrir apps, carpetas, archivos y URLs [[ACCION:app:..]] [[ACCION:path:..]] [[ACCION:url:..]].',
    '- Búsqueda web [[ACCION:search:consulta]].',
    '- Minimizar la app [[ACCION:minimize:ventana]] e isla dinámica [[ACCION:float:isla]].',
    '- Reporte del sistema [[ACCION:info:sistema]]: SO, CPU, RAM, GPU y apps abiertas.',
    '- Bóveda de notas, vista previa web, llamadas de voz y avatar.',
    'Eres CaRo Ai, una app de escritorio. Si te preguntan "en qué aplicación estás" o "qué herramientas tienes", responde con ESTA lista — no digas que no sabes.',
    'IMPORTANTE: nunca inventes rutas. Si no conoces la ruta exacta de un archivo, pregunta al usuario en vez de usar ejemplos o rutas de muestra.',
    'Para instalar programas en Windows usa winget (ej. [[ACCION:shell:winget install -e --id Python.Python.3.12]]).',
    'Reglas: máximo una acción por bloque; el objetivo va completo en la misma línea; no uses acciones para responder preguntas ni saludos; si no estás seguro de la ruta, pregunta en vez de adivinar.',
].join('\n');

// Tolerante: acepta [[ACCION:...]], [accion:...], [[ACTION:...]], mayúsculas,
// espacios y alias de tipo (island→float, abrir→app, comando→shell...).
const ACTION_RE = /\[\[?\s*(?:(?:accion|action)\s*:\s*)?(app|path|url|search|shell|shot|capture|screenshot|foto|minimize|minimise|minimiza|minimizar|minimizate|ocultar|float|island|isla|flotante|abrir|comando|terminal|cmd|captura|busqueda|buscar|info|sistema|sysinfo|estado|herramientas)\s*:\s*([^\]\n]+)\]?\]?/gi;

const ACTION_TYPE_ALIAS: Record<string, AgentAction['type']> = {
    app: 'app', abrir: 'app',
    path: 'path', carpeta: 'path', archivo: 'path',
    url: 'url', link: 'url', web: 'url',
    search: 'search', busqueda: 'search', buscar: 'search',
    shell: 'shell', comando: 'shell', terminal: 'shell', cmd: 'shell',
    shot: 'shot', capture: 'shot', captura: 'shot', screenshot: 'shot', foto: 'shot',
    minimize: 'minimize', minimise: 'minimize', minimiza: 'minimize', minimizar: 'minimize', minimizate: 'minimize', ocultar: 'minimize',
    float: 'float', island: 'float', isla: 'float', flotante: 'float',
    info: 'info', sistema: 'info', sysinfo: 'info', estado: 'info', herramientas: 'info',
};

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
    shot: 'Captura de pantalla',
    minimize: 'Minimizar ventana',
    float: 'Activar isla flotante',
    info: 'Reporte del sistema',
};

/** Extrae los bloques [[ACCION:...]] de la respuesta de la IA. */
export function parseAgentActions(text: string): { text: string; actions: AgentAction[] } {
    const actions: AgentAction[] = [];
    const cleanText = text.replace(ACTION_RE, (_m, rawType: string, target: string) => {
        const t = target.trim();
        const type = ACTION_TYPE_ALIAS[rawType.toLowerCase()] ?? (rawType.toLowerCase() as AgentAction['type']);
        if (t && ACTION_LABELS[type]) actions.push({ type, target: t, label: ACTION_LABELS[type] });
        return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { text: cleanText, actions };
}

const clean = (s: string) => s.trim().replace(/[.,;:!?¿¡"'()]+$/g, '').trim();

/** Detecta una acción ejecutable en el texto del usuario. null si es chat normal. */
export function detectAction(text: string): AgentAction | null {
    return detectActions(text)[0] ?? null;
}

/**
 * Detecta TODAS las acciones de una frase compuesta ("minimiza la app y abre
 * la isla"). Las acciones de ventana (minimize/float/shot) pueden combinarse;
 * el resto del sistema devuelve como máximo una por mensaje.
 */
export function detectActions(text: string): AgentAction[] {
    const t = text.trim();
    if (!t) return [];

    // Varias acciones de ventana en la misma frase → ejecutar todas.
    const winActions: AgentAction[] = [];
    if (/\b(minimiza|minimizate|minimize|minimise|esconde|oculta|guarda)\b.*\b(app|aplicaci[oó]n|ventana|caro|esto)\b/i.test(t)
        || /\b(minimize|minimise|minimizate|minimiza)\b/i.test(t)) {
        winActions.push({ type: 'minimize', target: 'ventana', label: 'minimizar la ventana' });
    }
    if (/\b(isla|flotante|siempre visible|encima de todo|dynamic island|modo isla)\b/i.test(t)) {
        winActions.push({ type: 'float', target: 'isla', label: 'activar isla flotante' });
    }
    if (/(captura|screenshot|screen shot|foto de pantalla|imagen de pantalla|toma.*(?:captura|foto|imagen))/i.test(t)) {
        winActions.push({ type: 'shot', target: 'pantalla', label: 'captura de pantalla' });
    }
    if (winActions.length > 1) return winActions;

    const single = detectSingleAction(text);
    return single ? [single] : [];
}

/** Detección de una sola acción (la primera que coincida, por prioridad). */
function detectSingleAction(text: string): AgentAction | null {
    const t = text.trim();
    if (!t) return null;

    // ¿El usuario pidió explícitamente la Vista Previa interna?
    // "en vista previa", "dentro de la app", "en la app" → inApp.
    // "en mi teléfono/celular" o nada → navegador del sistema (fuera de la app).
    const wantsPreview = /vista\s+previa|preview|dentro\s+de\s+(?:la\s+|esta\s+)?app|en\s+(?:la\s+|esta\s+)?app\b/i.test(t);

    // URL directa.
    const urlMatch = t.match(/https?:\/\/\S+/i);
    if (urlMatch && /^(abre|abrir|ve a|visita|ábreme|open)\b/i.test(t)) {
        return { type: 'url', target: urlMatch[0], label: `abrir ${urlMatch[0]}`, inApp: wantsPreview };
    }

    // Ruta absoluta (Windows C:\... o Unix /...).
    const pathMatch = t.match(/(?:abre|abrir|abre la carpeta|ve a|open)\s+(?:la\s+)?(?:carpeta\s+|archivo\s+|directorio\s+)?([A-Za-z]:[\\/][^\s,;]+|\/[\w\-./ ]+)/i);
    if (pathMatch) {
        return { type: 'path', target: clean(pathMatch[1]), label: `abrir ${pathMatch[1]}` };
    }

    // "minimiza/oculta/esconde la app/ventana" → minimize real.
    if (/\b(minimiza|minimizate|minimize|minimise|esconde|oculta|guarda)\b.*\b(app|aplicaci[oó]n|ventana|caro|esto)\b/i.test(t)
        || /\b(minimize|minimise|minimizate|minimiza)\b/i.test(t)) {
        return { type: 'minimize', target: 'ventana', label: 'minimizar la ventana' };
    }
    // "isla / flotante / siempre visible / encima de todo / dynamic island".
    if (/\b(isla|flotante|siempre visible|encima de todo|dynamic island|modo isla)\b/i.test(t)) {
        return { type: 'float', target: 'isla', label: 'activar isla flotante' };
    }

    // "toma captura" / "screenshot" / "captura de pantalla" → shot real.
    if (/(captura|screenshot|screen shot|foto de pantalla|imagen de pantalla|toma.*(?:captura|foto|imagen))/i.test(t)) {
        return { type: 'shot', target: 'pantalla', label: 'captura de pantalla' };
    }

    // "qué/dime herramientas/funciones/capacidades de ESTA app" → info real.
    // Cubre variantes naturales: "dime herramientas dentro de esta app",
    // "para qué sirve esto", "qué puedes hacer".
    if (/(qué|que|dime|dinos|explica|cu[aá]les|en qu[eé])\b[^.?!]*\b(herramientas?|capacidades|funciones?|puedes hacer|apps?|aplicaciones?)\b/i.test(t)
        || /\b(herramientas?|capacidades|funciones?)\b[^.?!]*\b(esta|la|tienes|tienes dentro|dentro de)\b[^.?!]*\b(app|aplicaci[oó]n|caro)\b/i.test(t)
        || /para\s+qu[eé]\s+(sirve|es|est[aá])\b[^.?!]*\b(app|aplicaci[oó]n|esto|caro|caRo)\b/i.test(t)
        || /en\s+(qué|que)\s+(app|aplicaci[oó]n|programa|entorno|sistema)\s+(est[aá]s|corres|ejecutas)/i.test(t)
        || /\b(info|estado|revisa|inspecciona|diagn[oó]stico)\b.*\b(sistema|equipo|pc|computadora|entorno)\b/i.test(t)) {
        return { type: 'info', target: 'sistema', label: 'revisar sistema y herramientas' };
    }

    // Carpetas conocidas del sistema: "abre/ve/muestra mi escritorio/...".
    const folderMatch = t.match(/^(?:abre|abrir|ábreme|ve(?:\s+a)?|muestra|ens[eé][nñ]ame|open)\s+(?:mi\s+|la\s+carpeta\s+de\s+|el\s+directorio\s+de\s+)?(escritorio|desktop|descargas|downloads?|documentos|documents?|im[aá]genes|pictures?|m[uú]sica|music|videos?|favoritos|favorites?)\b/i);
    if (folderMatch) {
        const map: Record<string, string> = {
            escritorio: 'Desktop', desktop: 'Desktop', descargas: 'Downloads', download: 'Downloads', downloads: 'Downloads',
            documentos: 'Documents', document: 'Documents', documents: 'Documents',
            'imágenes': 'Pictures', imagenes: 'Pictures', pictures: 'Pictures', 'música': 'Music', musica: 'Music', music: 'Music',
            videos: 'Videos', video: 'Videos', favoritos: 'Favorites', favorites: 'Favorites',
        };
        const key = folderMatch[1].toLowerCase();
        const folder = map[key] ?? folderMatch[1];
        return { type: 'path', target: `~/${folder}`, label: `abrir ${folderMatch[1]}` };
    }

    // "abre <navegador/sitio> en la ventana/vista previa" → pestaña Vista Previa.
    const previewMatch = t.match(/(?:abre|abrir|ábreme|open|ve a|visita)\s+(.+?)\s+en\s+(?:la\s+)?(?:ventana\s+de\s+)?(?:vista\s+previa|preview)\b/i);
    if (previewMatch) {
        const what = clean(previewMatch[1]).toLowerCase();
        const siteKey = what.replace(/\s+/g, '');
        const url = SITE_MAP[siteKey] ?? SITE_MAP[what] ?? (/navegador|browser|chrome|google|internet|navegador de google/.test(what) ? 'https://www.google.com' : null);
        if (url) return { type: 'url', target: url, label: `abrir ${what} en Vista Previa`, inApp: true };
    }

    // "abre X en mi celular/laptop/pc/equipo..." → acción remota por SSH.
    // El dispositivo se resuelve contra los SSH configurados en Dispositivos.
    const remoteMatch = t.match(/^(?:abre|abrir|ábreme|inicia|ejecuta|lanza|reproduce|reproducir|pon|open|ve a|visita)\s+(.+?)\s+en\s+(?:mi|el|la|tu|ese|esa|otro|otra)\s+(celular|tel[eé]fono|telefono|laptop|port[aá]til|notebook|lap|pc|computadora|equipo|remoto|servidor)\b\s*$/i);
    if (remoteMatch) {
        const what = clean(remoteMatch[1]);
        const devWord = remoteMatch[2].toLowerCase();
        const devNorm: Record<string, string> = {
            celular: 'celular', telefono: 'celular', 'teléfono': 'celular', movil: 'celular', 'móvil': 'celular',
            laptop: 'laptop', 'portátil': 'laptop', portatil: 'laptop', notebook: 'laptop', lap: 'laptop',
            pc: 'pc', computadora: 'pc', equipo: 'pc',
            remoto: 'remoto', servidor: 'servidor',
        };
        const device = devNorm[devWord] ?? devWord;
        const siteKey = what.toLowerCase().replace(/\s+/g, '');
        const siteUrl = SITE_MAP[siteKey] ?? SITE_MAP[what.toLowerCase()];
        const target = siteUrl ?? what;
        return { type: 'remote', target, device, label: `abrir ${what} en ${remoteMatch[2].toLowerCase()}` };
    }

    // "abre X" / "ejecuta X" / "inicia X" → app del sistema.
    const appMatch = t.match(/^(?:abre|abrir|ábreme|inicia|ejecuta|lanza|reproduce|reproducir|pon|open)\s+(?:la\s+app(?:licación)?\s+|el\s+programa\s+)?(.+)$/i);
    if (appMatch && !/chat|hola|qué|como|por favor ayúdame/i.test(t)) {
        let target = clean(appMatch[1]);
        if (target.length >= 2 && target.length <= 80) {
            // Quita coletillas de ubicación: "youtube en vista previa",
            // "youtube en mi teléfono", "youtube dentro de la app" → "youtube".
            const locStripped = target.replace(
                /\s+en\s+(?:la\s+|mi\s+|el\s+|tu\s+)?(?:vista\s+previa|preview|tel[eé]fono|celular|m[oó]vil|app|aplicaci[oó]n|navegador|escritorio|windows|pc|esta\s+app|esa\s+app)\b.*$/i,
                '',
            ).replace(/\s+dentro\s+de\s+(?:la\s+|esta\s+)?app\b.*$/i, '');
            if (locStripped !== target) target = clean(locStripped);
            // Sitios web conocidos (youtube, google, netflix...): si el usuario
            // pidió Vista Previa explícita va dentro de la app; si no, al
            // navegador real del sistema. "en mi teléfono" también cae aquí
            // (no hay puente app→teléfono; se abre en el navegador local).
            const siteKey = target.toLowerCase().replace(/\s+/g, '');
            const siteUrl = SITE_MAP[siteKey] ?? SITE_MAP[target.toLowerCase()];
            if (siteUrl) {
                const where = wantsPreview ? 'en Vista Previa' : 'en el navegador';
                return { type: 'url', target: siteUrl, label: `abrir ${target} ${where}`, inApp: wantsPreview };
            }
            // App nativa: Vista Previa es un navegador web — NO puede correr
            // ejecutables de Windows dentro. Se abre fuera y se avisa.
            const note = wantsPreview ? ' (app de escritorio: se abre fuera; Vista Previa solo para web)' : '';
            return { type: 'app', target, label: `abrir ${target}${note}`, inApp: false };
        }
    }

    // "busca X" / "investiga X" → búsqueda web en el navegador del usuario.
    const searchMatch = t.match(/^(?:busca|buscar|investiga|googlea|search)\s+(.+)$/i);
    if (searchMatch) {
        const q = clean(searchMatch[1]);
        return { type: 'search', target: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: `buscar "${q.slice(0, 40)}"`, inApp: wantsPreview };
    }

    return null;
}

/** Memoria del usuario que el modelo debe conocer: skills activas y repos
 *  configurados en Memoria y Personalidad (localStorage, por usuario). */
export function memoryContext(): string {
    try {
        const skills = JSON.parse(localStorage.getItem('caroai.skills.v1') ?? '[]') as { name?: string; desc?: string; enabled?: boolean }[];
        const repos = JSON.parse(localStorage.getItem('caroai.repos.v1') ?? '[]') as string[];
        const parts: string[] = [];
        const on = (Array.isArray(skills) ? skills : []).filter((s) => s?.enabled && s?.name);
        if (on.length) parts.push(`Skills activas del usuario: ${on.map((s) => `${s!.name} — ${s!.desc ?? ''}`).join('; ')}.`);
        const rs = (Array.isArray(repos) ? repos : []).filter((r) => typeof r === 'string' && r.trim());
        if (rs.length) parts.push(`Repositorios del usuario: ${rs.join(', ')}.`);
        return parts.length ? `\n${parts.join(' ')}` : '';
    } catch { return ''; }
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
    if (a.type === 'shot') {
        const shot = joyai.screenShot;
        if (!shot) return { ok: false, error: 'captura no disponible' };
        const r = await shot();
        return { ok: r.ok, error: r.error, output: r.path };
    }
    if (a.type === 'minimize') {
        const min = joyai.minimizeWindow;
        if (!min) return { ok: false, error: 'minimizar no disponible' };
        return min();
    }
    if (a.type === 'float') {
        // Isla dinámica: ventana compacta independiente (sigue visible aunque
        // la app principal esté minimizada). Respaldo: alwaysOnTop de la app.
        const toggle = joyai.islandToggle;
        if (toggle) return toggle();
        const setFloat = joyai.setFloatMode;
        if (setFloat) return setFloat(true);
        return { ok: false, error: 'isla dinámica no disponible' };
    }
    if (a.type === 'info') {
        const info = joyai.getSystemInfo;
        if (!info) return { ok: false, error: 'info del sistema no disponible' };
        const r = await info();
        if (!r || typeof r !== 'object') return { ok: false, error: 'sin datos del sistema' };
        const parts = Object.entries(r as Record<string, unknown>)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${k}: ${String(v)}`);
        const caps = 'Herramientas de CaRo Ai: chat con IA local y nube, terminal del sistema, control de ratón/teclado, captura de pantalla, abrir apps/carpetas/URLs, búsqueda web, bóveda de notas, vista previa, llamadas de voz, avatar, isla dinámica y descarga de modelos.';
        return { ok: true, output: `${parts.join('\n')}\n\n${caps}` };
    }
    if (a.type === 'remote') {
        // Abre algo en OTRO dispositivo del usuario vía SSH (Dispositivos →
        // Control por SSH). El comando usa 'start' (Windows remoto); si el
        // remoto es Linux/Mac fallará y se reporta el error real.
        const ssh = joyai.deviceSsh;
        if (!ssh) return { ok: false, error: 'SSH no disponible (solo en la app de escritorio)' };
        interface SshDev { name: string; user: string; host: string; port: number }
        let devices: SshDev[] = [];
        try { devices = JSON.parse(localStorage.getItem('caroai.ssh-devices.v1') ?? '[]'); } catch { /* noop */ }
        const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const want = norm(a.device ?? '');
        const dev = devices.find((d) => {
            const n = norm(d.name);
            return n === want || n.includes(want) || want.split(' ').some((w) => w.length > 3 && n.includes(w));
        });
        if (!dev) {
            const have = devices.map((d) => d.name).join(', ') || 'ninguno';
            return { ok: false, error: `No hay dispositivo "${a.device}" en Control por SSH. Configurados: ${have}. Agrégalo en Dispositivos.` };
        }
        // Sanitiza: nada de comillas/saltos que rompan el comando remoto.
        const safeTarget = a.target.replace(/["`\r\n]/g, '').slice(0, 300).trim();
        if (!safeTarget) return { ok: false, error: 'objetivo remoto vacío' };
        // 'start' abre tanto URLs como apps por nombre en un Windows remoto.
        const remoteCmd = `start "" "${safeTarget}"`;
        const r = await ssh({ host: dev.host, user: dev.user, port: dev.port, command: remoteCmd })
            .catch((e): { ok: boolean; error?: string } => ({ ok: false, error: String(e) }));
        if (!r.ok) return { ok: false, error: `SSH a ${dev.name} falló: ${r.error ?? 'sin detalle'}` };
        return { ok: true, output: `Enviado a ${dev.name} (${dev.user}@${dev.host})` };
    }
    const open = joyai.osOpen;
    if (!open) return { ok: false, error: 'acciones del sistema solo en la app de escritorio' };
    return open({ type: a.type === 'search' ? 'url' : a.type, target: a.target });
}
