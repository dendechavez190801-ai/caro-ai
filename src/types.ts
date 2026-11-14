export type AppTab = 'system' | 'chat' | 'call' | 'avatar' | 'preview' | 'vault' | 'terminal';

/**
 * Los 11 modulos del sidebar, tal como aparecen en la app de referencia.
 * Cada uno abre su propia pagina dentro del shell.
 */
export type ModuleId =
    | 'appearance'
    | 'models'
    | 'agents'
    | 'accounts'
    | 'memory'
    | 'permissions'
    | 'legal'
    | 'terminal'
    | 'connectors'
    | 'devices'
    | 'hardware'
    | 'vault'
    | 'screen'
    | 'media'
    | 'updates';

export interface SidebarModule {
    id: ModuleId;
    label: string;
    description: string;
    icon: string;
    badge?: string;
}

export const SIDEBAR_MODULES: SidebarModule[] = [
    { id: 'appearance', label: 'Apariencia y Temas', description: 'Acento, tipografía, tamaño y música', icon: 'palette' },
    { id: 'models', label: 'Modelos e IA', description: 'Motor local, nube y detección Ollama/LMStudio', icon: 'brain' },
    { id: 'agents', label: 'Agentes y Entornos', description: 'VS Code, Cursor, Claude Code, OpenCode, Hermes', icon: 'users' },
    { id: 'accounts', label: 'Cuentas y Navegador', description: 'Navegador integrado con sesiones por servicio', icon: 'globe' },
    { id: 'memory', label: 'Memoria y Personalidad', description: 'Skills, tono y métricas de memoria', icon: 'database' },
    { id: 'permissions', label: 'Permisos de SO', description: 'Permisos granulares de hardware y SO', icon: 'shield' },
    { id: 'legal', label: 'Consentimiento Legal', description: 'Acuerdo de responsabilidad legal y ética', icon: 'scale' },
    { id: 'terminal', label: 'Terminal y Conexión', description: 'Terminal CLI y scripts de enlace multiplataforma', icon: 'terminal' },
    { id: 'connectors', label: 'Conectores del Sistema', description: 'Mensajería, IP/shell y proxy', icon: 'plug' },
    { id: 'devices', label: 'Dispositivos y Red', description: 'IP local, dispositivos y red privada', icon: 'wifi' },
    { id: 'hardware', label: 'Diagnóstico de Hardware', description: 'CPU, RAM, GPU, disco y batería', icon: 'activity' },
    { id: 'screen', label: 'Pantalla', description: 'Proyección y control de pantalla entre tus dispositivos', icon: 'screen' },
    // 'media' (Media Studio) eliminado del menú por petición del usuario — el
    // módulo sigue existiendo en pages/modules/MediaModule.tsx por si se reactiva.
    { id: 'updates', label: 'Actualizaciones', description: 'Self-update seguro del código: validar, aplicar y revertir', icon: 'updates' },
];

export type DeviceMode = 'desktop' | 'mobile' | 'tablet';

export type PlatformType = 'windows' | 'macos' | 'linux' | 'android' | 'ios';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface MediaAttachment {
    type: 'image' | 'video' | 'audio' | 'file';
    url: string;
    name: string;
    size?: string;
}

export interface Message {
    id: string;
    role: MessageRole;
    text: string;
    timestamp: string;
    attachments?: MediaAttachment[];
    deviceSource?: string;
}

export interface SystemTelemetry {
    cpu_usage_pct: number;
    ram_total_gb: number;
    ram_used_gb: number;
    ram_free_gb: number;
    disk_free_gb: number;
    screen_resolution: string;
    platform: PlatformType;
    battery_level?: number;
    is_charging?: boolean;
}

export interface AIEngineConfig {
    id: string;
    name: string;
    providerType: 'openai' | 'gemini' | 'anthropic' | 'ollama' | 'lmstudio' | 'vllm' | 'groq' | 'deepseek' | 'openrouter' | 'nvidia' | 'custom';
    endpoint: string;
    apiKey?: string;
    model: string;
    enabled: boolean;
}

export interface AppSettings {
    agentName: string;
    activeEngine: string;
    engines: AIEngineConfig[];
    voiceEnabled: boolean;
    wakeWordEnabled: boolean;
    theme: 'light' | 'dark' | 'system';
}

export interface OSActionExecuted {
    type: 'launch_app' | 'execute_shell' | 'mouse_control' | 'keyboard_type' | 'take_screenshot' | 'web_search' | 'skill_executed' | 'navigate_social';
    target: string;
    status: 'completed' | 'in_progress' | 'failed';
    details?: string;
    output?: string;
}

export interface UrlPreviewData {
    url: string;
    title: string;
    description: string;
    image?: string;
    author?: string;
}

export interface SwarmAgent {
    id: string;
    name: string;
    role: string;
    protocol: string;
    endpoint: string;
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    capabilities: string[];
    status: 'online' | 'offline' | 'busy' | 'error' | 'connecting';
    lastSeen?: string;
    avatar?: string;
    color: string;
    isJoy?: boolean;
}

export interface AgentTeam {
    id: string;
    name: string;
    description: string;
    agentIds: string[];
    coordinatorId: string;
    strategy: 'sequential' | 'parallel' | 'auction' | 'hierarchical';
    sharedMemory: boolean;
    maxRounds: number;
    createdAt: string;
}

export interface SwarmTask {
    id: string;
    teamId: string;
    goal: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    steps: Array<{
        agentId: string;
        agentName: string;
        input: string;
        output?: string;
        startedAt: string;
        finishedAt?: string;
        status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    }>;
    finalResult?: string;
    createdAt: string;
    finishedAt?: string;
}

export interface Skill {
    id: string;
    name: string;
    description: string;
    trigger: string;
    code: string;
    enabled: boolean;
    isCore: boolean;
}

export type CallVisualizerStyle = 'orb' | 'bars' | 'wave' | 'hologram';

export interface VoiceState {
    isListening: boolean;
    isSpeaking: boolean;
    transcript: string;
    volumeLevel: number;
}
