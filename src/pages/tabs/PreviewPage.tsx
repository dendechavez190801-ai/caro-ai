import React, { useEffect, useRef, useState } from 'react';
import { Globe, Mic, Send, Square, MonitorPlay, ExternalLink, Sparkles } from 'lucide-react';
import { useApp } from '../../store';
import { detectAction, runAction, AgentAction, SITE_MAP } from '../../agent';
import { startMicRecording, stopMicRecording, transcribeBlob } from '../../speech';
import { MiniChat } from '../../components/MiniChat';

/**
 * Vista Previa — el "escenario" del agente.
 *
 * Aquí es donde el agente muestra su trabajo: las URLs/apps que abre aparecen
 * en un navegador real embebido (webview de Electron, sesión persist:caro-preview,
 * aislada del resto). Abajo hay una barra tipo chat con texto + micrófono para
 * pedirle acciones sin salir de la vista ("abre YouTube", "busca recetas").
 */

interface FeedItem { id: number; time: string; text: string; ok: boolean }

const inputCls =
    'flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors';

export const PreviewPage: React.FC = () => {
    const { state, dispatch } = useApp();
    const [urlBar, setUrlBar] = useState(state.previewUrl ?? '');
    const [cmd, setCmd] = useState('');
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [recording, setRecording] = useState(false);
    const [busy, setBusy] = useState(false);
    const [pageLoading, setPageLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const webviewRef = useRef<HTMLElement | null>(null);
    const isElectron = !!window.joyai?.shellExec;

    // Sincroniza la barra de direcciones cuando el agente cambia la URL.
    useEffect(() => {
        if (state.previewUrl) setUrlBar(state.previewUrl);
    }, [state.previewUrl]);

    const addFeed = (text: string, ok: boolean) => {
        setFeed((f) => [...f.slice(-30), { id: Date.now(), time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }), text, ok }]);
    };

    /**
     * Navega como un navegador real:
     *  - "https://…" → tal cual
     *  - nombre conocido (youtube, tiktok…) → SITE_MAP
     *  - algo con pinta de dominio (algo.com, algo.com.mx/path) → https://dominio
     *  - cualquier otra cosa → búsqueda en Google dentro del webview
     */
    const navigate = (raw: string) => {
        let u = raw.trim();
        if (!u) return;
        if (!/^https?:\/\//i.test(u)) {
            const lower = u.toLowerCase();
            const key = lower.split('/')[0].split('.')[0];
            if (SITE_MAP[key]) {
                u = SITE_MAP[key];
            } else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(u) && /\.[a-z]{2,}(\/|$|\?)/i.test(u)) {
                u = `https://${u}`;
            } else {
                u = `https://www.google.com/search?q=${encodeURIComponent(u)}`;
            }
        }
        dispatch({ type: 'set-preview-url', url: u });
        setUrlBar(u);
        addFeed(`Vista previa → ${u}`, true);
    };

    /** Ejecuta una acción del agente: URLs navegan aquí; apps/archivos van al SO. */
    const execAction = async (a: AgentAction) => {
        if (a.type === 'url' || a.type === 'search') {
            navigate(a.target);
            return;
        }
        if (a.type === 'app') {
            // Si el "app" es un sitio conocido, lo mostramos aquí; si no, al SO.
            const key = a.target.toLowerCase().replace(/\s+/g, '');
            if (SITE_MAP[key]) {
                navigate(SITE_MAP[key]);
                return;
            }
        }
        const r = await runAction(a).catch((e) => ({ ok: false, error: String(e) }));
        addFeed(`${a.label}: ${a.target} — ${r.ok ? 'hecho' : `falló (${r.error ?? 'error'})`}`, r.ok);
    };

    const sendCommand = async (raw?: string) => {
        const t = (raw ?? cmd).trim();
        if (!t || busy) return;
        setCmd('');
        setBusy(true);
        const action = detectAction(t);
        if (action) {
            await execAction(action);
        } else {
            // Sin acción directa: si parece URL/dominio, navegar; si no, buscar.
            if (/^https?:\/\/\S+$/i.test(t) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) {
                navigate(t);
            } else {
                navigate(`https://www.google.com/search?q=${encodeURIComponent(t)}`);
            }
        }
        setBusy(false);
    };

    const toggleMic = async () => {
        if (recording) {
            setRecording(false);
            const blob = await stopMicRecording().catch(() => null);
            if (blob && blob.size > 0) {
                const text = await transcribeBlob(blob).catch(() => null);
                if (text) setCmd(text);
            }
        } else {
            setRecording(true);
            await startMicRecording().catch(() => setRecording(false));
        }
    };

    const goUrl = () => { if (urlBar.trim()) navigate(urlBar); };

    // Eventos del webview: carga y errores de navegación (páginas en blanco).
    useEffect(() => {
        const wv = webviewRef.current as unknown as {
            addEventListener?: (t: string, fn: (...a: unknown[]) => void) => void;
            removeEventListener?: (t: string, fn: (...a: unknown[]) => void) => void;
            reload?: () => void;
        } | null;
        if (!wv?.addEventListener) return;
        const onStart = () => { setPageLoading(true); setLoadError(null); };
        const onStop = () => setPageLoading(false);
        const onFail = (_e: unknown, code: number, desc: string, url: string, isMainFrame: boolean) => {
            if (!isMainFrame || code === -3) return; // -3 = carga abortada por otra navegación
            setPageLoading(false);
            setLoadError(`${desc || 'Error de carga'} (${code})`);
            addFeed(`Error cargando ${url}: ${desc || code}`, false);
        };
        wv.addEventListener('did-start-loading', onStart);
        wv.addEventListener('did-stop-loading', onStop);
        wv.addEventListener('did-fail-load', onFail as EventListener);
        return () => {
            wv.removeEventListener('did-start-loading', onStart);
            wv.removeEventListener('did-stop-loading', onStop);
            wv.removeEventListener('did-fail-load', onFail as EventListener);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.previewUrl]);

    const reloadPage = () => {
        const wv = webviewRef.current as unknown as {
            addEventListener?: (t: string, fn: (...a: unknown[]) => void) => void;
            removeEventListener?: (t: string, fn: (...a: unknown[]) => void) => void;
            reload?: () => void;
        } | null;
        wv?.reload?.();
    };

    return (
        <div className="h-full flex flex-col min-h-0 relative">
            {/* Barra de dirección */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
                <Globe size={15} className="text-[rgb(var(--accent))] shrink-0" />
                <input
                    value={urlBar}
                    onChange={(e) => setUrlBar(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && goUrl()}
                    placeholder="Escribe una URL o sitio (youtube, tiktok.com…)"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]"
                />
                <button
                    type="button" onClick={goUrl}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity"
                >Ir</button>
                {state.previewUrl && (
                    <button
                        type="button" onClick={() => window.joyai?.openExternal?.(state.previewUrl!)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                        title="Abrir en el navegador del sistema"
                    >
                        <ExternalLink size={14} />
                    </button>
                )}
            </div>

            {/* Escenario */}
            <div className="flex-1 min-h-0 relative bg-black/40">
                {isElectron ? (
                    <>
                        <webview
                            key={state.previewUrl ?? 'about:blank'}
                            ref={(el) => { webviewRef.current = el as unknown as HTMLElement | null; }}
                            src={state.previewUrl ?? 'about:blank'}
                            partition="persist:caro-preview"
                            allowpopups
                            className="w-full h-full bg-white"
                        />
                        {pageLoading && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/70 border border-white/10 text-[10px] text-neutral-300 backdrop-blur">
                                Cargando…
                            </div>
                        )}
                        {loadError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-sm p-6 text-center">
                                <Globe size={28} className="text-red-400/70" />
                                <p className="text-sm text-neutral-300">No se pudo cargar la página</p>
                                <p className="text-xs text-neutral-500 font-mono max-w-md">{loadError}</p>
                                <div className="flex gap-2">
                                    <button type="button" onClick={reloadPage}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/15">Reintentar</button>
                                    {state.previewUrl && (
                                        <button type="button" onClick={() => navigate(`https://www.google.com/search?q=${encodeURIComponent(state.previewUrl ?? '')}`)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] hover:opacity-90">Buscar en Google</button>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-500 p-8 text-center">
                        <MonitorPlay size={40} className="opacity-40" />
                        <p className="text-sm">La Vista Previa con navegador real funciona en la app de escritorio (Electron).</p>
                        <p className="text-xs">En el navegador web las acciones de URL se abren en pestañas externas.</p>
                    </div>
                )}
                {!state.previewUrl && isElectron && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
                        <div className="w-16 h-16 rounded-2xl bg-[rgb(var(--accent)/0.12)] border border-[rgb(var(--accent)/0.3)] flex items-center justify-center">
                            <Sparkles size={26} className="text-[rgb(var(--accent))]" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-semibold text-white">{state.agentName} está listo</p>
                            <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                                Pide abajo algo como «abre YouTube», «busca recetas» o escribe una URL.
                                Todo lo que el agente abra aparecerá aquí.
                            </p>
                        </div>
                    </div>
                )}
                <MiniChat
                    contextNote={`estás en Vista Previa${state.previewUrl ? ` viendo ${state.previewUrl}` : ' sin página abierta'}`}
                    placeholder="pregunta sobre esta página…"
                />
            </div>

            {/* Feed de actividad del agente */}
            {feed.length > 0 && (
                <div className="shrink-0 max-h-24 overflow-y-auto px-4 py-2 border-t border-white/5 space-y-1">
                    {feed.slice(-6).reverse().map((f) => (
                        <p key={f.id} className={`text-[11px] font-mono ${f.ok ? 'text-emerald-300/80' : 'text-red-300/80'}`}>
                            <span className="text-neutral-600">{f.time}</span> {f.text}
                        </p>
                    ))}
                </div>
            )}

            {/* Barra de comandos (tipo chat) */}
            <div className="shrink-0 px-4 py-3 border-t border-white/5">
                <div className="flex items-center gap-2 max-w-4xl mx-auto">
                    <button
                        type="button" onClick={() => void toggleMic()}
                        className={`p-2.5 rounded-xl border transition-colors ${recording ? 'border-red-400/50 bg-red-500/10 text-red-300' : 'border-white/10 text-neutral-300 hover:border-white/25'}`}
                        title={recording ? 'Detener y transcribir' : 'Hablar'}
                    >
                        {recording ? <Square size={15} /> : <Mic size={15} />}
                    </button>
                    <input
                        value={cmd}
                        onChange={(e) => setCmd(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void sendCommand(); }}
                        placeholder={recording ? 'Escuchando…' : `Pídele a ${state.agentName}: "abre YouTube", "busca…", una URL…`}
                        className={inputCls}
                    />
                    <button
                        type="button" onClick={() => void sendCommand()} disabled={busy || !cmd.trim()}
                        className="p-2.5 rounded-xl bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] hover:opacity-90 transition-opacity disabled:opacity-40"
                        title="Enviar"
                    >
                        <Send size={15} />
                    </button>
                </div>
                <p className="text-[10px] text-neutral-600 text-center mt-1.5">
                    Sesión web aislada (<code>persist:caro-preview</code>) — no comparte cookies con tus otras cuentas.
                </p>
            </div>
        </div>
    );
};
