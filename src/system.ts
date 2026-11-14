/**
 * Telemetria del sistema para CaRo Ai.
 *
 * En Electron usa el puente `window.joyai.getSystemInfo()` (IPC seguro).
 * En navegador (preview/dev) usa APIs web: navigator, screen, WebGL y battery.
 * Todo es de solo lectura y local; no sale del equipo.
 */

/** Registro de una actualización auto-aplicada al código fuente (A18). */
export interface UpdateRecord {
    id: string;
    description?: string;
    projectDir: string;
    appliedAt?: string;
    createdAt?: string;
    files: string[];
    commit?: string | null;
    git?: boolean;
    rolledBackAt?: string;
}

export interface SystemInfo {
    isElectron: boolean;
    platform: string;
    arch: string;
    osName: string;
    hostname?: string;
    cpuModel: string;
    cpuCores: number;
    ramTotalGB: number;
    ramUsedGB: number;
    ramFreeGB: number;
    gpuRenderer: string;
    gpuVendor?: string;
    /** Tier estimado de GPU para decidir calidad del avatar/fondo. */
    gpuTier: 'low' | 'mid' | 'high' | 'ultra';
    /** Calidad maxima de avatar que el equipo podria generar. */
    avatarQuality: string;
    diskTotalGB: number;
    diskFreeGB: number;
    batteryLevel?: number; // 0..1
    isCharging?: boolean;
    isOnBattery?: boolean;
    screenWidth: number;
    screenHeight: number;
    pixelRatio: number;
    networkIp?: string;
    electronVersion?: string;
    chromeVersion?: string;
    uptimeSec?: number;
    /** % CPU usado por los procesos de la app (Electron getAppMetrics). */
    appCpuPercent?: number;
    /** Load average del SO [1m, 5m, 15m] (0 en Windows). */
    loadAvg?: number[];
}

declare global {
    interface Window {
        joyai?: {
            platform: string;
            arch: string;
            versions: { electron: string; chrome: string; node: string };
            getSystemInfo?: () => Promise<Record<string, unknown>>;
            openExternal: (url: string) => void;
            /** Proxy IA por IPC (chat + health check, sin CORS). */
            aiRequest?: (payload: {
                endpoint: string;
                apiKey?: string;
                providerType: string;
                model: string;
                messages?: { role: string; content: string }[];
                temperature?: number;
                health?: boolean;
            }) => Promise<{ ok: boolean; text?: string; models?: string[]; latencyMs?: number; error?: string }>;
            /** Descarga un modelo en el servidor local (hoy: solo `ollama pull`). */
            enginePull?: (payload: { engineId: string; model: string }) => Promise<{ ok: boolean; output?: string; error?: string }>;
            /** Progreso en vivo de enginePull. Devuelve función para desuscribir. */
            onEnginePullProgress?: (cb: (p: { model: string; chunk: string }) => void) => () => void;
            onEnginePullDone?: (cb: (p: { model: string; ok: boolean }) => void) => () => void;
            setFloatMode?: (on: boolean) => Promise<{ ok: boolean; on: boolean }>;
            getFloatMode?: () => Promise<{ ok: boolean; on: boolean }>;
            minimizeWindow?: () => Promise<{ ok: boolean; error?: string }>;
            islandToggle?: () => Promise<{ ok: boolean; on: boolean }>;
            islandStatus?: () => Promise<{ ok: boolean; on: boolean }>;
            islandRestore?: () => Promise<{ ok: boolean }>;
            /** Ejecuta un comando en el shell del usuario (consola Terminal). */
            shellExec?: (command: string) => Promise<{ ok: boolean; output?: string; error?: string; code?: number }>;
            /** Proyección de pantalla por LAN (solo Electron). */
            linkShareStatus?: () => Promise<{ sharing: boolean; port: number; ips: { name: string; address: string }[]; code: string }>;
            linkShareStart?: (payload: { code: string; name: string }) => Promise<{ ok: boolean; port?: number; ips?: { name: string; address: string }[]; error?: string }>;
            linkShareStop?: () => Promise<{ ok: boolean }>;
            /** API de conectores permitidos (GitHub/GitLab/HF), solo GET vía proceso main. */
            connectorApi?: (payload: { service: 'github' | 'gitlab' | 'hf' | 'telegram' | 'discord' | 'x'; path: string; token: string }) => Promise<{ ok: boolean; status?: number; json?: unknown; text?: string; error?: string }>;
            /** Escanea carpetas del usuario buscando archivos de modelo locales. */
            modelsScan?: (payload?: { dir?: string }) => Promise<{ ok: boolean; count: number; truncated?: boolean; models: { path: string; name: string; size: number; ext: string }[] }>;
            /** Edición de media FFmpeg local (Electron). */
            mediaStatus?: () => Promise<{ ffmpeg: boolean; ffprobe: boolean }>;
            mediaPick?: () => Promise<{ ok: boolean; path: string | null }>;
            mediaProbe?: (payload: { path: string }) => Promise<{ ok: boolean; info?: { duration: number; size: number; format: string; video: { codec: string; width: number; height: number } | null; audio: { codec: string; sampleRate: string; channels: number } | null }; error?: string }>;
            mediaConvert?: (payload: { path: string; preset: string }) => Promise<{ ok: boolean; outputPath?: string; error?: string }>;
            /** Abre apps/archivos/URLs del usuario (acciones del agente, Electron). */
            osOpen?: (payload: { type: 'app' | 'path' | 'url'; target: string }) => Promise<{ ok: boolean; error?: string }>;
            /** Inventario de apps instaladas en la máquina (Electron). */
            systemApps?: () => Promise<{ name: string }[]>;
            /** Puente de agentes: servidor local 127.0.0.1 con token único por instalación. */
            bridgeInfo?: () => Promise<{ id: string; token: string; port: number | null; running: boolean }>;
            bridgeStart?: () => Promise<{ ok: boolean; id?: string; token?: string; port?: number | null; running?: boolean; error?: string }>;
            bridgeStop?: () => Promise<{ ok: boolean; running?: boolean }>;
            /** Inicio con el sistema (Electron). */
            appAutostart?: (enabled: boolean) => Promise<{ ok: boolean; enabled?: boolean; error?: string }>;
            appAutostartStatus?: () => Promise<{ ok: boolean; enabled?: boolean }>;
            /** Motores de voz locales (Piper/whisper) via IPC. */
            speechStatus?: () => Promise<{ piper: boolean; whisper: boolean; voicesDir: boolean; kokoro?: boolean; espeak?: boolean; clone?: boolean }>;
            /** TTS con Kokoro (voces naturales ES). */
            speechTtsKokoro?: (payload: { text: string; voice?: string }) => Promise<{ ok: boolean; wavBase64?: string; error?: string }>;
            speechVoices?: () => Promise<string[]>;
            speechTts?: (payload: { text: string; voice?: string; pitch?: number }) => Promise<{ ok: boolean; wavBase64?: string; error?: string }>;
            speechStt?: (payload: { wavBase64: string; lang?: string }) => Promise<{ ok: boolean; text?: string; error?: string }>;
            /** Ejecuta un comando SSH en un dispositivo propio (Electron). */
            deviceSsh?: (payload: { host: string; user: string; port?: number; command: string }) => Promise<{ ok: boolean; output?: string; error?: string; stderr?: string }>;
            /** Clonación de voz local (OpenVoice V2 + MeloTTS). */
            speechCloneSampleSave?: (payload: { ext: string; dataBase64: string }) => Promise<{ ok: boolean; path?: string; error?: string }>;
            speechCloneSampleInfo?: () => Promise<{ ok: boolean; samples?: { name: string; path: string; size: number }[]; error?: string }>;
            speechClone?: (payload: { text: string; refPath?: string }) => Promise<{ ok: boolean; wavBase64?: string; error?: string }>;
            /** Self-update seguro del código fuente (Electron). */
            updateStatus?: () => Promise<{ projectDir: string | null; isGit: boolean; versions: UpdateRecord[] }>;
            updatePickProject?: () => Promise<{ ok: boolean; path: string | null }>;
            updateSubmit?: (payload: { description?: string; files: { path: string; content: string }[] }) => Promise<{ ok: boolean; id?: string; files?: string[]; error?: string }>;
            updateApply?: (payload: { id: string }) => Promise<{ ok: boolean; record?: UpdateRecord; error?: string }>;
            updateRollback?: (payload?: { id?: string }) => Promise<{ ok: boolean; rolledBack?: string; error?: string }>;
            updateExport?: (payload?: { id?: string }) => Promise<{ ok: boolean; path?: string; error?: string }>;
            /** Visor de archivos de una actualización (staging). */
            updateView?: (payload: { id: string }) => Promise<{ ok: boolean; id?: string; description?: string; createdAt?: string; files?: { path: string; size: number; truncated: boolean; content: string | null }[]; error?: string }>;
            /** Abre la carpeta independiente de la actualización en el explorador del SO. */
            updateOpenDir?: (payload: { id: string }) => Promise<{ ok: boolean; error?: string }>;
            /** Captura de pantalla de la app → PNG en Documentos/CaRoAi-Capturas. */
            screenShot?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
            /** Control real del SO: mouse/teclado (nut.js, solo escritorio). */
            controlStatus?: () => Promise<{ ok: boolean; x?: number; y?: number; w?: number; h?: number; error?: string }>;
            controlMouseMove?: (p: { x: number; y: number }) => Promise<{ ok: boolean; error?: string }>;
            controlMouseClick?: (p?: { button?: 'left' | 'right' | 'middle' }) => Promise<{ ok: boolean; error?: string }>;
            controlType?: (p: { text: string }) => Promise<{ ok: boolean; error?: string }>;
            controlKey?: (p: { key: string }) => Promise<{ ok: boolean; error?: string }>;
            /** Auto-updater de la app instalada (solo packaged). */
            appVersion?: () => Promise<{ version: string; packaged: boolean }>;
            appUpdateCheck?: () => Promise<{ ok: boolean; error?: string }>;
            appUpdateDownload?: () => Promise<{ ok: boolean; error?: string }>;
            appUpdateInstall?: () => Promise<{ ok: boolean; error?: string }>;
            onUpdateEvent?: (cb: (data: { type: string; version?: string; percent?: number; message?: string }) => void) => () => void;
            /** Borra la sesion de una particion del navegador integrado. */
            clearSession?: (partition: string) => Promise<{ ok: boolean; error?: string }>;
            /** Secretos cifrados con safeStorage (solo Electron). */
            secretsSave?: (entries: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
            secretsLoad?: () => Promise<Record<string, string>>;
        };
    }
}

function gb(bytes: number): number {
    return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

/** Estima el tier de GPU por el string del renderer/driver (heuristica). */
export function estimateGpuTier(renderer: string, vendor = ''): { tier: SystemInfo['gpuTier']; quality: string } {
    const s = `${renderer} ${vendor}`.toLowerCase();
    // Ultra: GPUs de escritorio potentes (NVIDIA RTX 30/40/50, AMD RX 6000/7000).
    if (/rtx[\s_-]*(30|40|50)\d{2}|rtx pro|radeon rx (6|7)\d{3}|radeon pro w|arc b\d/.test(s)) {
        return { tier: 'ultra', quality: 'Ultra — 3D/fotorrealista viable' };
    }
    // High: GPUs dedicadas de gama media (RTX laptop/3050-4070, GTX 10/16, RX 500-6000, Arc A).
    if (/rtx|gtx|radeon rx|radeon pro|arc a[0-9]|quadro|tesla|apple m[1-4]\s*(pro|max|ultra)/.test(s)) {
        return { tier: 'high', quality: 'Alta — avatar animado fluido' };
    }
    // Mid: integradas modernas (Intel Iris/UHD, AMD Vega/RDNA iGPU, Apple base, Mali, Adreno).
    if (/iris|uhd|intel|vega|hd graphics|integrated|radeon(?! rx)|mali|adreno|apple m[1-4]$|apple gpu/.test(s)) {
        return { tier: 'mid', quality: 'Media — 2D animado ligero' };
    }
    // Low: desconocida o muy básica → fallback 2D que corre en cualquier equipo.
    return { tier: 'low', quality: 'Básica — avatar 2D (siempre disponible)' };
}

function detectOsName(ua: string, platform: string): string {
    if (/windows/i.test(ua)) return 'Windows';
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ios/i.test(ua)) return 'iOS';
    if (/mac/i.test(ua)) return 'macOS';
    if (/linux/i.test(ua)) return 'Linux';
    return platform || 'Desconocido';
}

/** Renderer GPU via WebGL (funciona en Electron y navegador). */
function getGpuRendererWebGL(): { renderer: string; vendor: string } {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { renderer: 'WebGL no disponible', vendor: '' };
        const dbg = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        const renderer = dbg
            ? String((gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).RENDERER))
            : String((gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).VERSION));
        const vendor = dbg
            ? String((gl as WebGLRenderingContext).getParameter((gl as WebGLRenderingContext).VENDOR))
            : '';
        return { renderer, vendor };
    } catch {
        return { renderer: 'No detectado', vendor: '' };
    }
}

async function webFallback(): Promise<SystemInfo> {
    const ua = navigator.userAgent;
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
        ?? (/Win/i.test(ua) ? 'win32' : /Mac/i.test(ua) ? 'darwin' : /Android/i.test(ua) ? 'android' : /iPhone|iPad/i.test(ua) ? 'ios' : 'linux');

    let diskTotalGB = 0;
    let diskFreeGB = 0;
    try {
        const est = await navigator.storage?.estimate?.();
        if (est?.quota) {
            diskTotalGB = gb(est.quota);
            diskFreeGB = gb(Math.max(0, est.quota - (est.usage ?? 0)));
        }
    } catch { /* sin storage estimate */ }

    let batteryLevel: number | undefined;
    let isCharging: boolean | undefined;
    try {
        const bat = await (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery?.();
        if (bat) { batteryLevel = bat.level; isCharging = bat.charging; }
    } catch { /* sin battery api */ }

    const gpu = getGpuRendererWebGL();
    const gpuTier = estimateGpuTier(gpu.renderer, gpu.vendor);
    const ramTotalGB = gb((navigator as Navigator & { deviceMemory?: number }).deviceMemory ? (navigator as Navigator & { deviceMemory: number }).deviceMemory * 1024 ** 3 : 0);
    const ramUsedGB = 0; // el navegador no expone uso real de RAM
    const ramFreeGB = Math.max(0, ramTotalGB - ramUsedGB);

    return {
        isElectron: false,
        platform,
        arch: '',
        osName: detectOsName(ua, platform),
        cpuModel: `${navigator.hardwareConcurrency ?? '?'} nucleos (logicos)`,
        cpuCores: navigator.hardwareConcurrency ?? 0,
        ramTotalGB,
        ramUsedGB,
        ramFreeGB,
        gpuRenderer: gpu.renderer,
        gpuVendor: gpu.vendor || undefined,
        gpuTier: gpuTier.tier,
        avatarQuality: gpuTier.quality,
        diskTotalGB,
        diskFreeGB,
        batteryLevel,
        isCharging,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        pixelRatio: window.devicePixelRatio || 1,
        electronVersion: undefined,
        chromeVersion: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1],
    };
}

function mapElectron(raw: Record<string, unknown>): SystemInfo {
    const cpus = (raw.cpus as { model?: string; count?: number }[] | undefined) ?? [];
    const ramTotal = Number(raw.ramTotalBytes ?? 0);
    const ramFree = Number(raw.ramFreeBytes ?? 0);
    const diskTotal = Number(raw.diskTotalBytes ?? 0);
    const diskFree = Number(raw.diskFreeBytes ?? 0);
    const gpuInfo = raw.gpuInfo as { devices?: { vendorId?: number; deviceId?: number; driverVendor?: string; driverVersion?: string }[] } | undefined;
    const firstGpu = gpuInfo?.devices?.[0];
    const bat = raw.battery as { level?: number; charging?: boolean; onBattery?: boolean } | undefined;
    const disp = raw.display as { width?: number; height?: number; scaleFactor?: number } | undefined;
    const net = raw.network as { ip?: string } | undefined;
    // Nombre real de la GPU via WebGL (ANGLE reporta "AMD Radeon RX…" /
    // "NVIDIA GeForce…"); el vendorId de Electron solo da ids numéricos.
    const gl = getGpuRendererWebGL();
    const gpuRendererStr = gl.renderer && !/no disponible|no detectado/i.test(gl.renderer)
        ? `${gl.renderer}${gl.vendor ? ` · ${gl.vendor}` : ''}`
        : (firstGpu ? `GPU id ${firstGpu.vendorId ?? '?'}:${firstGpu.deviceId ?? '?'} · ${firstGpu.driverVendor ?? ''}`.trim() : 'No detectada');
    const gpuTier = estimateGpuTier(gpuRendererStr, firstGpu?.driverVendor ?? gl.vendor);

    return {
        isElectron: true,
        platform: String(raw.platform ?? ''),
        arch: String(raw.arch ?? ''),
        osName: String(raw.osName ?? raw.platform ?? ''),
        hostname: raw.hostname ? String(raw.hostname) : undefined,
        cpuModel: cpus[0]?.model ?? 'Desconocido',
        cpuCores: cpus[0]?.count ?? cpus.length,
        ramTotalGB: gb(ramTotal),
        ramUsedGB: gb(Math.max(0, ramTotal - ramFree)),
        ramFreeGB: gb(ramFree),
        gpuRenderer: gpuRendererStr,
        gpuVendor: firstGpu?.driverVendor,
        gpuTier: gpuTier.tier,
        avatarQuality: gpuTier.quality,
        diskTotalGB: gb(diskTotal),
        diskFreeGB: gb(diskFree),
        batteryLevel: bat?.level,
        isCharging: bat?.charging,
        isOnBattery: bat?.onBattery,
        screenWidth: disp?.width ?? window.screen.width,
        screenHeight: disp?.height ?? window.screen.height,
        pixelRatio: disp?.scaleFactor ?? window.devicePixelRatio ?? 1,
        networkIp: net?.ip,
        electronVersion: raw.electronVersion ? String(raw.electronVersion) : undefined,
        chromeVersion: raw.chromeVersion ? String(raw.chromeVersion) : undefined,
        uptimeSec: raw.uptimeSec ? Number(raw.uptimeSec) : undefined,
        appCpuPercent: raw.appCpuPercent != null ? Number(raw.appCpuPercent) : undefined,
        loadAvg: Array.isArray(raw.loadAvg) ? (raw.loadAvg as unknown[]).map(Number) : undefined,
    };
}

/** Devuelve la telemetria disponible. Nunca lanza: si algo falla, usa fallback web. */
export async function getSystemInfo(): Promise<SystemInfo> {
    try {
        if (window.joyai?.getSystemInfo) {
            const raw = await window.joyai.getSystemInfo();
            return mapElectron(raw);
        }
    } catch {
        /* cae al fallback web */
    }
    return webFallback();
}
