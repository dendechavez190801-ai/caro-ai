import React, { useEffect, useState } from 'react';
import { Cloud, KeyRound, Download, Plus, RefreshCw, FolderSearch, FileBox } from 'lucide-react';
import { Section, Card, Toggle, Pill } from '../../components/ui';
import { useApp } from '../../store';
import { checkEngineHealth, EngineHealth } from '../../ai';
import { AIEngineConfig } from '../../types';

const LOCAL_TYPES = new Set(['ollama', 'lmstudio', 'vllm']);

/**
 * Modelos de CHAT recomendados (instruct/generalistas). Etiquetados por peso
 * real: 'Telefono' corre en gama media por CPU; 'PC/CPU' pide algo mas de RAM.
 * Todos se descargan del registro publico de Ollama al equipo del usuario.
 */
const CHAT_MODELS = [
    { tag: 'qwen2.5:1.5b', name: 'Qwen2.5 1.5B', size: '~1.0 GB', hw: 'Teléfono ✓', desc: 'El más ligero que conversa bien. Ideal para gama media.' },
    { tag: 'qwen2.5:3b', name: 'Qwen2.5 3B', size: '~1.9 GB', hw: 'Teléfono/PC ✓', desc: 'Equilibrio recomendado: razona y sigue instrucciones.' },
    { tag: 'llama3.2:3b', name: 'Llama 3.2 3B', size: '~2.0 GB', hw: 'Teléfono/PC ✓', desc: 'Alternativa sólida de Meta, buena en español.' },
    { tag: 'qwen2.5:7b', name: 'Qwen2.5 7B', size: '~4.7 GB', hw: 'PC/CPU ✓', desc: 'Más listo; pide ~8 GB RAM libres.' },
    { tag: 'gemma3:4b', name: 'Gemma 3 4B', size: '~3.3 GB', hw: 'PC/CPU ✓', desc: 'Multimodal: entiende imágenes además de texto.' },
    { tag: 'phi3.5-mini', name: 'Phi-3.5 Mini', size: '~2.2 GB', hw: 'Teléfono/PC ✓', desc: 'Compacto y rápido, buen razonamiento.' },
];

/**
 * Un motor es "local" si su tipo lo es O si su endpoint apunta a localhost —
 * instalaciones viejas pudieron guardar Ollama como 'custom' y entonces los
 * modelos descargados nunca aparecian en la lista.
 */
const isLocalEngine = (e: AIEngineConfig) =>
    LOCAL_TYPES.has(e.providerType) || /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(e.endpoint);

/** Adivina el proveedor por la URL base (para el proveedor personalizado). */
function detectProviderName(url: string): string {
    const u = url.toLowerCase();
    if (u.includes('openrouter')) return 'OpenRouter';
    if (u.includes('nvidia') || u.includes('integrate.api.nvidia')) return 'Nvidia NIM';
    if (u.includes('groq')) return 'Groq';
    if (u.includes('deepseek')) return 'DeepSeek';
    if (u.includes('openai')) return 'OpenAI';
    if (u.includes('anthropic')) return 'Anthropic';
    if (u.includes('gemini') || u.includes('googleapis')) return 'Google Gemini';
    if (u.includes('11434')) return 'Ollama';
    if (u.includes('1234')) return 'LM Studio';
    return 'Personalizado';
}

const inputCls = 'w-full px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] text-neutral-200 placeholder:text-neutral-600 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]';

interface EngineCardProps {
    engine: AIEngineConfig;
    onPatch: (patch: Partial<AIEngineConfig>) => void;
    health?: EngineHealth;
    checking?: boolean;
    onCheck?: () => void;
    onSelectModel?: (model: string) => void;
}

/** Tarjeta editable de un motor: nombre, modelo, endpoint, API key y enabled. */
const EngineCard: React.FC<EngineCardProps> = ({ engine, onPatch, health, checking, onCheck, onSelectModel }) => {
    const isLocal = LOCAL_TYPES.has(engine.providerType);
    // Modelos del proveedor: colapsados por defecto; al expandir se consulta
    // el endpoint (solo tiene sentido con API key en proveedores de nube).
    const [modelsOpen, setModelsOpen] = useState(false);
    const toggleModels = () => {
        const next = !modelsOpen;
        setModelsOpen(next);
        if (next && !health && onCheck) onCheck();
    };
    return (
        <Card className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white truncate">{engine.name}</span>
                <Toggle checked={engine.enabled} onChange={(v) => onPatch({ enabled: v })} />
            </div>
            <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-neutral-500">Modelo</span>
                <input className={inputCls} value={engine.model} onChange={(e) => onPatch({ model: e.target.value })} placeholder="nombre-del-modelo" />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-neutral-500">URL base</span>
                <input className={inputCls} value={engine.endpoint} onChange={(e) => onPatch({ endpoint: e.target.value })} placeholder="https://api…/v1" />
            </label>
            {!isLocal && (
                <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-500">API Key</span>
                    <input type="password" className={inputCls} value={engine.apiKey ?? ''} onChange={(e) => onPatch({ apiKey: e.target.value.trim() })} placeholder="sk-…" autoComplete="off" />
                    {engine.apiKey && <span className="text-[9px] text-emerald-400/80">✓ key guardada</span>}
                </label>
            )}
            {health && (
                <p className={`text-[10px] font-mono ${health.ok ? 'text-emerald-400' : 'text-red-400/80'}`}>
                    {health.ok ? `● ok · ${health.latencyMs} ms · ${health.models.length} modelos` : `○ ${health.error ?? 'sin conexión'}`}
                </p>
            )}
            <button
                type="button"
                onClick={toggleModels}
                className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-300 transition-colors"
            >
                <span>Modelos de {engine.name}</span>
                <span className="flex items-center gap-1 normal-case">
                    {!isLocal && !engine.apiKey && <span className="text-[9px] text-amber-400/80 normal-case">requiere API key</span>}
                    {checking ? 'consultando…' : modelsOpen ? '▴ ocultar' : '▾ ver'}
                </span>
            </button>
            {modelsOpen && (
            <div className="flex flex-col gap-1">
                {!isLocal && !engine.apiKey ? (
                    <p className="text-[10px] text-amber-400/80">Este proveedor es de nube: pega tu API key arriba para listar sus modelos.</p>
                ) : checking ? (
                    <p className="text-[10px] text-neutral-500">Consultando {engine.name}…</p>
                ) : health?.ok ? (
                    health.models.length > 0 ? (
                        <>
                            <p className="text-[10px] uppercase tracking-widest text-neutral-600">Modelos instalados</p>
                            <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto pr-1">
                                {health.models.map((m) => {
                                    const active = engine.model === m;
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => onSelectModel?.(m)}
                                            title={active ? 'Modelo activo' : 'Usar este modelo'}
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono border transition-colors ${
                                                active
                                                    ? 'border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.15)] text-white'
                                                    : 'border-white/10 text-neutral-400 hover:border-white/25 hover:text-neutral-200'
                                            }`}
                                        >
                                            {m}
                                        </button>
                                    );
                                })}
                                {health.models.length > 20 && (
                                    <span className="px-2 py-0.5 text-[10px] text-neutral-600">{health.models.length} en total — desplázate</span>
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="text-[10px] text-neutral-500">El servidor responde pero no reporta modelos.</p>
                    )
                ) : health ? (
                    <p className="text-[10px] text-red-400/70">{health.error ?? 'sin respuesta'} — revisa endpoint/key.</p>
                ) : null}
            </div>
            )}
            {onCheck && (
                <button
                    type="button"
                    onClick={onCheck}
                    disabled={checking}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-neutral-300 border border-white/10 hover:border-white/20 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={11} className={checking ? 'animate-spin' : ''} /> {checking ? 'Comprobando…' : 'Comprobar'}
                </button>
            )}
        </Card>
    );
};

export const ModelsModule: React.FC = () => {
    const { state, dispatch } = useApp();
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [customModel, setCustomModel] = useState('');
    const [discovered, setDiscovered] = useState<string[]>([]);
    const [discovering, setDiscovering] = useState(false);
    const [note, setNote] = useState('');
    const [health, setHealth] = useState<Record<string, EngineHealth>>({});
    const [checkingId, setCheckingId] = useState<string | null>(null);
    const [pullInput, setPullInput] = useState('');
    /** Tag del modelo descargándose ahora ('' = ninguno). */
    const [pulling, setPulling] = useState('');
    // Catalogos y proveedores de nube colapsados por defecto: el menu muestra
    // primero solo lo que el usuario ya descargo; el resto se expande a pedido.
    // Proveedores de nube visibles por defecto: es donde se pegan las API
    // keys; esconderlos hacia parecer que no existen.
    const [cloudOpen, setCloudOpen] = useState(true);
    const [pullMsg, setPullMsg] = useState('');
    const [pullPct, setPullPct] = useState<number | null>(null);
    const [pullLog, setPullLog] = useState('');
    const [scanDir, setScanDir] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanMsg, setScanMsg] = useState('');
    const [scanModels, setScanModels] = useState<{ path: string; name: string; size: number; ext: string }[]>([]);

    const cloudEngines = state.engines.filter((e) => !isLocalEngine(e));
    const localEngines = state.engines.filter(isLocalEngine);

    const ollamaEngine = state.engines.find((e) => e.providerType === 'ollama')
        ?? localEngines.find((e) => /11434/.test(e.endpoint));
    // Modelos realmente instalados en el Ollama del usuario (via /api/tags).
    const detected = baseUrl.trim() ? detectProviderName(baseUrl) : 'Personalizado';

    const patchEngine = (id: string, patch: Partial<AIEngineConfig>) =>
        dispatch({ type: 'update-engine', id, patch });

    const runCheck = async (engine: AIEngineConfig) => {
        setCheckingId(engine.id);
        const h = await checkEngineHealth(engine);
        setHealth((prev) => ({ ...prev, [engine.id]: h }));
        setCheckingId(null);
        // Auto-reparacion: si el modelo configurado no esta instalado, se
        // cambia al primero disponible para que Chat no falle con 404.
        if (h.ok && h.models.length && !h.models.includes(engine.model)) {
            // Si el motor de nube no tenia modelo ni estaba activo, lo activamos
            // directo: el usuario solo pega la key y ya puede platicar.
            patchEngine(engine.id, {
                model: h.models[0],
                ...(!engine.model || !engine.enabled ? { enabled: true } : {}),
            });
        }
    };

    // Auto-deteccion: al pegar/cambiar la API key de un proveedor de nube, la
    // app sola consulta sus modelos y activa el primero — sin botones extra.
    const prevKeys = React.useRef<Record<string, string>>({});
    useEffect(() => {
        state.engines.forEach((e) => {
            if (isLocalEngine(e)) return;
            const k = e.apiKey ?? '';
            const prev = prevKeys.current[e.id] ?? '';
            prevKeys.current[e.id] = k;
            if (k && k !== prev && e.endpoint.trim()) void runCheck(e);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.engines]);

    // Comprobación automática de los servidores locales al abrir el modulo.
    useEffect(() => {
        localEngines.forEach((e) => void runCheck(e));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Progreso en vivo de la descarga (chunks de `ollama pull`).
    useEffect(() => {
        const off = window.joyai?.onEnginePullProgress?.((p) => {
            setPullLog((l) => (l + p.chunk).slice(-2500));
            const matches = [...p.chunk.matchAll(/(\d+)%/g)];
            if (matches.length) setPullPct(parseInt(matches[matches.length - 1][1], 10));
        });
        return () => off?.();
    }, []);

    // Al terminar una descarga (desde cualquier parte de la app) refrescamos
    // el health de los servidores locales para que el modelo aparezca solo.
    useEffect(() => {
        const off = window.joyai?.onEnginePullDone?.(({ ok }) => {
            if (ok) localEngines.forEach((e) => void runCheck(e));
        });
        return () => off?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Todos los modelos instalados en los servidores locales detectados. */
    const installedList = localEngines.flatMap((e) =>
        (health[e.id]?.ok ? health[e.id].models : []).map((m) => ({ engine: e, model: m })),
    );

    /** Descarga un modelo en Ollama (solo en Electron; el CLI vive en el equipo). */
    const pullModel = async (model: string) => {
        const { permEnabled } = await import('../../permissions');
        if (!permEnabled('downloads')) { setPullMsg('Descargas bloqueadas: actívalas en Sistema → Permisos.'); return; }
        const pull = window.joyai?.enginePull;
        if (!pull || !ollamaEngine) {
            setNote('La descarga automática requiere la app de escritorio (Electron) con Ollama instalado. En su defecto usa `ollama pull <modelo>` en tu terminal.');
            return;
        }
        setPulling(model);
        setPullPct(null);
        setPullLog('');
        setPullMsg(`Descargando ${model}…`);
        const r = await pull({ engineId: 'ollama', model }).catch((e) => ({ ok: false as const, error: String(e) }));
        setPulling('');
        setPullPct(null);
        setPullMsg(r.ok ? `✓ ${model} descargado.` : `Error: ${r.error ?? 'falló la descarga'}`);
        if (r.ok) {
            patchEngine('ollama', { model, enabled: true });
            void runCheck(ollamaEngine);
        }
    };

    const runScan = async () => {
        const scan = window.joyai?.modelsScan;
        if (!scan) { setScanMsg('El escaneo del equipo requiere la app de escritorio (Electron).'); return; }
        setScanning(true); setScanMsg(''); setScanModels([]);
        const r = await scan({ dir: scanDir.trim() || undefined }).catch((e) => ({ ok: false as const, count: 0, models: [], error: String(e) }));
        setScanning(false);
        if (!r.ok) { setScanMsg(`Error: ${'error' in r ? r.error : 'falló el escaneo'}`); return; }
        setScanModels(r.models);
        setScanMsg(r.count === 0
            ? 'No se encontraron archivos de modelo en las carpetas revisadas.'
            : `${r.count} archivo${r.count === 1 ? '' : 's'} encontrado${r.count === 1 ? '' : 's'}${r.truncated ? ' (lista truncada)' : ''}.`);
    };

    /** Descubre los modelos que ofrece el endpoint (GET /models estilo OpenAI). */
    const discoverModels = async () => {
        if (!baseUrl.trim()) { setNote('Pega primero la URL base del proveedor.'); return; }
        setDiscovering(true);
        const h = await checkEngineHealth({
            id: 'custom-draft', name: 'borrador', providerType: 'custom',
            endpoint: baseUrl.trim(), apiKey: apiKey.trim() || undefined, model: '', enabled: false,
        }).catch(() => null);
        setDiscovering(false);
        if (h?.ok && h.models.length) {
            setDiscovered(h.models);
            setCustomModel((m) => m || h.models[0]);
            setNote(`${h.models.length} modelo(s) disponible(s). Elige uno abajo.`);
        } else {
            setDiscovered([]);
            setNote(`No se pudieron listar modelos (${h?.error ?? 'sin respuesta'}). Revisa URL/key o escribe el modelo a mano.`);
        }
    };

    const activateCustom = () => {
        if (!baseUrl.trim()) {
            setNote('Escribe la URL base del proveedor primero.');
            return;
        }
        // Si la URL ya pertenece a un motor conocido (OpenRouter, OpenAI...)
        // se actualiza ESE con la key — no se crea un duplicado con el mismo
        // nombre, que era la causa del "401 sin credenciales" en Chat.
        const norm = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();
        const endpoint = baseUrl.trim();
        const existing = state.engines.find((e) => norm(e.endpoint) === norm(endpoint));
        patchEngine(existing?.id ?? 'custom', {
            name: detected,
            endpoint,
            model: customModel.trim(),
            apiKey: apiKey.trim() || undefined,
            enabled: true,
        });
        setNote(`Proveedor "${detected}" activado. Ya aparece en el selector del chat.`);
    };

    return (
        <div className="flex flex-col gap-6">
            {/* TUS MODELOS — lo primero que se ve: solo lo realmente descargado
                en los servidores locales del usuario. Nada de catalogos ni
                proveedores de nube hasta que haya API key. */}
            <Section
                title="Tus modelos descargados"
                desc="Solo modelos que YA bajaste a tu equipo (Ollama, LM Studio, vLLM). Toca uno para activarlo en Chat. Los de nube aparecen abajo solo cuando pegues tu API key."
            >
                {installedList.length === 0 ? (
                    <Card className="text-center py-6">
                        <p className="text-sm text-neutral-400">Aún no hay modelos descargados.</p>
                        <p className="text-[11px] text-neutral-600 mt-1">Baja uno del catálogo o con <code className="font-mono">ollama pull &lt;modelo&gt;</code> en tu terminal.</p>
                    </Card>
                ) : (
                    // Agrupados por fuente: cada servidor local es su seccion.
                    Object.entries(
                        installedList.reduce<Record<string, { engine: AIEngineConfig; models: string[] }>>((acc, { engine, model }) => {
                            const g = acc[engine.id] ?? (acc[engine.id] = { engine, models: [] });
                            g.models.push(model);
                            return acc;
                        }, {}),
                    ).map(([engineId, { engine, models }]) => (
                        <div key={engineId} className="mb-3 last:mb-0">
                            <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5">
                                {engine.name} <span className="text-neutral-600 normal-case">· {models.length} modelo{models.length === 1 ? '' : 's'}</span>
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {models.map((model) => {
                                    const active = engine.enabled && engine.model === model;
                                    return (
                                        <button
                                            key={model}
                                            type="button"
                                            onClick={() => patchEngine(engine.id, { model, enabled: true })}
                                            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                                active
                                                    ? 'border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.15)]'
                                                    : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                                            }`}
                                        >
                                            <span className="text-xs font-semibold text-white font-mono truncate">{model}</span>
                                            {active ? <Pill active>Activo</Pill> : <Pill>Usar</Pill>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </Section>

            {/* Catálogo de CHAT: solo modelos instruct/generalistas que
                razonan y siguen instrucciones — nada de modelos de código
                ni de relleno. Se descargan al Ollama del usuario. */}
            <Section
                title="Para descargar — chat y asistente"
                desc="Modelos de conversación que sí razonan y obedecen instrucciones (los de código no sirven para platicar). Se bajan a TU Ollama; nada pasa por servidores del desarrollador."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {CHAT_MODELS.map((m) => (
                        <Card key={m.tag} className="flex flex-col gap-2.5">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-white">{m.name}</p>
                                    <p className="text-[10px] text-neutral-500 font-mono">{m.tag} · {m.size}</p>
                                </div>
                                <Pill>{m.hw}</Pill>
                            </div>
                            <p className="text-[10px] text-neutral-500">{m.desc}</p>
                            <button
                                type="button"
                                onClick={() => void pullModel(m.tag)}
                                disabled={!!pulling}
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                <Download size={13} /> {pulling === m.tag ? 'Descargando…' : 'Descargar'}
                            </button>
                            {pulling === m.tag && (
                                <div>
                                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                        <div className="h-full bg-[rgb(var(--accent))] transition-all duration-500"
                                            style={{ width: `${pullPct ?? 5}%` }} />
                                    </div>
                                    <p className="text-[10px] text-neutral-500 mt-1 font-mono truncate">
                                        {pullPct != null ? `${pullPct}% · ` : ''}{pullLog.trim().split('\n').pop()?.slice(0, 80) ?? 'iniciando…'}
                                    </p>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            </Section>

            {/* Proveedores en la nube: editan los motores reales del store.
                Colapsados por defecto — sin API key no muestran modelos. */}
            <Section
                title="Por empresa — nube (requieren tu API key)"
                desc="Estos NO son modelos descargables: son proveedores en la nube. Sus modelos solo se listan al expandir cada tarjeta y con tu API key pegada."
                right={
                    <button type="button" onClick={() => setCloudOpen((v) => !v)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-neutral-300 border border-white/10 hover:border-white/25 transition-colors">
                        {cloudOpen ? '▴ Ocultar' : '▾ Mostrar'}
                    </button>
                }
            >
                {cloudOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cloudEngines.map((e) => (
                        <EngineCard
                            key={e.id}
                            engine={e}
                            onPatch={(patch) => patchEngine(e.id, patch)}
                            health={health[e.id]}
                            checking={checkingId === e.id}
                            onCheck={() => void runCheck(e)}
                            onSelectModel={(m) => patchEngine(e.id, { model: m })}
                        />
                    ))}
                </div>
                )}
            </Section>

            {/* Proveedor personalizado rapido */}
            <Section title="Proveedor personalizado" desc="Pega tu API key y URL base; la app detecta el nombre y la activa como motor 'Personalizado' (tipo OpenAI).">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                        <span className="text-[11px] text-neutral-400 flex items-center gap-1"><KeyRound size={12} /> API Key</span>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Pega tu API key…"
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]"
                            autoComplete="off"
                        />
                    </label>
                    {/* Atajos de proveedor: llenan la URL base sola — el usuario
                        solo pega su API key y pulsa "Listar modelos". */}
                    <div className="sm:col-span-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-widest text-neutral-600 mr-1">Proveedor:</span>
                        {([
                            ['OpenRouter', 'https://openrouter.ai/api/v1'],
                            ['OpenAI', 'https://api.openai.com/v1'],
                            ['Groq', 'https://api.groq.com/openai/v1'],
                            ['DeepSeek', 'https://api.deepseek.com/v1'],
                            ['Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai'],
                            ['Nvidia NIM', 'https://integrate.api.nvidia.com/v1'],
                            ['Otro / manual', ''],
                        ] as const).map(([name, url]) => (
                            <button
                                key={name}
                                type="button"
                                onClick={() => setBaseUrl(url)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                                    baseUrl === url
                                        ? 'border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.15)] text-white'
                                        : 'border-white/10 text-neutral-400 hover:border-white/25 hover:text-neutral-200'
                                }`}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] text-neutral-400">URL base</span>
                        <input
                            type="text"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="https://api.ejemplo.com/v1"
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]"
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] text-neutral-400">Modelo</span>
                        <input
                            type="text"
                            value={customModel}
                            onChange={(e) => setCustomModel(e.target.value)}
                            placeholder="nombre-del-modelo"
                            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]"
                        />
                    </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void discoverModels()}
                        disabled={discovering || !baseUrl.trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={discovering ? 'animate-spin' : ''} /> {discovering ? 'Buscando…' : 'Listar modelos del proveedor'}
                    </button>
                    {discovered.length > 0 && (
                        <select
                            value={customModel}
                            onChange={(e) => setCustomModel(e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] text-neutral-300 font-mono outline-none max-w-xs"
                        >
                            <option value="" className="bg-neutral-900">Elegir modelo…</option>
                            {discovered.map((m) => <option key={m} value={m} className="bg-neutral-900">{m}</option>)}
                        </select>
                    )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Card className="flex-1 min-w-[200px] flex items-center justify-between gap-2">
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Detectado</p>
                            <p className="text-sm font-semibold text-white">{detected}</p>
                        </div>
                        <Pill active={!!baseUrl.trim()}>Auto</Pill>
                    </Card>
                    <button
                        type="button"
                        onClick={activateCustom}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity"
                    >
                        <Plus size={14} /> Activar proveedor
                    </button>
                </div>
            </Section>

            {/* Servidores locales por usuario, con health check real */}
            <Section
                title="Servidores locales"
                desc="Ollama, LM Studio y vLLM. Cada usuario instala y configura los suyos; la app no los comparte ni los conecta entre cuentas."
                right={
                    <button
                        type="button"
                        onClick={() => localEngines.forEach((e) => void runCheck(e))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors"
                    >
                        <RefreshCw size={12} /> Comprobar todos
                    </button>
                }
            >
                <div className="mb-3 flex flex-col sm:flex-row gap-2">
                    <input
                        value={pullInput}
                        onChange={(e) => setPullInput(e.target.value)}
                        placeholder="modelo a descargar en Ollama (ej. llama3.1:8b)"
                        className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-200 font-mono placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]"
                    />
                    <button
                        type="button"
                        onClick={() => { if (pullInput.trim()) void pullModel(pullInput.trim()); }}
                        disabled={!!pulling || !pullInput.trim()}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        <Download size={12} /> {pulling ? 'Descargando…' : 'Descargar'}
                    </button>
                </div>
                {pullMsg && <p className="text-[11px] text-neutral-400 mb-3 font-mono">{pullMsg}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {localEngines.map((e) => (
                        <EngineCard
                            key={e.id}
                            engine={e}
                            onPatch={(patch) => patchEngine(e.id, patch)}
                            health={health[e.id]}
                            checking={checkingId === e.id}
                            onCheck={() => void runCheck(e)}
                            onSelectModel={(m) => patchEngine(e.id, { model: m })}
                        />
                    ))}
                </div>
                <p className="text-[11px] text-neutral-600 mt-3 flex items-center gap-1"><Cloud size={12} /> Para levantar tu propio servidor local usa el módulo Terminal y Conexión; los endpoints quedan en tu equipo.</p>
            </Section>

            {/* Modelos sueltos en el equipo */}
            <Section
                title="Modelos en tu equipo"
                desc="Detecta archivos .gguf / .safetensors / .bin que ya descargaste (Documents, Downloads, Desktop, LM Studio). Solo lectura; nada se sube."
            >
                <div className="mb-3 flex flex-col sm:flex-row gap-2">
                    <input
                        value={scanDir}
                        onChange={(e) => setScanDir(e.target.value)}
                        placeholder="Carpeta a escanear (vacío = Documentos/Downloads/Desktop)"
                        className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-200 placeholder:text-neutral-600 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]"
                    />
                    <button
                        type="button"
                        onClick={() => void runScan()}
                        disabled={scanning}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        <FolderSearch size={13} /> {scanning ? 'Escaneando…' : 'Buscar modelos'}
                    </button>
                </div>
                {scanMsg && <p className="text-[11px] text-neutral-400 mb-3">{scanMsg}</p>}
                {scanModels.length > 0 && (
                    <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                        {scanModels.map((m) => (
                            <div key={m.path} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                                <FileBox size={14} className="text-[rgb(var(--accent))] shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-neutral-200 font-mono truncate">{m.name}</p>
                                    <p className="text-[10px] text-neutral-600 font-mono truncate">{m.path}</p>
                                </div>
                                <span className="text-[10px] text-neutral-500 shrink-0">{(m.size / 1024 / 1024 / 1024).toFixed(1)} GB</span>
                                <button
                                    type="button"
                                    onClick={() => { void navigator.clipboard?.writeText(m.path); setScanMsg(`Ruta copiada: ${m.name}`); }}
                                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-neutral-300 border border-white/10 hover:border-white/25 transition-colors shrink-0"
                                    title="Copia la ruta para cargarla en LM Studio u Ollama"
                                >
                                    Copiar ruta
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <p className="text-[11px] text-neutral-600 mt-3">
                    Estos archivos necesitan un runtime para responder: Ollama (<code className="font-mono">ollama create</code>), LM Studio (arrástralos a su ventana) o llama.cpp/vLLM. Una vez cargados en tu servidor local aparecen solos en "Servidores locales" y la app los usa en 127.0.0.1 — nunca compartidos entre usuarios.
                </p>
            </Section>
        </div>
    );
};
