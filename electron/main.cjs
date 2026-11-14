/**
 * Electron 34 — proceso principal (Windows / macOS).
 *
 * Se usa .cjs a proposito: package.json declara "type": "module" para Vite,
 * y el preloader de Electron carga el preload como CommonJS. Asi los dos mundos
 * no chocan.
 *
 * Flujo:
 *   - dev  -> carga Vite en http://localhost:3000 (HMR activo)
 *   - prod -> carga dist/index.html (build de la app)
 */
const { app, BrowserWindow, ipcMain, shell, powerMonitor, screen, session, safeStorage, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let forceQuit = false;

/** Icono de bandeja: reusa el icono de la app si existe; si no, imagen vacía. */
function trayIcon() {
    try {
        const ico = path.join(__dirname, '..', 'build', 'icon.ico');
        if (fs.existsSync(ico)) return nativeImage.createFromPath(ico);
    } catch { /* noop */ }
    return nativeImage.createEmpty();
}

function createTray() {
    tray = new Tray(trayIcon());
    tray.setToolTip('CaRo Ai — agente en segundo plano');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Abrir CaRo Ai', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
        { type: 'separator' },
        { label: 'Salir del todo', click: () => { forceQuit = true; app.quit(); } },
    ]));
    tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: 'Joy AI',
        backgroundColor: '#0a0a0a',
        autoHideMenuBar: true,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            // Permite el <webview> del navegador integrado (Cuentas).
            webviewTag: true,
            // La ventana puede estar oculta en bandeja y el wake word/voz
            // deben seguir funcionando: sin throttling de fondo.
            backgroundThrottling: false,
        },
    });

    mainWindow.once('ready-to-show', () => mainWindow?.show());

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    // Los enlaces externos se abren en el navegador del sistema, nunca dentro.
    // Cerrar la ventana NO sale de la app: queda en bandeja escuchando
    // (wake word y proyección LAN siguen activos). Salir real: menú bandeja.
    mainWindow.on('close', (e) => {
        if (!forceQuit) {
            e.preventDefault();
            mainWindow?.hide();
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Solo http(s) sale al navegador del sistema; file:/javascript:/etc no.
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    // Al minimizar la app la isla dinámica aparece sola (estilo Dynamic Island);
    // al restaurar la ventana principal la isla se cierra.
    mainWindow.on('minimize', () => {
        if (!islandWindow || islandWindow.isDestroyed()) createIslandWindow();
        else islandWindow.show();
    });
    mainWindow.on('restore', () => {
        if (islandWindow && !islandWindow.isDestroyed()) islandWindow.close();
    });

    // Anti-navegación: el frame principal nunca sale de la app. Sin esto, una
    // redirección/XSS podría cargar una página remota CON acceso a window.joyai.
    // file:// solo se permite dentro del directorio de la app (no cualquier HTML local).
    const allowedNav = (url) => {
        if (isDev && url.startsWith('http://localhost:3000')) return true;
        if (!url.startsWith('file://')) return false;
        try {
            const p = decodeURIComponent(new URL(url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
            const root = app.getAppPath();
            return p === root || p.startsWith(root + path.sep);
        } catch { return false; }
    };
    mainWindow.webContents.on('will-navigate', (e, url) => {
        if (!allowedNav(url)) e.preventDefault();
    });

    // Permisos del renderer: solo micrófono/cámara (voz y llamada). El resto
    // (geolocalización, notificaciones, etc.) se deniega por defecto.
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
        callback(permission === 'media' || permission === 'display-capture');
    });

    // Sesiones de webview (persist:caro-*, Cuentas): denegar TODO permiso —
    // un sitio de login no necesita mic/cámara/geo dentro del navegador interno.
    app.on('session-created', (ses) => {
        if (ses !== session.defaultSession) {
            ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
        }
    });
}

/* ── Inicio con el sistema (autostart por usuario) ────────────────────── */
ipcMain.handle('app:autostart', async (_event, payload) => {
    const enabled = payload?.enabled === true;
    try {
        app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false });
        return { ok: true, enabled: app.getLoginItemSettings().openAtLogin };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'no se pudo configurar' };
    }
});
ipcMain.handle('app:autostart-status', async () => ({ ok: true, enabled: app.getLoginItemSettings().openAtLogin }));

/* ── Modo isla dinámica: ventana flotante siempre visible ───────────────
 * El usuario puede activar "flotante" para que la app quede por encima de
 * todo (estilo Dynamic Island): sigue visible aunque minimices otras
 * ventanas, se puede arrastrar a cualquier posición de la pantalla y las
 * notificaciones de la IA (descargas, tareas) siguen llegando.
 */
let floatMode = false;
ipcMain.handle('win:float', async (_event, payload) => {
    const on = payload?.on === true;
    floatMode = on;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(on, 'floating');
        mainWindow.setVisibleOnAllWorkspaces?.(on);
    }
    return { ok: true, on: floatMode };
});
ipcMain.handle('win:float-status', async () => ({ ok: true, on: floatMode }));

/** Minimiza la ventana principal (para acciones del agente). */
ipcMain.handle('win:minimize', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
        return { ok: true };
    }
    return { ok: false, error: 'ventana no disponible' };
});

/* ── Isla dinámica: ventana compacta independiente, siempre visible ────
 * A diferencia del "modo flotante" (alwaysOnTop de la ventana completa),
 * la isla es una ventana aparte y pequeña: se puede minimizar la app
 * principal y la isla sigue en pantalla, estilo Dynamic Island.
 * Clic en la isla → restaura/enfoca la ventana principal.
 */
let islandWindow = null;

function islandPageUrl() {
    const base = isDev
        ? 'http://localhost:3000/'
        : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
    return `${base}${base.includes('?') ? '&' : '?'}island=1`;
}

function createIslandWindow() {
    const { workArea } = screen.getPrimaryDisplay();
    islandWindow = new BrowserWindow({
        width: 400,
        height: 88,
        x: Math.round(workArea.x + (workArea.width - 400) / 2),
        y: workArea.y + 20,
        frame: false,
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            backgroundThrottling: false,
        },
    });
    islandWindow.setAlwaysOnTop(true, 'floating');
    islandWindow.setVisibleOnAllWorkspaces?.(true);
    islandWindow.loadURL(islandPageUrl());
    // La isla usa el mismo preload (window.joyai): mismos guardas que la ventana
    // principal — sin esto un navigate/popups en la isla tendrían acceso IPC.
    islandWindow.webContents.on('will-navigate', (e, url) => {
        const ok = url.startsWith('file://') || (isDev && url.startsWith('http://localhost:3000'));
        if (!ok) e.preventDefault();
    });
    islandWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    islandWindow.on('closed', () => { islandWindow = null; });
}

ipcMain.handle('island:toggle', async () => {
    if (islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.close();
        return { ok: true, on: false };
    }
    createIslandWindow();
    return { ok: true, on: true };
});
ipcMain.handle('island:status', async () => ({
    ok: true,
    on: Boolean(islandWindow && !islandWindow.isDestroyed()),
}));
ipcMain.handle('island:restore', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
    return { ok: true };
});

ipcMain.on('open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});

/** Telemetria de solo lectura para la UI (Hardware/Dispositivos). */
ipcMain.handle('get-system-info', async () => {
    const cpus = os.cpus();
    const ramTotal = os.totalmem();
    const ramFree = os.freemem();

    let diskTotal = 0;
    let diskFree = 0;
    try {
        const st = fs.statfsSync(app.getPath('home'));
        diskTotal = Number(st.blocks) * Number(st.bsize);
        diskFree = Number(st.bavail) * Number(st.bsize);
    } catch { /* sin statfs */ }

    // GPU via Electron (si esta disponible en esta version/plataforma).
    let gpuDevices = [];
    try {
        const info = await app.getGPUInfo('complete');
        const list = info?.gpuDevice ?? info?.devices ?? [];
        gpuDevices = list.map((d) => ({
            vendorId: d.vendorId,
            deviceId: d.deviceId,
            driverVendor: d.driverVendor,
            driverVersion: d.driverVersion,
        }));
    } catch { /* GPU info no disponible */ }

    // Primera IPv4 no-loopback (red local).
    let ip;
    for (const list of Object.values(os.networkInterfaces())) {
        for (const n of list ?? []) {
            if (n.family === 'IPv4' && !n.internal) { ip = n.address; break; }
        }
        if (ip) break;
    }

    // CPU% real de los procesos de la app (Electron expone percentCPUUsage).
    let appCpu = null;
    try {
        const metrics = app.getAppMetrics() ?? [];
        appCpu = metrics.reduce((acc, m) => acc + (m?.cpu?.percentCPUUsage ?? 0), 0);
    } catch { /* noop */ }

    const disp = screen.getPrimaryDisplay();
    return {
        platform: os.platform(),
        arch: os.arch(),
        osName: `${os.type()} ${os.release()}`,
        hostname: os.hostname(),
        cpus: cpus.slice(0, 1).map((c) => ({ model: c.model, count: cpus.length })),
        ramTotalBytes: ramTotal,
        ramFreeBytes: ramFree,
        diskTotalBytes: diskTotal,
        diskFreeBytes: diskFree,
        gpuInfo: { devices: gpuDevices },
        battery: {
            onBattery: powerMonitor.isOnBatteryPower(),
            charging: !powerMonitor.isOnBatteryPower(),
        },
        display: {
            width: disp?.size?.width ?? 0,
            height: disp?.size?.height ?? 0,
            scaleFactor: disp?.scaleFactor ?? 1,
        },
        network: { ip },
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        uptimeSec: os.uptime(),
        appCpuPercent: appCpu,
        loadAvg: os.loadavg(),
    };
});

/**
 * Proxy de peticiones IA (`ai:request`).
 *
 * El renderer ya no llama a las APIs directamente: esto evita CORS (Anthropic
 * y Gemini lo bloquean en navegador) y mantiene las API keys en el proceso
 * principal. Node 20+ (Electron 34) trae fetch global.
 *
 * payload: { endpoint, apiKey?, providerType, model, messages?, temperature?, health? }
 * health=true -> GET {endpoint}/models ; si no -> chat completion.
 * Retorna { ok, text?, models?, latencyMs?, error? } — nunca lanza.
 */
async function handleAiRequest(payload) {
    const endpoint = String(payload?.endpoint ?? '').replace(/\/+$/, '');
    const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';
    const providerType = String(payload?.providerType ?? 'custom');
    const model = String(payload?.model ?? '');
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const temperature = typeof payload?.temperature === 'number' ? payload.temperature : undefined;

    if (!/^https?:\/\//.test(endpoint)) return { ok: false, error: 'endpoint invalido' };

    // Las API keys NUNCA viajan por HTTP plano a un host externo: solo se
    // permite http:// en loopback (Ollama/LM Studio/vLLM locales).
    const isLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(endpoint);
    if (apiKey && /^http:\/\//i.test(endpoint) && !isLocal) {
        return { ok: false, error: 'endpoint inseguro: las API keys solo viajan por HTTPS (http solo en local)' };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    // --- Health check: GET /models ---
    if (payload?.health) {
        const t0 = Date.now();
        try {
            const res = await fetch(`${endpoint}/models`, { headers, signal: AbortSignal.timeout(4000) });
            const latencyMs = Date.now() - t0;
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
                const models = list.map((m) => m?.id ?? m?.name ?? '').filter((s) => typeof s === 'string' && s);
                return { ok: true, latencyMs, models };
            }
            // Respaldo para servidores locales: Ollama expone /api/tags en la
            // raiz (sin /v1). Se intenta para cualquier endpoint localhost —
            // cubre motores guardados como 'custom' o endpoints sin /v1.
            if (/^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(endpoint)) {
                const root = endpoint.replace(/\/v1\/?$/, '');
                const r2 = await fetch(`${root}/api/tags`, { signal: AbortSignal.timeout(4000) });
                if (r2.ok) {
                    const d2 = await r2.json();
                    const models = (Array.isArray(d2?.models) ? d2.models : [])
                        .map((m) => m?.name ?? m?.model ?? '').filter((s) => typeof s === 'string' && s);
                    if (models.length) return { ok: true, latencyMs: Date.now() - t0, models, source: 'ollama' };
                }
                // LM Studio / vLLM / OpenAI-compatible en raiz sin /v1
                const r3 = await fetch(`${root}/models`, { signal: AbortSignal.timeout(4000) });
                if (r3.ok) {
                    const d3 = await r3.json();
                    const list3 = Array.isArray(d3?.data) ? d3.data : Array.isArray(d3?.models) ? d3.models : [];
                    const models3 = list3.map((m) => m?.id ?? m?.name ?? '').filter((s) => typeof s === 'string' && s);
                    if (models3.length) return { ok: true, latencyMs: Date.now() - t0, models: models3 };
                }
            }
            return { ok: false, latencyMs, error: `HTTP ${res.status}` };
        } catch (err) {
            return { ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message : 'sin conexion' };
        }
    }

    // --- Chat ---
    let url = '';
    let body = {};
    const reqHeaders = { ...headers };

    if (providerType === 'anthropic') {
        url = `${endpoint}/messages`;
        delete reqHeaders.Authorization;
        reqHeaders['x-api-key'] = apiKey;
        reqHeaders['anthropic-version'] = '2023-06-01';
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n').trim();
        const chat = messages.filter((m) => m.role !== 'system').filter((m, i) => !(i === 0 && m.role === 'assistant'));
        body = {
            model,
            max_tokens: 1024,
            ...(system ? { system } : {}),
            ...(temperature !== undefined ? { temperature } : {}),
            messages: chat.map((m) => ({ role: m.role, content: m.content })),
        };
    } else if (providerType === 'gemini') {
        url = `${endpoint}/models/${encodeURIComponent(model)}:generateContent`;
        delete reqHeaders.Authorization;
        if (apiKey) reqHeaders['x-goog-api-key'] = apiKey;
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n').trim();
        body = {
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents: messages.filter((m) => m.role !== 'system').map((m) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            })),
        };
    } else {
        // OpenAI-compatible: OpenAI, Groq, DeepSeek, OpenRouter, Nvidia,
        // Ollama, LM Studio, vLLM y custom.
        url = `${endpoint}/chat/completions`;
        body = { model, messages, temperature: temperature ?? 0.7 };
    }

    try {
        const res = await fetch(url, { method: 'POST', headers: reqHeaders, body: JSON.stringify(body) });
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            return { ok: false, error: `HTTP ${res.status}${t ? `: ${t.slice(0, 180)}` : ''}` };
        }
        const data = await res.json();
        let text = '';
        if (providerType === 'anthropic') {
            text = (data?.content ?? []).filter((b) => b?.type === 'text').map((b) => b?.text ?? '').join('');
        } else if (providerType === 'gemini') {
            text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text ?? '').join('');
        } else {
            text = data?.choices?.[0]?.message?.content ?? '';
        }
        return { ok: true, text: typeof text === 'string' && text.trim() ? text : '(sin respuesta)' };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'error de red' };
    }
}

/**
 * Motores de voz locales (Piper TTS + whisper.cpp STT).
 * Viven fuera de la app en joy-ai-build/engines; en produccion se pueden
 * empaquetar o apuntar con CARO_ENGINES_DIR.
 */
const ENGINES_DIR = process.env.CARO_ENGINES_DIR
    ? path.resolve(process.env.CARO_ENGINES_DIR)
    : app.isPackaged
        ? path.join(process.resourcesPath, 'engines')
        : path.join(__dirname, '..', '..', '..', '..', 'joy-ai-build', 'engines');
const PIPER_EXE = path.join(ENGINES_DIR, 'piper', 'piper', 'piper.exe');
const WHISPER_CLI = path.join(ENGINES_DIR, 'whisper', 'Release', 'whisper-cli.exe');
const WHISPER_MODEL = path.join(ENGINES_DIR, 'whisper', 'ggml-small-q5_1.bin');
const VOICES_DIR = path.join(ENGINES_DIR, 'voices');

/* FFmpeg/ffprobe: binarios descargados a joy-ai-build/engines/ffmpeg/<ver>/bin.
 * Se resuelve el primer ffmpeg* encontrado (la versión puede cambiar). */
function ffmpegBin(name) {
    const base = path.join(ENGINES_DIR, 'ffmpeg');
    try {
        for (const d of fs.readdirSync(base)) {
            for (const sub of ['bin', '.']) {
                const cand = path.join(base, d, sub, process.platform === 'win32' ? `${name}.exe` : name);
                if (fs.existsSync(cand)) return cand;
            }
        }
    } catch { /* noop */ }
    return null;
}
const FFMPEG_EXE = () => ffmpegBin('ffmpeg');
const FFPROBE_EXE = () => ffmpegBin('ffprobe');
const MEDIA_OUT_DIR = () => path.join(app.getPath('documents'), 'CaRoAi-Salidas');

/* Kokoro TTS (voces naturales, ~90MB cuantizado, CPU). Assets en
 * engines/kokoro + espeak-ng para fonemas españoles. */
const ESPEAK_DIR = path.join(ENGINES_DIR, 'espeak', 'eSpeak NG');
const ESPEAK_EXE = path.join(ESPEAK_DIR, 'espeak-ng.exe');
const ESPEAK_DATA = path.join(ESPEAK_DIR, 'espeak-ng-data');
const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let kokoroInstance = null;
let kokoroLoading = null;

async function getKokoro() {
    if (kokoroInstance) return kokoroInstance;
    if (!kokoroLoading) {
        kokoroLoading = (async () => {
            const { KokoroTTS } = require('kokoro-js');
            return KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: 'q8', device: 'cpu' });
        })();
    }
    kokoroInstance = await kokoroLoading;
    return kokoroInstance;
}

/** float32 PCM → WAV 16-bit mono 24kHz (formato que esperan los reproductores). */
function floatToWavBase64(samples, sampleRate = 24000) {
    const n = samples.length;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
    }
    return buf.toString('base64');
}

const KOKORO_VOICES = new Set(['ef_dora', 'em_alex', 'em_santa']);

function runProcess(cmd, args, opts = {}) {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { windowsHide: true, ...opts });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (d) => { stdout += d.toString(); });
        child.stderr?.on('data', (d) => { stderr += d.toString(); });
        child.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message }));
        child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
}

ipcMain.handle('speech:status', async () => ({
    piper: fs.existsSync(PIPER_EXE),
    whisper: fs.existsSync(WHISPER_CLI) && fs.existsSync(WHISPER_MODEL),
    voicesDir: fs.existsSync(VOICES_DIR),
    kokoro: true, // kokoro-js se resuelve via npm; el modelo se descarga la 1a vez
    espeak: fs.existsSync(ESPEAK_EXE),
    clone: fs.existsSync(PY_EXE) && fs.existsSync(OV_SCRIPT),
}));

ipcMain.handle('speech:voices', async () => {
    try {
        return fs.readdirSync(VOICES_DIR).filter((f) => f.endsWith('.onnx')).sort();
    } catch {
        return [];
    }
});

/**
 * TTS con Kokoro (voces naturales): texto → espeak-ng IPA → fonemas →
 * modelo ONNX q8 → PCM float32 → WAV 16-bit base64.
 * Voces ES: ef_dora (F), em_alex (M), em_santa (M).
 */
ipcMain.handle('speech:tts-kokoro', async (_event, payload) => {
    const text = String(payload?.text ?? '').slice(0, 4000);
    const voice = KOKORO_VOICES.has(String(payload?.voice)) ? String(payload.voice) : 'ef_dora';
    if (!text.trim()) return { ok: false, error: 'texto vacio' };
    if (!fs.existsSync(ESPEAK_EXE)) return { ok: false, error: 'espeak-ng no instalado' };
    try {
        // 1) Fonemas españoles via espeak-ng (IPA por stdin → stdout).
        const ipa = await new Promise((resolve, reject) => {
            const child = spawn(ESPEAK_EXE, ['-v', 'es', '-q', '--ipa=3'], {
                windowsHide: true,
                env: { ...process.env, ESPEAK_DATA },
            });
            let out = '';
            child.stdout.on('data', (d) => { out += d.toString(); });
            child.on('error', reject);
            child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`espeak código ${code}`))));
            child.stdin.write(text);
            child.stdin.end();
        });
        if (!ipa) return { ok: false, error: 'espeak no generó fonemas' };

        // 2) Modelo Kokoro (carga perezosa; la primera vez tarda unos segundos).
        const kokoro = await getKokoro();
        const enc = kokoro.tokenizer(ipa, { truncation: true });
        const audio = await kokoro.generate_from_ids(enc.input_ids, { voice, speed: 1 });
        return { ok: true, wavBase64: floatToWavBase64(audio.audio, audio.sampling_rate || 24000) };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'error kokoro' };
    }
});

/** TTS local con Piper: genera WAV y lo devuelve en base64.
 *  `pitch` (0.5–2.0) aplica desplazamiento de tono con ffmpeg
 *  (asetrate+atempo) para voces de niño/niña sobre voces adultas base. */
ipcMain.handle('speech:tts', async (_event, payload) => {
    const text = String(payload?.text ?? '').slice(0, 4000);
    const voiceFile = String(payload?.voice ?? 'es_ES-davefx-medium.onnx');
    const pitch = Math.min(2, Math.max(0.5, Number(payload?.pitch) || 1));
    const voiceOnnx = path.join(VOICES_DIR, path.basename(voiceFile));
    if (!text.trim()) return { ok: false, error: 'texto vacio' };
    if (!fs.existsSync(PIPER_EXE)) return { ok: false, error: 'piper no instalado' };
    if (!fs.existsSync(voiceOnnx)) return { ok: false, error: `voz no encontrada: ${voiceFile}` };

    const outWav = path.join(os.tmpdir(), `caro-tts-${Date.now()}.wav`);
    const child = spawn(PIPER_EXE, ['-m', voiceOnnx, '-f', outWav], { windowsHide: true });
    child.stdin.write(text);
    child.stdin.end();
    const code = await new Promise((resolve) => {
        child.on('error', () => resolve(-1));
        child.on('close', resolve);
    });
    if (code !== 0 || !fs.existsSync(outWav)) {
        try { fs.unlinkSync(outWav); } catch { /* noop */ }
        return { ok: false, error: `piper salio con codigo ${code}` };
    }

    // Pitch shift opcional (voces agudas) — requiere ffmpeg/ffprobe.
    let finalWav = outWav;
    if (pitch !== 1 && FFMPEG_EXE() && FFPROBE_EXE()) {
        const pitched = outWav.replace(/\.wav$/, `-pitch.wav`);
        try {
            const rate = await new Promise((resolve) => {
                const p = spawn(FFPROBE_EXE(), ['-v', 'quiet', '-print_format', 'json', '-show_streams', outWav], { windowsHide: true });
                let buf = '';
                p.stdout.on('data', (d) => { buf += d.toString(); });
                p.on('close', () => {
                    try { resolve(Number(JSON.parse(buf)?.streams?.[0]?.sample_rate) || 22050); }
                    catch { resolve(22050); }
                });
                p.on('error', () => resolve(22050));
            });
            const f = spawn(FFMPEG_EXE(), ['-y', '-v', 'quiet', '-i', outWav,
                '-af', `asetrate=${rate}*${pitch},atempo=${1 / pitch}`, pitched], { windowsHide: true });
            const fcode = await new Promise((resolve) => { f.on('error', () => resolve(-1)); f.on('close', resolve); });
            if (fcode === 0 && fs.existsSync(pitched)) finalWav = pitched;
        } catch { /* sin pitch: se entrega el wav original */ }
    }

    try {
        const wav = fs.readFileSync(finalWav);
        for (const f of [outWav, finalWav]) { try { fs.unlinkSync(f); } catch { /* noop */ } }
        return { ok: true, wavBase64: wav.toString('base64') };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'no se pudo leer el audio' };
    }
});

/* ── Clonación de voz local (OpenVoice V2 + MeloTTS) ────────────────────
 * Motor Python en joy-ai-build/py (venv con torch CPU). La muestra de voz
 * del usuario se guarda en userData/clone-sample.* y nunca sale del equipo.
 * En producción el venv es pesado; por ahora corre desde la ruta de build.
 */
const OV_DIR = path.join(ENGINES_DIR, 'openvoice');
const PY_EXE = path.join(OV_DIR, 'python', 'Scripts', 'python.exe');
const OV_SCRIPT = path.join(OV_DIR, 'openvoice_tts.py');
const CLONE_SAMPLE_DIR = () => path.join(app.getPath('userData'), 'voz-clon');
const CLONE_SAMPLE_EXTS = new Set(['.wav', '.webm', '.ogg', '.mp3', '.m4a', '.flac']);

/** Guarda la muestra de voz del usuario (dataURL/base64) en userData. */
ipcMain.handle('speech:clone-sample-save', async (_event, payload) => {
    try {
        const ext = CLONE_SAMPLE_EXTS.has(String(payload?.ext ?? '').toLowerCase())
            ? String(payload.ext).toLowerCase() : '.wav';
        const b64 = String(payload?.dataBase64 ?? '');
        if (!b64 || b64.length < 1000) return { ok: false, error: 'muestra vacía o muy corta' };
        const dir = CLONE_SAMPLE_DIR();
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `muestra${ext}`);
        fs.writeFileSync(file, Buffer.from(b64, 'base64'));
        return { ok: true, path: file, size: fs.statSync(file).size };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'no se pudo guardar la muestra' };
    }
});

ipcMain.handle('speech:clone-sample-info', async () => {
    try {
        const dir = CLONE_SAMPLE_DIR();
        const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => CLONE_SAMPLE_EXTS.has(path.extname(f).toLowerCase())) : [];
        return { ok: true, samples: files.map((f) => ({ name: f, path: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size })) };
    } catch (err) {
        return { ok: false, error: 'no se pudo leer la carpeta de muestras' };
    }
});

/**
 * TTS con voz clonada: texto → MeloTTS ES → OpenVoice convierte al timbre
 * de la muestra guardada. Devuelve WAV en base64. Es pesado (CPU): puede
 * tardar decenas de segundos; el renderer debe mostrar "generando…".
 */
ipcMain.handle('speech:clone', async (_event, payload) => {
    const text = String(payload?.text ?? '').slice(0, 4000);
    const refPath = String(payload?.refPath ?? '');
    if (!text.trim()) return { ok: false, error: 'texto vacio' };
    if (!fs.existsSync(PY_EXE) || !fs.existsSync(OV_SCRIPT)) {
        return { ok: false, error: 'motor de clonación no instalado (engines/openvoice)' };
    }
    // La referencia debe estar dentro de la carpeta de muestras del usuario.
    const dir = CLONE_SAMPLE_DIR();
    let resolved = path.resolve(refPath || '');
    if (!refPath || !resolved.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(resolved)) {
        // Sin referencia válida: usar la primera muestra guardada.
        const samples = fs.existsSync(dir)
            ? fs.readdirSync(dir).filter((f) => CLONE_SAMPLE_EXTS.has(path.extname(f).toLowerCase()))
            : [];
        if (!samples.length) return { ok: false, error: 'no hay muestra de voz; graba o sube una en Apariencia → Voz' };
        resolved = path.join(dir, samples[0]);
    }
    const outWav = path.join(os.tmpdir(), `caro-clone-${Date.now()}.wav`);
    const r = await runProcess(PY_EXE, [OV_SCRIPT, '--text', text, '--ref', resolved, '--out', outWav], {
        cwd: OV_DIR,
        env: { ...process.env, HF_HOME: path.join(OV_DIR, 'hf-cache'), PYTHONIOENCODING: 'utf-8' },
    });
    if (r.code !== 0 || !fs.existsSync(outWav)) {
        try { fs.unlinkSync(outWav); } catch { /* noop */ }
        return { ok: false, error: (r.stderr || r.stdout || 'error del motor de clonación').slice(-400) };
    }
    try {
        const wav = fs.readFileSync(outWav);
        fs.unlinkSync(outWav);
        return { ok: true, wavBase64: wav.toString('base64') };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'no se pudo leer el audio' };
    }
});

/** STT local con whisper.cpp: recibe WAV en base64, devuelve el texto. */
ipcMain.handle('speech:stt', async (_event, payload) => {
    const wavBase64 = String(payload?.wavBase64 ?? '');
    const lang = String(payload?.lang ?? 'es');
    if (!wavBase64) return { ok: false, error: 'audio vacio' };
    if (!fs.existsSync(WHISPER_CLI) || !fs.existsSync(WHISPER_MODEL)) {
        return { ok: false, error: 'whisper no instalado' };
    }

    const inWav = path.join(os.tmpdir(), `caro-stt-${Date.now()}.wav`);
    try {
        fs.writeFileSync(inWav, Buffer.from(wavBase64, 'base64'));
        const r = await runProcess(WHISPER_CLI, [
            '-m', WHISPER_MODEL,
            '-f', inWav,
            '-l', lang,
            '-nt',   // sin timestamps
            '-np',   // sin prints extra
        ]);
        const text = r.stdout.replace(/\[.*?\]/g, '').trim();
        if (r.code !== 0) return { ok: false, error: r.stderr.slice(0, 200) || `whisper salio con codigo ${r.code}` };
        return { ok: true, text };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'error de transcripcion' };
    } finally {
        try { fs.unlinkSync(inWav); } catch { /* noop */ }
    }
});

/* ── SSH a dispositivos propios (módulo Dispositivos) ────────────────────
 * Usa el cliente OpenSSH del sistema (Windows 10+ lo incluye). BatchMode
 * evita que se quede esperando contraseña interactiva: si no hay llave
 * configurada falla rápido con mensaje claro. El usuario decide host/usuario.
 */
const SSH_HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,252}$/;
const SSH_USER_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_.\-]{0,31}$/;

/* Solo las ventanas propias de CaRo Ai (principal + isla) pueden invocar
 * acciones sensibles. Un webview/secuestrador que lograra window.joyai desde
 * otro webContents queda bloqueado aquí, no solo en el renderer. */
function trustedSender(event) {
    const wc = event?.sender;
    return wc === mainWindow?.webContents || wc === islandWindow?.webContents;
}
const untrusted = { ok: false, error: 'IPC no autorizado: origen no permitido' };

ipcMain.handle('device:ssh', async (event, payload) => {
    if (!trustedSender(event)) return untrusted;
    const host = String(payload?.host ?? '').trim();
    const user = String(payload?.user ?? '').trim();
    const port = Number(payload?.port) || 22;
    const command = String(payload?.command ?? '').slice(0, 2000);
    if (!SSH_HOST_RE.test(host) || host.includes('..')) return { ok: false, error: 'host inválido' };
    if (!SSH_USER_RE.test(user)) return { ok: false, error: 'usuario inválido' };
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'puerto inválido' };
    if (!command.trim()) return { ok: false, error: 'comando vacío' };

    const args = [
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=10',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-p', String(port),
        `${user}@${host}`,
        command,
    ];
    const r = await runProcess('ssh', args);
    if (r.code !== 0) {
        const detail = (r.stderr || r.stdout || '').trim().slice(-400);
        return { ok: false, error: detail || `ssh salió con código ${r.code}` };
    }
    return { ok: true, output: r.stdout.trim(), stderr: r.stderr.trim().slice(-400) };
});

/* ── Edición de media con FFmpeg local ──────────────────────────────────
 * Solo presets cerrados (nada de argumentos libres del renderer).
 * Entrada: ruta absoluta elegida con diálogo nativo. Salida: Documentos/
 * CaRoAi-Salidas/<nombre>.<ext>; al terminar se abre la carpeta.
 */
const MEDIA_PRESETS = {
    mp3: { ext: 'mp3', args: ['-vn', '-codec:a', 'libmp3lame', '-q:a', '2'] },
    wav: { ext: 'wav', args: ['-vn', '-codec:a', 'pcm_s16le'] },
    m4a: { ext: 'm4a', args: ['-vn', '-codec:a', 'aac', '-b:a', '192k'] },
    mp4: { ext: 'mp4', args: ['-codec:v', 'libx264', '-crf', '26', '-preset', 'veryfast', '-codec:a', 'aac', '-b:a', '128k'] },
    compress: { ext: 'mp4', args: ['-codec:v', 'libx264', '-crf', '32', '-preset', 'veryfast', '-codec:a', 'aac', '-b:a', '96k'] },
};

/* Presets de imagen/foto con ffmpeg (filtros -vf, salida -frames:v 1).
 * Edición real local: redimensionar, convertir formato y filtros. */
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff']);
const IMAGE_PRESETS = {
    resize1080: { ext: 'jpg', args: ['-vf', 'scale=1920:-2', '-q:v', '2', '-frames:v', '1'] },
    resize720: { ext: 'jpg', args: ['-vf', 'scale=1280:-2', '-q:v', '2', '-frames:v', '1'] },
    png: { ext: 'png', args: ['-frames:v', '1'] },
    webp: { ext: 'webp', args: ['-frames:v', '1', '-quality', '85'] },
    grayscale: { ext: 'png', args: ['-vf', 'format=gray', '-frames:v', '1'] },
    sepia: { ext: 'jpg', args: ['-vf', 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131', '-q:v', '2', '-frames:v', '1'] },
    blur: { ext: 'jpg', args: ['-vf', 'boxblur=6:2', '-q:v', '3', '-frames:v', '1'] },
    sharpen: { ext: 'jpg', args: ['-vf', 'unsharp=5:5:1.0:5:5:0.0', '-q:v', '2', '-frames:v', '1'] },
    rotate90: { ext: 'jpg', args: ['-vf', 'transpose=1', '-q:v', '2', '-frames:v', '1'] },
    rotate270: { ext: 'jpg', args: ['-vf', 'transpose=2', '-q:v', '2', '-frames:v', '1'] },
};

ipcMain.handle('media:status', async () => ({
    ffmpeg: !!FFMPEG_EXE(),
    ffprobe: !!FFPROBE_EXE(),
}));

/** Diálogo nativo para elegir archivo de media → devuelve ruta absoluta. */
ipcMain.handle('media:pick', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
        title: 'Elegir archivo multimedia',
        properties: ['openFile'],
        filters: [{ name: 'Media', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'jpg', 'jpeg', 'png', 'webp'] }],
    });
    return { ok: !r.canceled && r.filePaths.length > 0, path: r.filePaths[0] ?? null };
});

/** Info del archivo con ffprobe (duración, codecs, resolución). */
ipcMain.handle('media:probe', async (_event, payload) => {
    const ffprobe = FFPROBE_EXE();
    const file = typeof payload?.path === 'string' ? payload.path : '';
    if (!ffprobe) return { ok: false, error: 'ffprobe no instalado' };
    if (!file || !fs.existsSync(file)) return { ok: false, error: 'archivo no encontrado' };
    const r = await runProcess(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
    if (r.code !== 0) return { ok: false, error: r.stderr.slice(0, 300) || 'ffprobe falló' };
    try {
        const j = JSON.parse(r.stdout);
        const vs = (j.streams ?? []).find((s) => s.codec_type === 'video');
        const au = (j.streams ?? []).find((s) => s.codec_type === 'audio');
        return {
            ok: true,
            info: {
                duration: Number(j.format?.duration ?? 0),
                size: Number(j.format?.size ?? 0),
                format: j.format?.format_name ?? '',
                video: vs ? { codec: vs.codec_name, width: vs.width, height: vs.height } : null,
                audio: au ? { codec: au.codec_name, sampleRate: au.sample_rate, channels: au.channels } : null,
            },
        };
    } catch {
        return { ok: false, error: 'no se pudo interpretar la salida de ffprobe' };
    }
});

/** Convierte con preset cerrado. Devuelve la ruta del archivo generado. */
ipcMain.handle('media:convert', async (_event, payload) => {
    if (!trustedSender(_event)) return untrusted;
    const ffmpeg = FFMPEG_EXE();
    const file = typeof payload?.path === 'string' ? payload.path : '';
    const preset = MEDIA_PRESETS[String(payload?.preset ?? '')] ?? IMAGE_PRESETS[String(payload?.preset ?? '')];
    if (!ffmpeg) return { ok: false, error: 'ffmpeg no instalado' };
    if (!preset) return { ok: false, error: 'preset no válido' };
    if (!file || !fs.existsSync(file)) return { ok: false, error: 'archivo no encontrado' };

    const outDir = MEDIA_OUT_DIR();
    fs.mkdirSync(outDir, { recursive: true });
    const base = path.basename(file, path.extname(file)).replace(/[^\wáéíóúñ .()-]/gi, '_').slice(0, 80) || 'salida';
    let outPath = path.join(outDir, `${base}.${preset.ext}`);
    let i = 1;
    while (fs.existsSync(outPath)) { outPath = path.join(outDir, `${base}-${i++}.${preset.ext}`); }

    // Para presets de audio sobre video: -vn; si el archivo es imagen, el preset mp4 no aplica.
    // -update 1: escribe una sola imagen sin pedir patrón %03d (salida .jpg/.png).
    const isImage = IMAGE_EXTS.has(path.extname(file).toLowerCase());
    const args = ['-y', '-i', file, ...preset.args, ...(isImage ? ['-update', '1'] : []), outPath];
    const r = await runProcess(ffmpeg, args);
    if (r.code !== 0 || !fs.existsSync(outPath)) {
        return { ok: false, error: (r.stderr || r.stdout || 'ffmpeg falló').slice(-400) };
    }
    shell.showItemInFolder(outPath);
    return { ok: true, outputPath: outPath };
});

/**
 * Almacen de secretos cifrado con safeStorage (DPAPI en Windows,
 * Keychain en macOS). Archivo JSON en userData; cada valor va cifrado
 * en base64. Las claves viajan cifradas; el renderer solo ve texto plano
 * en memoria mientras la app esta abierta.
 */
const SECRETS_FILE = () => path.join(app.getPath('userData'), 'caroai-secrets.json');

function readSecretsStore() {
    try { return JSON.parse(fs.readFileSync(SECRETS_FILE(), 'utf8')); }
    catch { return {}; }
}

function writeSecretsStore(map) {
    fs.writeFileSync(SECRETS_FILE(), JSON.stringify(map), 'utf8');
}

ipcMain.handle('secrets:save', async (_event, payload) => {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return { ok: false, error: 'cifrado no disponible en este SO' };
    const entries = payload?.entries && typeof payload.entries === 'object' ? payload.entries : {};
    const store = readSecretsStore();
    for (const [k, v] of Object.entries(entries)) {
        if (typeof v === 'string' && v.length > 0) {
            store[k] = (await safeStorage.encryptStringAsync(v)).toString('base64');
        } else {
            delete store[k];
        }
    }
    try {
        writeSecretsStore(store);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'no se pudo guardar' };
    }
});

ipcMain.handle('secrets:load', async () => {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return {};
    const store = readSecretsStore();
    const out = {};
    for (const [k, v] of Object.entries(store)) {
        try { out[k] = (await safeStorage.decryptStringAsync(Buffer.from(String(v), 'base64'))).result; }
        catch { /* valor corrupto: se omite */ }
    }
    return out;
});

/** Borra la sesion (cookies/storage) de una particion del navegador integrado. */
ipcMain.handle('session:clear', async (_event, payload) => {
    const partition = String(payload?.partition ?? '');
    // Solo particiones propias de CaRo Ai; nunca tocar persist:default.
    if (!partition.startsWith('persist:caro-')) return { ok: false, error: 'particion no permitida' };
    try {
        const ses = session.fromPartition(partition);
        await ses.clearStorageData();
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'error' };
    }
});

ipcMain.handle('ai:request', async (_event, payload) => {
    try {
        return await handleAiRequest(payload ?? {});
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'error inesperado' };
    }
});

/**
 * Consola del modulo Terminal: ejecuta un comando en el shell del usuario.
 * Es la maquina del propio usuario (como una terminal normal). Limites:
 * timeout 15 s y salida truncada a 64 KB para no colgar la UI.
 */
ipcMain.handle('shell:exec', async (_event, payload) => {
    if (!trustedSender(_event)) return untrusted;
    const command = typeof payload?.command === 'string' ? payload.command.slice(0, 2000) : '';
    if (!command.trim()) return { ok: false, error: 'comando vacío' };
    const isWin = process.platform === 'win32';
    const shellCmd = isWin ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-c', command];
    return new Promise((resolve) => {
        let out = '';
        const child = spawn(shellCmd, shellArgs, { windowsHide: true });
        const timer = setTimeout(() => {
            child.kill();
            resolve({ ok: false, output: out.slice(-60000), error: 'Tiempo agotado (15 s).' });
        }, 15000);
        const push = (d) => { out = (out + d.toString()).slice(-65536); };
        child.stdout.on('data', push);
        child.stderr.on('data', push);
        child.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, error: err.message }); });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ ok: code === 0, output: out || '(sin salida)', code });
        });
    });
});

/**
 * Captura de pantalla de la ventana de CaRo Ai (visión del agente, #10/#13).
 * Guarda un PNG con marca de tiempo en Documentos/CaRoAi-Capturas y
 * devuelve la ruta. El agente puede adjuntarla a un modelo multimodal
 * o el usuario abrirla. Requiere permiso 'screen' a nivel app.
 */
ipcMain.handle('screen:shot', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: 'ventana no disponible' };
    try {
        const img = await mainWindow.webContents.capturePage();
        if (img.isEmpty()) return { ok: false, error: 'captura vacía' };
        const dir = path.join(app.getPath('documents'), 'CaRoAi-Capturas');
        fs.mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const file = path.join(dir, `captura-${stamp}.png`);
        fs.writeFileSync(file, img.toPNG());
        return { ok: true, path: file };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'falló la captura' };
    }
});

/* ===== Control del SO: mouse y teclado (nut.js) =====
 * Control REAL del cursor y teclado del equipo del usuario — como una
 * macro/automatización local. El renderer lo llama solo tras el permiso
 * 'control' de CaRo Ai y cada acción es una llamada IPC explícita.
 * En iOS/Android no aplica (sin escritorio). */
let nutLib = null;
function getNut() {
    if (nutLib !== null) return nutLib;
    if (process.platform === 'android' || process.platform === 'ios') { nutLib = false; return null; }
    try { nutLib = require('@nut-tree-fork/nut-js'); return nutLib; }
    catch (err) { console.warn('[control] nut.js no cargó:', err?.message); nutLib = false; return null; }
}

ipcMain.handle('control:status', async () => {
    const n = getNut();
    if (!n) return { ok: false, error: 'control no disponible en esta plataforma' };
    try {
        const pos = await n.mouse.getPosition();
        const w = await n.screen.width();
        const h = await n.screen.height();
        return { ok: true, x: pos.x, y: pos.y, w, h };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'error' };
    }
});

ipcMain.handle('control:mouseMove', async (_e, p) => {
    if (!trustedSender(_e)) return untrusted;
    const n = getNut();
    if (!n) return { ok: false, error: 'no disponible' };
    const x = Math.round(Number(p?.x)), y = Math.round(Number(p?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 100000 || Math.abs(y) > 100000) return { ok: false, error: 'coordenadas inválidas' };
    try { await n.mouse.setPosition(new n.Point(x, y)); return { ok: true }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'error' }; }
});

ipcMain.handle('control:mouseClick', async (_e, p) => {
    if (!trustedSender(_e)) return untrusted;
    const n = getNut();
    if (!n) return { ok: false, error: 'no disponible' };
    const btn = p?.button === 'right' ? n.Button.RIGHT : p?.button === 'middle' ? n.Button.MIDDLE : n.Button.LEFT;
    try { await n.mouse.click(btn); return { ok: true }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'error' }; }
});

ipcMain.handle('control:type', async (_e, p) => {
    if (!trustedSender(_e)) return untrusted;
    const n = getNut();
    if (!n) return { ok: false, error: 'no disponible' };
    const text = String(p?.text ?? '').slice(0, 2000);
    if (!text) return { ok: false, error: 'texto vacío' };
    try { await n.keyboard.type(text); return { ok: true }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'error' }; }
});

ipcMain.handle('control:key', async (_e, p) => {
    if (!trustedSender(_e)) return untrusted;
    const n = getNut();
    if (!n) return { ok: false, error: 'no disponible' };
    const keyName = String(p?.key ?? '').toUpperCase();
    const key = n.Key[keyName];
    if (!key) return { ok: false, error: `tecla desconocida: ${keyName}` };
    try { await n.keyboard.pressKey(key); await n.keyboard.releaseKey(key); return { ok: true }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'error' }; }
});

/**
 * Descarga un modelo en el servidor local del usuario. SOLO permite
 * `ollama pull <modelo>`: el nombre se valida con regex estricto para que
 * el renderer no pueda ejecutar comandos arbitrarios.
 */
ipcMain.handle('engine:pull', async (_event, payload) => {
    const model = typeof payload?.model === 'string' ? payload.model.trim() : '';
    const engineId = typeof payload?.engineId === 'string' ? payload.engineId : '';
    if (engineId !== 'ollama') return { ok: false, error: 'Solo Ollama permite descarga desde la app.' };
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(model)) {
        return { ok: false, error: 'Nombre de modelo inválido.' };
    }
    return new Promise((resolve) => {
        let out = '';
        const child = spawn('ollama', ['pull', model], { windowsHide: true });
        const sendProgress = (chunk) => {
            try { mainWindow?.webContents.send('engine:pull-progress', { model, chunk: String(chunk) }); } catch { /* ventana cerrada */ }
        };
        const timer = setTimeout(() => { child.kill(); resolve({ ok: false, error: 'Tiempo de descarga agotado (10 min).' }); }, 10 * 60 * 1000);
        child.stdout.on('data', (d) => { out = (out + d.toString()).slice(-4000); sendProgress(d); });
        child.stderr.on('data', (d) => { out = (out + d.toString()).slice(-4000); sendProgress(d); });
        child.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, error: `No se pudo ejecutar ollama: ${err.message}` }); });
        child.on('close', (code) => {
            clearTimeout(timer);
            const ok = code === 0;
            // Evento global: la descarga corre en el proceso principal, así que
            // sigue aunque el usuario cambie de módulo. Avisamos a la UI.
            try { mainWindow?.webContents.send('engine:pull-done', { model, ok }); } catch { /* noop */ }
            const tail = out.trim().split('\n').slice(-3).join(' | ');
            resolve(ok ? { ok: true, output: tail || 'completado' } : { ok: false, error: tail || `ollama salió con código ${code}` });
        });
    });
});

/* ── Conectores reales (API allowlist) ──────────────────────────────────
 * El renderer pide rutas concretas; el main solo permite GET a hosts
 * conocidos y adjunta el token del usuario. Sin hosts arbitrarios →
 * no hay SSRF ni exfiltración de tokens a dominios ajenos.
 */
const CONNECTOR_HOSTS = {
    github: 'https://api.github.com',
    gitlab: 'https://gitlab.com/api/v4',
    hf: 'https://huggingface.co/api',
    telegram: 'https://api.telegram.org',
    discord: 'https://discord.com/api/v10',
    x: 'https://api.twitter.com',
};

ipcMain.handle('connector:api', async (_event, payload) => {
    const service = String(payload?.service ?? '');
    const base = CONNECTOR_HOSTS[service];
    const path = typeof payload?.path === 'string' ? payload.path : '';
    const token = typeof payload?.token === 'string' ? payload.token.slice(0, 500) : '';
    if (!base) return { ok: false, error: 'servicio no permitido' };
    // Solo rutas relativas simples: sin '..', sin '//', sin query rara.
    if (!/^\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#[\]]+$/.test(path) || path.includes('..')) {
        return { ok: false, error: 'ruta inválida' };
    }
    const headers = { 'user-agent': 'CaRoAi/1.0', accept: 'application/json' };
    if (service === 'gitlab') headers['private-token'] = token;
    else if (service === 'discord' && token) headers.authorization = `Bot ${token}`;
    else if (service !== 'telegram' && token) headers.authorization = `Bearer ${token}`;
    try {
        const res = await fetch(base + path, { headers, signal: AbortSignal.timeout(10000) });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* respuesta no-JSON */ }
        return { ok: res.ok, status: res.status, json, text: res.ok ? undefined : text.slice(0, 500) };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'falló la conexión' };
    }
});

/* ── Pantalla de proyección (LAN, sin nube) ─────────────────────────────
 * Quien comparte pantalla levanta un HTTP en 0.0.0.0:<puerto>. El renderer
 * envía frames JPEG por POST /frame SOLO desde loopback (127.0.0.1); los
 * clientes LAN solo pueden GET /info y GET /frame con el código de vínculo.
 * Nada sale de la red local del usuario.
 */
const SHARE_PORT = 47823;
let shareServer = null;
let shareState = { code: '', name: '', lastFrame: null, sharing: false };

/** Carpeta de intercambio: Documents/CaRoAi-Compartido (visible para el usuario). */
function shareDir() {
    return path.join(app.getPath('documents'), 'CaRoAi-Compartido');
}

function lanIps() {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
        for (const ni of list ?? []) {
            if (ni.family === 'IPv4' && !ni.internal) out.push({ name, address: ni.address });
        }
    }
    return out;
}

ipcMain.handle('link:share-status', () => ({
    sharing: shareState.sharing,
    port: SHARE_PORT,
    ips: lanIps(),
    code: shareState.code,
}));

ipcMain.handle('link:share-start', (_e, payload) => {
    const code = typeof payload?.code === 'string' ? payload.code : '';
    const name = typeof payload?.name === 'string' ? payload.name.slice(0, 40) : os.hostname();
    shareState.code = code;
    shareState.name = name;
    shareState.sharing = true;
    shareState.lastFrame = null;
    if (shareServer) return { ok: true, port: SHARE_PORT, ips: lanIps() };

    shareServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        const remote = req.socket.remoteAddress ?? '';
        const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
        const authCode = url.searchParams.get('code') ?? req.headers['x-link-code'] ?? '';

        if (url.pathname === '/info' && req.method === 'GET') {
            // /info también exige el código: sin él un equipo de la LAN podría
            // sondear nombre/plataforma del host sin autorización.
            if (!shareState.code || authCode !== shareState.code) { res.writeHead(403); res.end(); return; }
            res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
            res.end(JSON.stringify({ name: shareState.name, platform: process.platform, sharing: shareState.sharing }));
            return;
        }
        if (url.pathname === '/frame' && req.method === 'GET') {
            // El código debe existir Y coincidir: antes, código vacío + sin
            // parámetro pasaba la comparación ('' === '') y abría los frames.
            if (!shareState.sharing || !shareState.code || authCode !== shareState.code) { res.writeHead(403); res.end(); return; }
            if (!shareState.lastFrame) { res.writeHead(204); res.end(); return; }
            res.writeHead(200, { 'content-type': 'image/jpeg', 'access-control-allow-origin': '*' });
            res.end(shareState.lastFrame);
            return;
        }
        if (url.pathname === '/frame' && req.method === 'POST') {
            // Solo el renderer local puede subir frames (anti-inyección LAN).
            if (!isLoopback) { res.writeHead(403); res.end(); return; }
            const chunks = [];
            req.on('data', (c) => { chunks.push(c); if (Buffer.concat(chunks).length > 400000) req.destroy(); });
            req.on('end', () => {
                const buf = Buffer.concat(chunks);
                if (buf.length > 500 && buf.length < 400000) shareState.lastFrame = buf;
                res.writeHead(204, { 'access-control-allow-origin': '*' });
                res.end();
            });
            return;
        }
        // ── Transferencia de archivos (solo con código de vínculo) ──
        if (url.pathname === '/files' && req.method === 'GET') {
            if (authCode !== shareState.code || !shareState.code) { res.writeHead(403); res.end(); return; }
            const dir = shareDir();
            let names = [];
            try { names = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()); } catch { /* carpeta aún no existe */ }
            res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
            res.end(JSON.stringify({ dir, files: names.map((n) => ({ name: n, size: fs.statSync(path.join(dir, n)).size, mtime: fs.statSync(path.join(dir, n)).mtimeMs })) }));
            return;
        }
        if (url.pathname === '/file' && req.method === 'GET') {
            if (authCode !== shareState.code || !shareState.code) { res.writeHead(403); res.end(); return; }
            const name = path.basename(url.searchParams.get('name') ?? '');
            const fp = path.join(shareDir(), name);
            if (!name || !fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${name}"`, 'access-control-allow-origin': '*' });
            fs.createReadStream(fp).pipe(res);
            return;
        }
        if (url.pathname === '/file' && req.method === 'POST') {
            if (authCode !== shareState.code || !shareState.code) { res.writeHead(403); res.end(); return; }
            const name = path.basename(url.searchParams.get('name') ?? '');
            if (!name || name.length > 120) { res.writeHead(400); res.end(); return; }
            const chunks = [];
            req.on('data', (c) => { chunks.push(c); if (Buffer.concat(chunks).length > 200 * 1024 * 1024) req.destroy(); });
            req.on('end', () => {
                try {
                    const dir = shareDir();
                    fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
                    res.writeHead(204, { 'access-control-allow-origin': '*' });
                } catch { res.writeHead(500); }
                res.end();
            });
            return;
        }
        res.writeHead(404); res.end();
    });

    shareServer.on('error', () => { shareServer = null; shareState.sharing = false; });
    shareServer.listen(SHARE_PORT, '0.0.0.0');
    return { ok: true, port: SHARE_PORT, ips: lanIps() };
});

ipcMain.handle('link:share-stop', () => {
    shareState.sharing = false;
    shareState.lastFrame = null;
    if (shareServer) { shareServer.close(); shareServer = null; }
    return { ok: true };
});

/* ── Escaneo de modelos sueltos en el equipo ────────────────────────────
 * Busca archivos .gguf/.safetensors/.bin en carpetas del usuario. Solo
 * lectura; nada se mueve ni se sube. Sirve para que el usuario vea qué
 * modelos ya tiene y pueda apuntar un servidor local a ellos.
 */
const MODEL_EXTS = new Set(['.gguf', '.safetensors', '.bin']);
const SCAN_MAX_DEPTH = 4;
const SCAN_MAX_RESULTS = 200;

function scanDirForModels(root, depth, out) {
    if (out.length >= SCAN_MAX_RESULTS || depth > SCAN_MAX_DEPTH) return;
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        if (out.length >= SCAN_MAX_RESULTS) return;
        const fp = path.join(root, e.name);
        if (e.isDirectory()) {
            // Saltar carpetas pesadas/irrelevantes.
            const skip = new Set(['node_modules', '.git', 'AppData', '$Recycle.Bin', 'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData']);
            if (!skip.has(e.name)) scanDirForModels(fp, depth + 1, out);
        } else if (e.isFile()) {
            const ext = path.extname(e.name).toLowerCase();
            if (MODEL_EXTS.has(ext)) {
                try {
                    const st = fs.statSync(fp);
                    if (st.size > 50 * 1024 * 1024) { // >50MB: probablemente un modelo real
                        out.push({ path: fp, name: e.name, size: st.size, ext });
                    }
                } catch { /* noop */ }
            }
        }
    }
}

ipcMain.handle('models:scan', async (_event, payload) => {
    const custom = typeof payload?.dir === 'string' && payload.dir.trim() ? payload.dir.trim() : null;
    const home = app.getPath('home');
    const roots = custom ? [custom] : [
        path.join(home, 'Documents'),
        path.join(home, 'Downloads'),
        path.join(home, 'Desktop'),
        path.join(home, 'Models'),
        path.join(home, '.cache', 'lm-studio'),
        path.join(home, '.lmstudio'),
    ];
    const results = [];
    for (const r of roots) {
        if (fs.existsSync(r)) scanDirForModels(r, 0, results);
        if (results.length >= SCAN_MAX_RESULTS) break;
    }
    return { ok: true, count: results.length, truncated: results.length >= SCAN_MAX_RESULTS, models: results };
});

/* ── Acciones del agente sobre el SO del usuario ────────────────────────
 * El agente puede abrir apps, carpetas, archivos y URLs DEL USUARIO.
 * Nada destructivo: solo 'open' (equivalente a doble clic del usuario).
 */
/* ── Inventario de aplicaciones instaladas ────────────────────────────────
 * El agente debe conocer qué apps tiene la máquina SIN que el usuario se las
 * enseñe en cada conversación. En Windows se lee el registro de
 * desinstalación (DisplayName + DisplayIcon + InstallLocation) una vez y se
 * cachea 10 min. El icono suele ser "C:\...\app.exe",0 — se limpia y se
 * valida con fs.existsSync antes de abrir.
 */
let installedAppsCache = { at: 0, apps: [] };
const APP_SCAN_TTL = 10 * 60 * 1000;
// Ruido típico del registro que no es "aplicación abrible".
const APP_JUNK_RE = /knowledge\s*base|update for|security update|hotfix|redistributable|visual c\+\+|\.net (framework|core)|driver|driver update|security essentials|definition update|malwarebytes|intel\(r\)|nvidia (graphics|app)|realtek|windows sdk|application verifier|desktop runtime/i;

async function scanInstalledApps() {
    if (process.platform !== 'win32') return installedAppsCache.apps;
    if (installedAppsCache.apps.length && Date.now() - installedAppsCache.at < APP_SCAN_TTL) {
        return installedAppsCache.apps;
    }
    const ps = [
        "Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
        "'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
        "'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
        '-ErrorAction SilentlyContinue |',
        "Where-Object { $_.DisplayName -and -not $_.SystemComponent } |",
        'Select-Object DisplayName,DisplayIcon,InstallLocation |',
        'ConvertTo-Json -Compress -Depth 2',
    ].join(' ');
    const r = await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    let regApps = [];
    if (r.code === 0 && r.stdout.trim()) {
        try {
            let parsed = JSON.parse(r.stdout);
            if (!Array.isArray(parsed)) parsed = [parsed];
            regApps = parsed
                .filter((a) => a?.DisplayName && !APP_JUNK_RE.test(String(a.DisplayName)))
                .map((a) => ({
                    name: String(a.DisplayName).trim(),
                    icon: a.DisplayIcon ? String(a.DisplayIcon).trim() : '',
                    location: a.InstallLocation ? String(a.InstallLocation).trim() : '',
                }))
                .filter((a) => a.name.length >= 3);
        } catch { /* JSON inesperado: seguimos solo con accesos directos */ }
    }
    // Fusiona registro + accesos directos del menú Inicio, sin duplicar por nombre.
    const seen = new Set();
    const merged = [...regApps, ...scanStartMenuShortcuts()].filter((a) => {
        const key = normAppName(a.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    if (merged.length) installedAppsCache = { at: Date.now(), apps: merged };
    return installedAppsCache.apps;
}

/* Segunda fuente: accesos directos del menú Inicio (*.lnk). Atrapa apps
 * portables y de Microsoft Store que no dejan entrada en Uninstall.
 * El .lnk se puede abrir directo con shell.openPath (Windows lo ejecuta). */
function scanStartMenuShortcuts() {
    if (process.platform !== 'win32') return [];
    const roots = [
        path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
        path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    ];
    const out = [];
    const walk = (dir, depth) => {
        if (depth > 4) return;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p, depth + 1); continue; }
            if (!/\.lnk$/i.test(e.name)) continue;
            const base = e.name.replace(/\.lnk$/i, '').trim();
            if (base.length < 3 || APP_JUNK_RE.test(base) || /uninstall|desinstalar|readme|how to|sitio web|website|documentation|ayuda|help/i.test(base)) continue;
            out.push({ name: base, icon: p, location: '' });
        }
    };
    for (const r of roots) walk(r, 0);
    return out;
}

function normAppName(s) {
    return String(s ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Extrae la ruta .exe de un DisplayIcon: '"C:\app.exe",0' → 'C:\app.exe'.
function exeFromIcon(icon) {
    if (!icon) return null;
    let p = icon.split(',')[0].trim().replace(/^"|"$/g, '');
    if (!/\.exe$/i.test(p) && !/^[a-z]:[\\/]/i.test(p)) return null;
    try { p = p.replace(/%[^%]+%/g, (m) => process.env[m.slice(1, -1)] ?? m); } catch { /* noop */ }
    return fs.existsSync(p) ? p : null;
}

// Busca una app instalada por nombre difuso → devuelve ruta .exe real o null.
async function findInstalledExe(query) {
    const q = normAppName(query);
    if (!q) return null;
    const apps = await scanInstalledApps();
    const scored = apps
        .map((a) => {
            const n = normAppName(a.name);
            let score = 0;
            if (n === q) score = 100;
            else if (n.includes(q) || q.includes(n)) score = 60;
            else {
                const qTokens = q.split(' ').filter((w) => w.length > 2);
                const hits = qTokens.filter((w) => n.includes(w)).length;
                if (hits >= Math.min(2, qTokens.length) && hits > 0) score = 30 + hits * 10;
            }
            return { a, score };
        })
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score);
    for (const { a } of scored.slice(0, 8)) {
        const exe = exeFromIcon(a.icon);
        if (exe) return exe;
        // Respaldo: InstallLocation + primer .exe visible.
        if (a.location && fs.existsSync(a.location)) {
            try {
                const found = fs.readdirSync(a.location).find((f) => /\.exe$/i.test(f) && !/unins|setup|update|helper|crash/i.test(f));
                if (found) {
                    const p = path.join(a.location, found);
                    if (fs.existsSync(p)) return p;
                }
            } catch { /* noop */ }
        }
    }
    return null;
}

ipcMain.handle('system:apps', async () => {
    const apps = await scanInstalledApps();
    return apps.map((a) => ({ name: a.name }));
});

ipcMain.handle('os:open', async (_event, payload) => {
    if (!trustedSender(_event)) return untrusted;
    const type = String(payload?.type ?? '');
    const target = String(payload?.target ?? '').slice(0, 1000).trim();
    if (!target) return { ok: false, error: 'objetivo vacío' };
    try {
        if (type === 'url') {
            if (!/^https?:\/\//i.test(target)) return { ok: false, error: 'URL inválida' };
            await shell.openExternal(target);
        } else if (type === 'path') {
            // Rutas absolutas o '~/carpeta' (= carpeta personal del usuario).
            const expanded = target.startsWith('~/') || target === '~'
                ? path.join(os.homedir(), target.slice(1))
                : target;
            if (!path.isAbsolute(expanded)) return { ok: false, error: 'se requiere ruta absoluta' };
            const err = await shell.openPath(expanded);
            if (err) return { ok: false, error: err };
        } else if (type === 'app') {
            // Nombres especiales: la propia app o carpetas del sistema.
            const lower = target.toLowerCase();
            if (['caro ai', 'caroai', 'caro', 'esta app', 'la app', 'joy ai', 'joi'].includes(lower)) {
                const appDir = app.isPackaged ? path.dirname(process.execPath) : app.getAppPath();
                const err = await shell.openPath(appDir);
                if (err) return { ok: false, error: err };
                return { ok: true };
            }
            // Alias de apps comunes: el modelo escribe "navegador brave" o
            // "el bloc de notas" y aqui se resuelve al ejecutable real.
            // Sin alias, 'start' acepta el nombre tal cual (App Paths de Windows).
            const APP_ALIASES = {
                'navegador': 'chrome', 'browser': 'chrome', 'google': 'chrome', 'google chrome': 'chrome', 'chrome': 'chrome',
                'brave': 'brave', 'brave browser': 'brave', 'navegador brave': 'brave',
                'edge': 'msedge', 'microsoft edge': 'msedge', 'navegador edge': 'msedge',
                'firefox': 'firefox', 'mozilla': 'firefox', 'navegador firefox': 'firefox',
                'opera': 'opera', 'vivaldi': 'vivaldi', 'navegador opera': 'opera',
                'explorador': 'explorer', 'explorador de archivos': 'explorer', 'examinador': 'explorer', 'files': 'explorer',
                'bloc de notas': 'notepad', 'notepad': 'notepad', 'editor': 'notepad',
                'calculadora': 'calc', 'calc': 'calc', 'calculator': 'calc',
                'configuracion': 'ms-settings:', 'configuración': 'ms-settings:', 'settings': 'ms-settings:', 'ajustes': 'ms-settings:',
                'spotify': 'spotify', 'whatsapp': 'whatsapp', 'telegram': 'telegram', 'discord': 'discord',
                'visual studio code': 'code', 'vscode': 'code', 'vs code': 'code', 'code': 'code',
                'steam': 'steam', 'epic games': 'epicgameslauncher', 'epic': 'epicgameslauncher',
                'paint': 'mspaint', 'paint 3d': 'paint3d', 'wordpad': 'write', 'word': 'winword', 'excel': 'excel', 'powerpoint': 'powerpnt',
                'terminal': 'wt', 'powershell': 'powershell', 'cmd': 'cmd', 'símbolo del sistema': 'cmd',
                'administrador de tareas': 'taskmgr', 'task manager': 'taskmgr', 'administrador de tareas': 'taskmgr',
                'reproductor de fotos': 'photos', 'fotos': 'photos', 'photos': 'photos', 'movies': 'movies', 'peliculas': 'movies',
                'correo': 'outlook', 'outlook': 'outlook', 'gmail': 'chrome',
                'navegador de escritorio': 'chrome', 'navegador del sistema': 'chrome',
                'navegador predeterminado': 'chrome', 'mi navegador': 'chrome',
                'navegador web': 'chrome', 'internet': 'chrome',
            };
            // Limpieza: quita palabras de relleno que el modelo agrega.
            let cleaned = lower
                .normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/\b(la app|el programa|la aplicación|app|aplicación|programa|por favor|abre|abrir|ábreme|inicia|ejecuta|lanza|open|el|la|los|las|de|del|mi|mis)\b/g, ' ')
                .replace(/\s+/g, ' ').trim();
            if (!cleaned) return { ok: false, error: 'no identifiqué qué aplicación abrir' };
            const tryAlias = (s) => APP_ALIASES[s] ?? APP_ALIASES[s.replace(/\s+/g, '')];
            const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
            let resolved = tryAlias(cleaned);
            if (!resolved) {
                // "navegador de google" → quita el prefijo genérico y reintenta.
                const stripped = cleaned.replace(/^(navegador|browser|navegador de|browser de|el navegador|el browser)\s+/, '');
                if (stripped !== cleaned) resolved = tryAlias(stripped);
            }
            if (!resolved) {
                // "abre el bloc de notas": el cleaned quita "de" y rompe el alias;
                // se reintenta con el texto original menos el verbo inicial.
                const verbStripped = norm(lower
                    .replace(/^(?:por favor[,:]?\s+)?(?:abre|abrir|ábreme|inicia|ejecuta|lanza|open)\s+/, '')
                    .replace(/^(?:el|la|los|las)\s+/, '')
                    .trim());
                if (verbStripped && verbStripped !== cleaned) resolved = tryAlias(verbStripped);
            }
            resolved = resolved ?? cleaned;
            // 'ms-settings:' y protocolos los abre el shell directo.
            if (/^[a-z]+:/.test(resolved)) {
                await shell.openExternal(resolved);
                return { ok: true };
            }
            // Rutas reales de ejecutables comunes: 'start <nombre>' falla en
            // silencio si la app no existe; con ruta absoluta si abre o da error.
            const APP_PATHS = process.platform === 'win32' ? {
                chrome: [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                ],
                msedge: [
                    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                ],
                brave: ['C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
                firefox: ['C:\\Program Files\\Mozilla Firefox\\firefox.exe'],
                code: ['C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe'],
            } : {};
            const candidates = APP_PATHS[resolved] ?? [];
            const realExe = candidates.map((p) => p.replace('%USERNAME%', os.userInfo().username)).find((p) => fs.existsSync(p));
            if (realExe) {
                const err = await shell.openPath(realExe);
                if (err) return { ok: false, error: err };
                return { ok: true };
            }
            // Inventario real del registro de Windows: "abre photoshop",
            // "abre mi app de fotos" → encuentra el .exe instalado aunque el
            // usuario nunca nos haya dicho el nombre exacto del ejecutable.
            const invExe = await findInstalledExe(resolved)
                ?? await findInstalledExe(target);
            if (invExe) {
                const err = await shell.openPath(invExe);
                if (err) return { ok: false, error: err };
                return { ok: true };
            }
            // Nombre de app o ejecutable: en Windows 'start', macOS 'open', Linux 'xdg-open'.
            const launchTarget = resolved;
            if (process.platform === 'win32') {
                const child = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', launchTarget], { windowsHide: true, detached: true, stdio: 'ignore' });
                child.unref();
            } else if (process.platform === 'darwin') {
                const child = spawn('open', ['-a', launchTarget], { detached: true, stdio: 'ignore' });
                child.unref();
            } else {
                const child = spawn('xdg-open', [launchTarget], { detached: true, stdio: 'ignore' });
                child.on('error', () => {});
                child.unref();
            }
        } else {
            return { ok: false, error: 'tipo no permitido' };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'no se pudo abrir' };
    }
});

/* ── Puente de agentes local (127.0.0.1 + token único por instalación) ──
 * Cada instalación genera su propio id/token en userData/install.json —
 * nunca compartidos entre usuarios. El servidor solo escucha en loopback y
 * acepta 3 acciones seguras (open_url / open_app / search); nada de shell
 * arbitrario. Los agentes externos (CLIs, scripts del usuario) lo llaman
 * con el token como Bearer. */
const crypto = require('crypto');
const INSTALL_FILE = () => path.join(app.getPath('userData'), 'install.json');

function loadInstall() {
    try {
        const raw = fs.readFileSync(INSTALL_FILE(), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.id && parsed?.token) return parsed;
    } catch { /* se crea abajo */ }
    const inst = {
        id: `caro-${crypto.randomBytes(8).toString('hex')}`,
        token: crypto.randomBytes(24).toString('hex'),
        createdAt: new Date().toISOString(),
    };
    try { fs.writeFileSync(INSTALL_FILE(), JSON.stringify(inst, null, 2)); } catch { /* noop */ }
    return inst;
}

let bridgeServer = null;
let bridgePort = 0;

function bridgeInfo() {
    const inst = loadInstall();
    return { id: inst.id, token: inst.token, port: bridgePort || null, running: !!bridgeServer };
}

function bridgeStart() {
    if (bridgeServer) return Promise.resolve(bridgeInfo());
    const inst = loadInstall();
    bridgeServer = http.createServer((req, res) => {
        const send = (code, obj) => {
            res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(obj));
        };
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (req.method === 'GET' && url.pathname === '/health') {
            return send(200, { ok: true, install: inst.id });
        }
        if (req.method === 'POST' && url.pathname === '/v1/action') {
            const auth = String(req.headers.authorization ?? '');
            if (auth !== `Bearer ${inst.token}`) return send(401, { ok: false, error: 'token inválido' });
            let body = '';
            req.on('data', (d) => { body += d; if (body.length > 8192) req.destroy(); });
            req.on('end', async () => {
                try {
                    const p = JSON.parse(body || '{}');
                    const type = String(p.type ?? '');
                    const target = String(p.target ?? '').slice(0, 500).trim();
                    if (type === 'url' && /^https?:\/\//i.test(target)) {
                        await shell.openExternal(target);
                        return send(200, { ok: true, done: `url:${target}` });
                    }
                    if (type === 'search' && target) {
                        await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(target)}`);
                        return send(200, { ok: true, done: `search:${target}` });
                    }
                    if (type === 'app' && target) {
                        if (process.platform === 'win32') {
                            const c = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', target], { windowsHide: true, detached: true, stdio: 'ignore' });
                            c.unref();
                        } else if (process.platform === 'darwin') {
                            spawn('open', ['-a', target], { detached: true, stdio: 'ignore' }).unref();
                        } else {
                            const c = spawn('xdg-open', [target], { detached: true, stdio: 'ignore' });
                            c.on('error', () => {}); c.unref();
                        }
                        return send(200, { ok: true, done: `app:${target}` });
                    }
                    return send(400, { ok: false, error: 'acción no permitida (url|search|app)' });
                } catch (err) {
                    return send(400, { ok: false, error: err instanceof Error ? err.message : 'json inválido' });
                }
            });
            return;
        }
        send(404, { ok: false, error: 'not found' });
    });
    return new Promise((resolve, reject) => {
        bridgeServer.once('error', reject);
        bridgeServer.listen(0, '127.0.0.1', () => {
            bridgePort = bridgeServer.address().port;
            resolve(bridgeInfo());
        });
    });
}

ipcMain.handle('bridge:info', async () => bridgeInfo());
ipcMain.handle('bridge:start', async () => {
    try { return { ok: true, ...(await bridgeStart()) }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'no se pudo iniciar' }; }
});
ipcMain.handle('bridge:stop', async () => {
    if (!bridgeServer) return { ok: true, running: false };
    await new Promise((r) => bridgeServer.close(() => r()));
    bridgeServer = null; bridgePort = 0;
    return { ok: true, running: false };
});
app.on('before-quit', () => { try { bridgeServer?.close(); } catch { /* noop */ } });

/* ===== Self-update seguro (A18) =====
 * El agente/usuario propone cambios como archivos completos {path, content}.
 * Reglas duras:
 *  - Solo rutas relativas dentro de la carpeta del proyecto elegida.
 *  - Prohibido: .git, node_modules, .env, claves/secretos.
 *  - Topes: 256KB por archivo, 1MB total, 50 archivos por parche.
 *  - .js/.cjs/.mjs se validan con `node --check` antes de aplicar.
 * Flujo: submit → staging validado → apply (copia + backup previo + commit
 * git si el proyecto es repo) → rollback (restaura backups / revierte).
 * NUNCA toca app.asar ni el paquete instalado: solo el código fuente. */
const UPDATE_ROOT = () => path.join(app.getPath('userData'), 'ca-ro-updates');
const UPDATE_CONFIG = () => path.join(UPDATE_ROOT(), 'config.json');
const UPDATE_VERSIONS = () => path.join(UPDATE_ROOT(), 'versions');
const UPDATE_STAGING = () => path.join(UPDATE_ROOT(), 'staging');
const UPDATE_MAX_FILES = 50;
const UPDATE_MAX_FILE = 256 * 1024;
const UPDATE_MAX_TOTAL = 1024 * 1024;
const UPDATE_DENY = [
    /(^|[\\/])\.git([\\/]|$)/i,
    /node_modules/i,
    /(^|[\\/])\.env(\.|$)/i,
    /\.(pem|key|p12|pfx|keystore)$/i,
    /(secret|credential|password)/i,
];

function updateConfig() {
    try { return JSON.parse(fs.readFileSync(UPDATE_CONFIG(), 'utf8')); }
    catch { return { projectDir: null }; }
}

function updateSaveConfig(cfg) {
    fs.mkdirSync(UPDATE_ROOT(), { recursive: true });
    fs.writeFileSync(UPDATE_CONFIG(), JSON.stringify(cfg, null, 2));
}

/** Normaliza y valida una ruta relativa dentro del proyecto. Devuelve null si es inválida. */
function updateSafeRelPath(rel, projectDir) {
    const p = String(rel ?? '').replace(/\\/g, '/').trim();
    if (!p || p.length > 400) return null;
    if (path.isAbsolute(p) || /^[a-zA-Z]:/.test(p) || p.startsWith('/')) return null;
    const parts = p.split('/');
    if (parts.some((seg) => !seg || seg === '..' || seg === '.')) return null;
    if (UPDATE_DENY.some((re) => re.test(p))) return null;
    const abs = path.resolve(projectDir, ...parts);
    if (!abs.startsWith(path.resolve(projectDir) + path.sep)) return null;
    return { rel: parts.join('/'), abs };
}

function updateListVersions() {
    try {
        return fs.readdirSync(UPDATE_VERSIONS())
            .filter((f) => f.endsWith('.json'))
            .map((f) => {
                try { return JSON.parse(fs.readFileSync(path.join(UPDATE_VERSIONS(), f), 'utf8')); }
                catch { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));
    } catch { return []; }
}

function updateGit(projectDir, args) {
    return runProcess('git', ['-C', projectDir, ...args]);
}

ipcMain.handle('update:status', async () => {
    const cfg = updateConfig();
    const isGit = cfg.projectDir ? (await updateGit(cfg.projectDir, ['rev-parse', '--is-inside-work-tree'])).stdout.trim() === 'true' : false;
    return { projectDir: cfg.projectDir, isGit, versions: updateListVersions() };
});

ipcMain.handle('update:pickProject', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
        title: 'Carpeta del proyecto CaRo Ai (código fuente)',
        properties: ['openDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, path: null };
    const dir = r.filePaths[0];
    updateSaveConfig({ projectDir: dir });
    return { ok: true, path: dir };
});

ipcMain.handle('update:submit', async (_event, payload) => {
    if (!trustedSender(_event)) return untrusted;
    const cfg = updateConfig();
    const projectDir = cfg.projectDir;
    if (!projectDir || !fs.existsSync(projectDir)) {
        return { ok: false, error: 'primero elige la carpeta del proyecto' };
    }
    const description = String(payload?.description ?? '').slice(0, 300);
    const files = Array.isArray(payload?.files) ? payload.files : [];
    if (!files.length) return { ok: false, error: 'parche sin archivos' };
    if (files.length > UPDATE_MAX_FILES) return { ok: false, error: `máximo ${UPDATE_MAX_FILES} archivos por parche` };

    const staged = [];
    let total = 0;
    for (const f of files) {
        const safe = updateSafeRelPath(f?.path, projectDir);
        const content = String(f?.content ?? '');
        if (!safe) return { ok: false, error: `ruta no permitida: ${f?.path}` };
        if (Buffer.byteLength(content) > UPDATE_MAX_FILE) return { ok: false, error: `archivo muy grande: ${f.path}` };
        total += Buffer.byteLength(content);
        if (total > UPDATE_MAX_TOTAL) return { ok: false, error: 'parche excede 1MB total' };
        staged.push({ ...safe, content });
    }

    // Validación sintáctica de JS ejecutable.
    const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const stageDir = path.join(UPDATE_STAGING(), id);
    fs.mkdirSync(stageDir, { recursive: true });
    for (const [i, f] of staged.entries()) {
        // Extensión real para que `node --check` reconozca el formato.
        const tmp = path.join(stageDir, `f${i}${path.extname(f.rel) || '.txt'}`);
        fs.writeFileSync(tmp, f.content);
        if (/\.(cjs|mjs|js)$/.test(f.rel)) {
            // En Electron empaquetado process.execPath es el binario de la app:
            // ELECTRON_RUN_AS_NODE=1 lo convierte en Node puro para --check.
            const chk = await runProcess(process.execPath, ['--check', tmp], {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            });
            if (chk.code !== 0) {
                fs.rmSync(stageDir, { recursive: true, force: true });
                return { ok: false, error: `sintaxis inválida en ${f.rel}: ${chk.stderr.slice(0, 200)}` };
            }
        }
        fs.renameSync(tmp, path.join(stageDir, `f${i}`));
    }
    fs.writeFileSync(path.join(stageDir, 'manifest.json'), JSON.stringify({
        id, description, projectDir, createdAt: new Date().toISOString(),
        files: staged.map((f, i) => ({ path: f.rel, staged: `f${i}` })),
    }, null, 2));
    return { ok: true, id, files: staged.map((f) => f.rel) };
});

ipcMain.handle('update:apply', async (_event, payload) => {
    if (!trustedSender(_event)) return untrusted;
    const id = String(payload?.id ?? '');
    if (!/^u-[a-z0-9-]+$/i.test(id)) return { ok: false, error: 'id inválido' };
    const stageDir = path.join(UPDATE_STAGING(), id);
    const manifestPath = path.join(stageDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { ok: false, error: 'parche no encontrado en staging' };
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const projectDir = manifest.projectDir;
    if (!projectDir || !fs.existsSync(projectDir)) return { ok: false, error: 'carpeta del proyecto ya no existe' };

    // Re-validar rutas y hacer backup del contenido previo.
    const prevDir = path.join(stageDir, 'prev');
    fs.mkdirSync(prevDir, { recursive: true });
    const applied = [];
    for (const [i, f] of manifest.files.entries()) {
        const safe = updateSafeRelPath(f.path, projectDir);
        if (!safe) return { ok: false, error: `ruta ya no permitida: ${f.path}` };
        const stagedFile = path.join(stageDir, f.staged);
        if (!fs.existsSync(stagedFile)) return { ok: false, error: `falta archivo staged: ${f.staged}` };
        if (fs.existsSync(safe.abs)) {
            fs.copyFileSync(safe.abs, path.join(prevDir, String(i)));
        } else {
            fs.writeFileSync(path.join(prevDir, `${i}.absent`), '');
        }
        fs.mkdirSync(path.dirname(safe.abs), { recursive: true });
        fs.copyFileSync(stagedFile, safe.abs);
        applied.push(f.path);
    }

    let commit = null;
    const isGit = (await updateGit(projectDir, ['rev-parse', '--is-inside-work-tree'])).stdout.trim() === 'true';
    if (isGit) {
        const msg = `caro-update ${id}: ${manifest.description || 'cambio del agente'}`.slice(0, 200);
        await updateGit(projectDir, ['add', '--', ...applied]);
        const c = await updateGit(projectDir, ['commit', '-m', msg, '--', ...applied]);
        if (c.code === 0) {
            commit = (await updateGit(projectDir, ['rev-parse', 'HEAD'])).stdout.trim();
        }
    }

    const record = {
        id, description: manifest.description, projectDir,
        appliedAt: new Date().toISOString(), files: applied, commit,
        git: isGit,
    };
    fs.mkdirSync(UPDATE_VERSIONS(), { recursive: true });
    fs.writeFileSync(path.join(UPDATE_VERSIONS(), `${id}.json`), JSON.stringify(record, null, 2));
    return { ok: true, record };
});

ipcMain.handle('update:rollback', async (_event, payload) => {
    if (!trustedSender(_event)) return untrusted;
    const id = String(payload?.id ?? '');
    const versions = updateListVersions();
    const target = id
        ? versions.find((v) => v.id === id)
        : versions[0];
    if (!target) return { ok: false, error: 'no hay actualizaciones aplicadas' };
    const stageDir = path.join(UPDATE_STAGING(), target.id);
    const manifestPath = path.join(stageDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        return { ok: false, error: 'respaldo no disponible para revertir (staging limpio)' };
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const prevDir = path.join(stageDir, 'prev');
    const restored = [];
    for (const [i, f] of manifest.files.entries()) {
        const safe = updateSafeRelPath(f.path, manifest.projectDir);
        if (!safe) continue;
        const prevFile = path.join(prevDir, String(i));
        const absentMark = path.join(prevDir, `${i}.absent`);
        if (fs.existsSync(prevFile)) {
            fs.mkdirSync(path.dirname(safe.abs), { recursive: true });
            fs.copyFileSync(prevFile, safe.abs);
        } else if (fs.existsSync(absentMark)) {
            try { fs.unlinkSync(safe.abs); } catch { /* noop */ }
        }
        restored.push(f.path);
    }
    const isGit = (await updateGit(manifest.projectDir, ['rev-parse', '--is-inside-work-tree'])).stdout.trim() === 'true';
    if (isGit && restored.length) {
        await updateGit(manifest.projectDir, ['add', '--', ...restored]);
        await updateGit(manifest.projectDir, ['commit', '-m', `caro-rollback ${target.id}`, '--', ...restored]);
    }
    // Marcar como revertida en el registro (no se borra: queda historial).
    target.rolledBackAt = new Date().toISOString();
    fs.writeFileSync(path.join(UPDATE_VERSIONS(), `${target.id}.json`), JSON.stringify(target, null, 2));
    return { ok: true, rolledBack: target.id };
});

ipcMain.handle('update:export', async (_event, payload) => {
    if (!trustedSender(_event)) return untrusted;
    const versions = updateListVersions();
    const target = payload?.id ? versions.find((v) => v.id === payload.id) : versions[0];
    if (!target) return { ok: false, error: 'no hay actualizaciones para exportar' };
    const stageDir = path.join(UPDATE_STAGING(), target.id);
    const manifestPath = path.join(stageDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { ok: false, error: 'staging no disponible' };
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const out = {
        ...target,
        files: manifest.files.map((f) => ({
            path: f.path,
            content: fs.existsSync(path.join(stageDir, f.staged))
                ? fs.readFileSync(path.join(stageDir, f.staged), 'utf8')
                : null,
        })),
    };
    const outDir = path.join(app.getPath('documents'), 'CaRoAi-Actualizaciones');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `caro-update-${target.id}.json`);
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    shell.showItemInFolder(outFile);
    return { ok: true, path: outFile };
});

/* Visor de archivos de una actualización: devuelve la lista y el contenido
 * de cada archivo staged para que el usuario pueda auditar qué se aplicó. */
ipcMain.handle('update:view', async (_event, payload) => {
    if (!trustedSender(_event)) return untrusted;
    const id = String(payload?.id ?? '');
    if (!/^u-[a-z0-9-]+$/i.test(id)) return { ok: false, error: 'id inválido' };
    const stageDir = path.join(UPDATE_STAGING(), id);
    const manifestPath = path.join(stageDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { ok: false, error: 'staging no disponible' };
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const files = manifest.files.map((f) => {
        const p = path.join(stageDir, f.staged);
        const exists = fs.existsSync(p);
        const size = exists ? fs.statSync(p).size : 0;
        return {
            path: f.path,
            size,
            truncated: size > 64 * 1024,
            content: exists && size <= 64 * 1024 ? fs.readFileSync(p, 'utf8') : null,
        };
    });
    return { ok: true, id, description: manifest.description, createdAt: manifest.createdAt, files };
});

/* Abre en el explorador del SO la carpeta independiente de una actualización
 * (staging: manifest + archivos propuestos + respaldos prev/). */
ipcMain.handle('update:openDir', async (_event, payload) => {
    if (!trustedSender(_event)) return untrusted;
    const id = String(payload?.id ?? '');
    if (!/^u-[a-z0-9-]+$/i.test(id)) return { ok: false, error: 'id inválido' };
    const stageDir = path.join(UPDATE_STAGING(), id);
    if (!fs.existsSync(stageDir)) return { ok: false, error: 'carpeta no disponible' };
    shell.showItemInFolder(stageDir);
    return { ok: true };
});

/* ===== Auto-updater (B9) =====
 * electron-updater solo opera en app empaquetada (app.isPackaged).
 * El feed se define en electron-builder.yml → publish. Hasta que exista el
 * repo de releases (B6), checkForUpdates falla con error controlado y la UI
 * muestra "no configurado" en vez de romperse. */
let autoUpdater = null;
function getAutoUpdater() {
    if (autoUpdater || !app.isPackaged) return autoUpdater;
    try {
        ({ autoUpdater } = require('electron-updater'));
        autoUpdater.autoDownload = true; // descarga sola al detectar versión nueva
        autoUpdater.autoInstallOnAppQuit = true; // y se instala sola al cerrar la app
        const send = (channel, data) => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
        };
        autoUpdater.on('checking-for-update', () => send('update:event', { type: 'checking' }));
        autoUpdater.on('update-available', (i) => send('update:event', { type: 'available', version: i?.version }));
        autoUpdater.on('update-not-available', () => send('update:event', { type: 'none' }));
        autoUpdater.on('download-progress', (p) => send('update:event', { type: 'progress', percent: Math.round(p?.percent ?? 0) }));
        autoUpdater.on('update-downloaded', (i) => send('update:event', { type: 'downloaded', version: i?.version }));
        autoUpdater.on('error', (e) => send('update:event', { type: 'error', message: e?.message ?? 'error' }));
    } catch { autoUpdater = null; }
    return autoUpdater;
}

ipcMain.handle('app:version', async () => ({ version: app.getVersion(), packaged: app.isPackaged }));

ipcMain.handle('app:update-check', async () => {
    const au = getAutoUpdater();
    if (!au) return { ok: false, error: 'auto-update solo en app instalada' };
    try { await au.checkForUpdates(); return { ok: true }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'falló la verificación' }; }
});

ipcMain.handle('app:update-download', async () => {
    const au = getAutoUpdater();
    if (!au) return { ok: false, error: 'auto-update solo en app instalada' };
    try { await au.downloadUpdate(); return { ok: true }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'falló la descarga' }; }
});

ipcMain.handle('app:update-install', async () => {
    const au = getAutoUpdater();
    if (!au) return { ok: false, error: 'auto-update solo en app instalada' };
    try { au.quitAndInstall(); return { ok: true }; }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'falló la instalación' }; }
});

app.whenReady().then(() => {
    createWindow();
    createTray();

    // Verificación silenciosa al arrancar (solo instalada; el usuario decide descargar).
    if (app.isPackaged) {
        setTimeout(() => { getAutoUpdater()?.checkForUpdates().catch(() => {}); }, 15_000);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
