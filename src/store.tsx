import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { AIEngineConfig, AppTab, ModuleId } from './types';
import { DEFAULT_ACCENT, DEFAULT_FONT, accentFromHex, getAccent, getFont, hexLuminance } from './theme';

const STORAGE_KEY = 'caroai.settings.v1';
/** Las API keys van en una clave aparte para no mezclarlas con ajustes de UI. */
const SECRETS_KEY = 'caroai.secrets.v1';

export interface AvatarEntry {
    id: string;
    name: string;
    dataUrl: string;
}

export interface CloneSample {
    name: string;
    kind: 'record' | 'file';
    dataUrl: string;
    /** Ruta local del archivo guardado por speech:clone-sample-save (Electron). */
    path?: string;
}

export type BgPreset = 'void' | 'graphite' | 'midnight' | 'wine' | 'custom';
export type CallStyleId = 'orb' | 'bars' | 'wave' | 'lines' | 'holo';

export interface AppState {
    /** Pestaña superior activa (Sistema Activo / Chat / Llamada / Avatar). */
    tab: AppTab;
    /** Módulo del sidebar abierto. Solo se muestra si `tab === 'system'`. */
    module: ModuleId;
    accentId: string;
    /** Color libre cuando accentId === 'custom' (#rrggbb). */
    accentCustom: string | null;
    fontId: string;
    agentName: string;
    sidebarOpen: boolean;
    engines: AIEngineConfig[];
    /** Perfil local del usuario (registro real con backend: pendiente). */
    userName: string;
    userEmail: string;
    userPhone: string;
    termsAccepted: boolean;
    /** Fondo global de la app (preset o color libre). */
    bgPreset: BgPreset;
    bgCustom: string | null;
    /** Imagen de fondo global (dataURL). */
    bgImage: string | null;
    /** Imagen de fondo solo para el chat (dataURL). */
    chatBgImage: string | null;
    /** Estilo del visualizador de llamada (elegido en Apariencia). */
    callStyle: CallStyleId;
    /** Biblioteca de avatares cargados por el usuario. */
    avatars: AvatarEntry[];
    avatarId: string | null;
    /** Voz Piper seleccionada para TTS. */
    ttsVoiceId: string;
    /** Fondo del avatar (color hex o dataURL de imagen). */
    avatarBg: string | null;
    /** Voz propia del avatar; '' = usa la voz general del agente. */
    avatarVoiceId: string;
    /** Muestra de voz para clonación (registro; motor de clonación pendiente). */
    cloneSample: CloneSample | null;
    /** Escucha continua del nombre del agente (wake word) mientras la app está abierta. */
    wakeWordEnabled: boolean;
    /** URL que el agente abrió en Vista Previa (escenario del agente). */
    previewUrl: string | null;
}

const DEFAULT_ENGINES: AIEngineConfig[] = [
    {
        id: 'openai',
        name: 'OpenAI',
        providerType: 'openai',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        enabled: false,
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        providerType: 'gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-3.1-flash-lite-preview',
        enabled: false,
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        providerType: 'anthropic',
        endpoint: 'https://api.anthropic.com/v1',
        model: 'claude-sonnet-4-20250514',
        enabled: false,
    },
    {
        id: 'ollama',
        name: 'Ollama (local)',
        providerType: 'ollama',
        endpoint: 'http://127.0.0.1:11434/v1',
        model: 'qwen2.5:3b',
        enabled: true,
    },
    {
        id: 'lmstudio',
        name: 'LM Studio (local)',
        providerType: 'lmstudio',
        endpoint: 'http://127.0.0.1:1234/v1',
        model: 'local-model',
        enabled: true,
    },
    {
        id: 'groq',
        name: 'Groq',
        providerType: 'groq',
        endpoint: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        enabled: false,
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        providerType: 'deepseek',
        endpoint: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        enabled: false,
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        providerType: 'openrouter',
        endpoint: 'https://openrouter.ai/api/v1',
        model: 'meta-llama/llama-3.3-70b-instruct',
        enabled: false,
    },
    {
        id: 'nvidia',
        name: 'Nvidia NIM',
        providerType: 'nvidia',
        endpoint: 'https://integrate.api.nvidia.com/v1',
        model: 'meta/llama-3.3-70b-instruct',
        enabled: false,
    },
    {
        id: 'vllm',
        name: 'vLLM (local)',
        providerType: 'vllm',
        endpoint: 'http://127.0.0.1:8000/v1',
        model: '',
        enabled: false,
    },
    {
        id: 'custom',
        name: 'Personalizado',
        providerType: 'custom',
        endpoint: '',
        model: '',
        enabled: false,
    },
];

export const initialState: AppState = {
    tab: 'chat',
    module: 'appearance',
    accentId: DEFAULT_ACCENT,
    accentCustom: null,
    fontId: DEFAULT_FONT,
    agentName: 'CaRo',
    sidebarOpen: true,
    engines: DEFAULT_ENGINES,
    userName: '',
    userEmail: '',
    userPhone: '',
    termsAccepted: false,
    bgPreset: 'graphite',
    bgCustom: null,
    bgImage: null,
    chatBgImage: null,
    callStyle: 'orb',
    avatars: [],
    avatarId: null,
    ttsVoiceId: 'es_MX-ald-medium.onnx',
    avatarBg: null,
    avatarVoiceId: '',
    cloneSample: null,
    wakeWordEnabled: false,
    previewUrl: null,
};

export type AppAction =
    | { type: 'set-tab'; tab: AppTab }
    | { type: 'set-module'; module: ModuleId }
    | { type: 'set-accent'; accentId: string }
    | { type: 'set-accent-custom'; hex: string | null }
    | { type: 'set-font'; fontId: string }
    | { type: 'set-agent-name'; name: string }
    | { type: 'toggle-sidebar' }
    | { type: 'update-engine'; id: string; patch: Partial<AIEngineConfig> }
    | { type: 'add-engine'; engine: AIEngineConfig }
    | { type: 'set-profile'; patch: Partial<Pick<AppState, 'userName' | 'userEmail' | 'userPhone' | 'termsAccepted' | 'wakeWordEnabled'>> }
    | { type: 'set-bg-preset'; preset: BgPreset }
    | { type: 'set-bg-custom'; hex: string | null }
    | { type: 'set-bg-image'; dataUrl: string | null }
    | { type: 'set-chat-bg-image'; dataUrl: string | null }
    | { type: 'set-call-style'; style: CallStyleId }
    | { type: 'add-avatar'; avatar: AvatarEntry }
    | { type: 'remove-avatar'; id: string }
    | { type: 'select-avatar'; id: string | null }
    | { type: 'set-tts-voice'; id: string }
    | { type: 'set-avatar-bg'; bg: string | null }
    | { type: 'set-avatar-voice'; id: string }
    | { type: 'set-clone-sample'; sample: CloneSample | null }
    | { type: 'set-preview-url'; url: string | null }
    | { type: 'set-engine-keys'; keys: Record<string, string> }
    | { type: 'hydrate'; state: Partial<AppState> };

function reducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'set-tab':
            return { ...state, tab: action.tab };
        case 'set-module':
            return { ...state, module: action.module, tab: 'system' };
        case 'set-accent':
            return { ...state, accentId: action.accentId, accentCustom: action.accentId === 'custom' ? state.accentCustom : null };
        case 'set-accent-custom':
            return { ...state, accentId: 'custom', accentCustom: action.hex };
        case 'set-font':
            return { ...state, fontId: action.fontId };
        case 'set-agent-name':
            return { ...state, agentName: action.name };
        case 'toggle-sidebar':
            return { ...state, sidebarOpen: !state.sidebarOpen };
        case 'update-engine':
            return { ...state, engines: state.engines.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)) };
        case 'add-engine':
            return { ...state, engines: [...state.engines, action.engine] };
        case 'set-profile':
            return { ...state, ...action.patch };
        case 'set-bg-preset':
            return { ...state, bgPreset: action.preset, bgCustom: action.preset === 'custom' ? state.bgCustom : null };
        case 'set-bg-custom':
            return { ...state, bgPreset: 'custom', bgCustom: action.hex };
        case 'set-bg-image':
            return { ...state, bgImage: action.dataUrl };
        case 'set-chat-bg-image':
            return { ...state, chatBgImage: action.dataUrl };
        case 'set-call-style':
            return { ...state, callStyle: action.style };
        case 'add-avatar':
            return { ...state, avatars: [...state.avatars, action.avatar], avatarId: state.avatarId ?? action.avatar.id };
        case 'remove-avatar':
            return {
                ...state,
                avatars: state.avatars.filter((a) => a.id !== action.id),
                avatarId: state.avatarId === action.id ? null : state.avatarId,
            };
        case 'select-avatar':
            return { ...state, avatarId: action.id };
        case 'set-tts-voice':
            return { ...state, ttsVoiceId: action.id };
        case 'set-avatar-bg':
            return { ...state, avatarBg: action.bg };
        case 'set-avatar-voice':
            return { ...state, avatarVoiceId: action.id };
        case 'set-clone-sample':
            return { ...state, cloneSample: action.sample };
        case 'set-preview-url':
            return { ...state, previewUrl: action.url };
        case 'set-engine-keys':
            return {
                ...state,
                engines: state.engines.map((e) =>
                    action.keys[e.id] ? { ...e, apiKey: action.keys[e.id] } : e,
                ),
            };
        case 'hydrate':
            return { ...state, ...action.state };
        default:
            return state;
    }
}

interface AppContextValue {
    state: AppState;
    dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadSecrets(): Record<string, string> {
    try {
        const raw = localStorage.getItem(SECRETS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, string>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Combina los motores guardados con los valores por defecto y les devuelve
 * su API key desde el almacen de secretos. Los motores nuevos que se anadan
 * a DEFAULT_ENGINES aparecen aunque el usuario tuviera una lista guardada.
 */
function mergeEngines(saved: AIEngineConfig[] | undefined, secrets: Record<string, string>): AIEngineConfig[] {
    const byId = new Map((saved ?? []).map((e) => [e.id, e]));
    const merged = DEFAULT_ENGINES.map((def) => {
        const s = byId.get(def.id);
        const base = s ? { ...def, ...s } : { ...def };
        // Los motores locales exponen la API OpenAI-compatible bajo /v1.
        // Instalaciones viejas guardaron el endpoint sin /v1 y el health
        // check (/models) fallaba → los modelos descargados no aparecían.
        if (['ollama', 'lmstudio', 'vllm'].includes(base.providerType) && base.endpoint
            && !/\/v1\/?$/.test(base.endpoint)) {
            base.endpoint = base.endpoint.replace(/\/+$/, '') + '/v1';
        }
        const key = secrets[def.id];
        return key ? { ...base, apiKey: key } : base;
    });
    for (const e of saved ?? []) {
        if (!DEFAULT_ENGINES.some((d) => d.id === e.id)) {
            merged.push({ ...e, apiKey: secrets[e.id] });
        }
    }
    return merged;
}

function loadPersisted(): Partial<AppState> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Partial<AppState>;
        return { ...parsed, engines: mergeEngines(parsed.engines, loadSecrets()) };
    } catch {
        return {};
    }
}

/**
 * El sidebar arranca cerrado en todas las plataformas: solo se abre al
 * pulsar el icono de menu. El estado persistido puede reabrirlo si el
 * usuario lo dejo abierto.
 */
function initState(): AppState {
    return { ...initialState, sidebarOpen: false };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(reducer, undefined, initState);

    useEffect(() => {
        dispatch({ type: 'hydrate', state: loadPersisted() });
    }, []);

    // En Electron las API keys viven cifradas (safeStorage); se inyectan aqui.
    useEffect(() => {
        const load = window.joyai?.secretsLoad;
        if (!load) return;
        let on = true;
        load().then((map) => {
            if (!on) return;
            const keys: Record<string, string> = {};
            for (const [k, v] of Object.entries(map)) {
                if (typeof v === 'string' && v) keys[k] = v;
            }
            if (Object.keys(keys).length > 0) dispatch({ type: 'set-engine-keys', keys });
        }).catch(() => { /* sin cifrado disponible */ });
        return () => { on = false; };
    }, []);

    useEffect(() => {
        // Las API keys se guardan aparte (caroai.secrets.v1); en el estado de
        // motores persistido se omite el campo apiKey.
        const secrets: Record<string, string> = {};
        const enginesForStorage = state.engines.map((e) => {
            if (e.apiKey) secrets[e.id] = e.apiKey;
            const { apiKey: _apiKey, ...rest } = e;
            return rest;
        });
        const persistable = {
            tab: state.tab,
            module: state.module,
            accentId: state.accentId,
            accentCustom: state.accentCustom,
            fontId: state.fontId,
            agentName: state.agentName,
            sidebarOpen: state.sidebarOpen,
            engines: enginesForStorage,
            userName: state.userName,
            userEmail: state.userEmail,
            userPhone: state.userPhone,
            termsAccepted: state.termsAccepted,
            bgPreset: state.bgPreset,
            bgCustom: state.bgCustom,
            bgImage: state.bgImage,
            chatBgImage: state.chatBgImage,
            callStyle: state.callStyle,
            avatars: state.avatars,
            avatarId: state.avatarId,
            ttsVoiceId: state.ttsVoiceId,
            avatarBg: state.avatarBg,
            avatarVoiceId: state.avatarVoiceId,
            cloneSample: state.cloneSample,
            wakeWordEnabled: state.wakeWordEnabled,
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
        } catch {
            // Cuota llena (imagenes dataURL grandes): reintenta sin ellas.
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    ...persistable,
                    bgImage: null,
                    chatBgImage: null,
                    avatars: [],
                    avatarId: null,
                    cloneSample: null,
                }));
            } catch { /* almacenamiento no disponible */ }
        }
        try {
            // En Electron las keys van cifradas via safeStorage; en web, localStorage.
            if (window.joyai?.secretsSave) {
                void window.joyai.secretsSave(secrets);
            } else {
                localStorage.setItem(SECRETS_KEY, JSON.stringify(secrets));
            }
        } catch {
            /* almacenamiento no disponible (modo privado, webview restringida) */
        }
    }, [state.tab, state.module, state.accentId, state.accentCustom, state.fontId, state.agentName, state.sidebarOpen, state.engines, state.userName, state.userEmail, state.userPhone, state.termsAccepted, state.bgPreset, state.bgCustom, state.bgImage, state.chatBgImage, state.callStyle, state.avatars, state.avatarId, state.ttsVoiceId, state.avatarBg, state.avatarVoiceId, state.cloneSample, state.wakeWordEnabled]);

    // Aplica el acento y la tipografia como variables CSS en el <html>.
    useEffect(() => {
        const root = document.documentElement;
        const accent = state.accentId === 'custom'
            ? accentFromHex(state.accentCustom ?? '#ffffff')
            : getAccent(state.accentId);
        // `--accent` guarda la terna RGB SEPARADA POR ESPACIOS ("7 110 255")
        // para que `rgb(var(--accent)/0.2)` sea CSS valido. Con comas
        // ("7, 110, 255/.2") Chrome descarta la declaracion.
        // `--accent-rgb` se mantiene como alias.
        root.style.setProperty('--accent', accent.rgb);
        root.style.setProperty('--accent-rgb', accent.rgb);
        root.style.setProperty('--accent-hex', accent.hex);
        // Contraste para texto sobre el acento: oscuro si el acento es claro.
        root.style.setProperty('--accent-contrast', hexLuminance(accent.hex) > 0.6 ? '10 10 10' : '255 255 255');
        root.style.setProperty('--font-family', getFont(state.fontId).family);
    }, [state.accentId, state.accentCustom, state.fontId]);

    // Fondo global: preset de color o imagen (dataURL) aplicada al <body>.
    useEffect(() => {
        const BG_COLORS: Record<BgPreset, string> = {
            void: '#050505',
            graphite: '#0a0a0a',
            midnight: '#0b1020',
            wine: '#140a0f',
            custom: state.bgCustom ?? '#0a0a0a',
        };
        const hex = BG_COLORS[state.bgPreset];
        // Con imagen de fondo el color base se vuelve translúcido para que la
        // imagen (en <body>) se vea a través del lienzo principal.
        const alpha = state.bgImage ? ' / 0.45' : '';
        const m = /^#([0-9a-f]{6})$/i.exec(hex);
        const base = m
            ? `rgb(${parseInt(m[1].slice(0, 2), 16)} ${parseInt(m[1].slice(2, 4), 16)} ${parseInt(m[1].slice(4, 6), 16)}${alpha})`
            : hex;
        document.documentElement.style.setProperty('--bg-base', base);
        document.body.style.backgroundColor = hex;
        document.body.style.backgroundImage = state.bgImage ? `url(${state.bgImage})` : '';
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
    }, [state.bgPreset, state.bgCustom, state.bgImage]);

    const value = useMemo(() => ({ state, dispatch }), [state]);
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp debe usarse dentro de <AppProvider>');
    return ctx;
}
