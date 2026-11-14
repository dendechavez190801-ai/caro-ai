/**
 * Electron preload — puente inyectado en `window.joyai`.
 *
 * Reglas:
 *   - contextIsolation: true  -> la UI no toca Node
 *   - nodeIntegration: false  -> solo lo que aqui se exponga
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('joyai', {
    platform: process.platform,
    arch: process.arch,
    versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
    },

    /** Abre una URL en el navegador del sistema. */
    openExternal: (url) => ipcRenderer.send('open-external', url),

    /** Telemetria de solo lectura (CPU/RAM/GPU/disco/bateria/red). */
    /** Modo isla: ventana siempre visible encima de todo. */
    setFloatMode: (on) => ipcRenderer.invoke('win:float', { on }),
    getFloatMode: () => ipcRenderer.invoke('win:float-status'),

    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),

    /**
     * Proxy de peticiones IA: chat y health check sin CORS.
     * payload -> { ok, text?, models?, latencyMs?, error? }
     */
    aiRequest: (payload) => ipcRenderer.invoke('ai:request', payload),

    /** Descarga un modelo en el servidor local (hoy: solo `ollama pull`). */
    enginePull: (payload) => ipcRenderer.invoke('engine:pull', payload),

    /** Progreso en vivo de `enginePull` (chunks de salida de ollama). Devuelve función para desuscribir. */
    onEnginePullProgress: (cb) => {
        const handler = (_e, payload) => cb(payload);
        ipcRenderer.on('engine:pull-progress', handler);
        return () => ipcRenderer.removeListener('engine:pull-progress', handler);
    },
    /** Evento global: una descarga de modelo terminó (sigue aunque cambies de módulo). */
    onEnginePullDone: (cb) => {
        const handler = (_e, data) => cb(data);
        ipcRenderer.on('engine:pull-done', handler);
        return () => ipcRenderer.removeListener('engine:pull-done', handler);
    },

    /** Ejecuta un comando en el shell del usuario (consola Terminal). */
    shellExec: (command) => ipcRenderer.invoke('shell:exec', { command }),

    /** Estado del servidor de proyección LAN (Pantalla). */
    linkShareStatus: () => ipcRenderer.invoke('link:share-status'),
    /** Inicia la proyección de pantalla por LAN (HTTP local + frames JPEG). */
    linkShareStart: (payload) => ipcRenderer.invoke('link:share-start', payload),
    /** Detiene la proyección. */
    linkShareStop: () => ipcRenderer.invoke('link:share-stop'),

    /** Llama a la API de un conector permitido (GitHub/GitLab/HF), GET solamente. */
    connectorApi: (payload) => ipcRenderer.invoke('connector:api', payload),

    /** Escanea el equipo buscando archivos de modelo (.gguf/.safetensors/.bin). */
    modelsScan: (payload) => ipcRenderer.invoke('models:scan', payload),

    /** Edición de media con FFmpeg local (solo Electron). */
    mediaStatus: () => ipcRenderer.invoke('media:status'),
    mediaPick: () => ipcRenderer.invoke('media:pick'),
    mediaProbe: (payload) => ipcRenderer.invoke('media:probe', payload),
    mediaConvert: (payload) => ipcRenderer.invoke('media:convert', payload),

    /** Ejecuta un comando SSH en un dispositivo propio (OpenSSH del sistema). */
    deviceSsh: (payload) => ipcRenderer.invoke('device:ssh', payload),

    /** Abre apps/archivos/URLs del usuario (acciones del agente). */
    osOpen: (payload) => ipcRenderer.invoke('os:open', payload),

    /** Puente de agentes local: id/token únicos por instalación (127.0.0.1). */
    bridgeInfo: () => ipcRenderer.invoke('bridge:info'),
    bridgeStart: () => ipcRenderer.invoke('bridge:start'),
    bridgeStop: () => ipcRenderer.invoke('bridge:stop'),

    /** TTS con Kokoro: voces naturales en español (ef_dora/em_alex/em_santa). */
    speechTtsKokoro: (payload) => ipcRenderer.invoke('speech:tts-kokoro', payload),

    /** Clonación de voz local (OpenVoice V2): muestra del usuario + TTS clonada. */
    speechCloneSampleSave: (payload) => ipcRenderer.invoke('speech:clone-sample-save', payload),
    speechCloneSampleInfo: () => ipcRenderer.invoke('speech:clone-sample-info'),
    speechClone: (payload) => ipcRenderer.invoke('speech:clone', payload),

    /** Self-update seguro: validar/aplicar/parchar el código fuente del proyecto. */
    updateStatus: () => ipcRenderer.invoke('update:status'),
    updatePickProject: () => ipcRenderer.invoke('update:pickProject'),
    updateSubmit: (payload) => ipcRenderer.invoke('update:submit', payload),
    updateApply: (payload) => ipcRenderer.invoke('update:apply', payload),
    updateRollback: (payload) => ipcRenderer.invoke('update:rollback', payload),
    updateExport: (payload) => ipcRenderer.invoke('update:export', payload),
    updateView: (payload) => ipcRenderer.invoke('update:view', payload),
    updateOpenDir: (payload) => ipcRenderer.invoke('update:openDir', payload),
    /** Captura la ventana de CaRo Ai → PNG en Documentos/CaRoAi-Capturas. */
    screenShot: () => ipcRenderer.invoke('screen:shot'),
    /** Control real del SO: mouse/teclado (nut.js, solo escritorio). */
    controlStatus: () => ipcRenderer.invoke('control:status'),
    controlMouseMove: (p) => ipcRenderer.invoke('control:mouseMove', p),
    controlMouseClick: (p) => ipcRenderer.invoke('control:mouseClick', p),
    controlType: (p) => ipcRenderer.invoke('control:type', p),
    controlKey: (p) => ipcRenderer.invoke('control:key', p),

    /** Auto-updater de la app instalada (electron-updater, solo packaged). */
    appVersion: () => ipcRenderer.invoke('app:version'),
    appUpdateCheck: () => ipcRenderer.invoke('app:update-check'),
    appUpdateDownload: () => ipcRenderer.invoke('app:update-download'),
    appUpdateInstall: () => ipcRenderer.invoke('app:update-install'),
    onUpdateEvent: (cb) => {
        const listener = (_e, data) => cb(data);
        ipcRenderer.on('update:event', listener);
        return () => ipcRenderer.removeListener('update:event', listener);
    },

    /** Inicio con el sistema (autostart de ESTE usuario). */
    appAutostart: (enabled) => ipcRenderer.invoke('app:autostart', { enabled }),
    appAutostartStatus: () => ipcRenderer.invoke('app:autostart-status'),

    /** Motores de voz locales: estado, catalogo de voces, TTS y STT. */
    speechStatus: () => ipcRenderer.invoke('speech:status'),
    speechVoices: () => ipcRenderer.invoke('speech:voices'),
    speechTts: (payload) => ipcRenderer.invoke('speech:tts', payload),
    speechStt: (payload) => ipcRenderer.invoke('speech:stt', payload),

    /** Borra cookies/storage de una sesion del navegador integrado. */
    clearSession: (partition) => ipcRenderer.invoke('session:clear', { partition }),

    /** Secretos cifrados con safeStorage: save {entries:{k:v}}, load -> {k:v}. */
    secretsSave: (entries) => ipcRenderer.invoke('secrets:save', { entries }),
    secretsLoad: () => ipcRenderer.invoke('secrets:load'),

    /** Suscripcion a canales del proceso principal. */
    on: (channel, callback) => {
        const valid = ['joyai:ready', 'joyai:external-link'];
        if (!valid.includes(channel)) return;
        const listener = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
    },
});
