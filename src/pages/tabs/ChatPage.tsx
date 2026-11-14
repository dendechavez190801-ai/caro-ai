import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Mic, Send, Plus, X, BookOpen, Download } from 'lucide-react';
import { useApp } from '../../store';
import { chatCompletion, checkEngineHealth } from '../../ai';
import { startMicRecording, stopMicRecording, transcribeBlob } from '../../speech';
import { ChatSession, saveSession, sessionTitle, loadSessions } from '../../chats';
import { createNote, loadNotes, saveNotes, downloadText, searchNotes } from '../../vault';
import { detectActions, runAction, AGENT_ACTIONS_HINT, APP_CONTEXT, memoryContext, parseAgentActions, AgentAction, previewUrlForAction } from '../../agent';
import { AttachMenu, Attachment } from '../../components/AttachMenu';
import { AGENT_TONES, loadToneIndex } from '../../agentTone';

interface PendingAction extends AgentAction {
    id: string;
    status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
    result?: string;
}

interface Msg {
    role: 'user' | 'assistant';
    text: string;
    attachment?: Attachment;
    /** Acciones propuestas por la IA (tool-calling nivel 2) — requieren confirmación. */
    actions?: PendingAction[];
}

/** Etiqueta corta del proveedor para el selector del composer. */
const PROVIDER_LABELS: Record<string, string> = {
    openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Anthropic', ollama: 'Ollama',
    lmstudio: 'LM Studio', vllm: 'vLLM', groq: 'Groq', deepseek: 'DeepSeek',
    openrouter: 'OpenRouter', nvidia: 'NVIDIA', custom: 'Personalizado',
};

export const ChatPage: React.FC = () => {
    const { state, dispatch } = useApp();
    // Restaura la conversación más reciente: antes cada apertura creaba un
    // sessionId nuevo y el chat "desaparecía" aunque sí se guardaba en disco.
    const [sessionId, setSessionId] = useState(() => loadSessions()[0]?.id ?? `chat-${Date.now()}`);
    const [msgs, setMsgs] = useState<Msg[]>(() => {
        const last = loadSessions()[0];
        if (last?.messages?.length) {
            return last.messages.map((m) => ({ role: m.role, text: m.text }));
        }
        return [{ role: 'assistant', text: `Hola, soy ${state.agentName}. ¿En qué te ayudo?` }];
    });
    const [text, setText] = useState('');
    const [pendingAttach, setPendingAttach] = useState<Attachment | null>(null);
    const [engineId, setEngineId] = useState('');
    const [loading, setLoading] = useState(false);
    const [recording, setRecording] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    const engines = state.engines;
    // Motores realmente usables: locales siempre; de nube solo con API key.
    // Sin esto el selector mostraba proveedores deshabilitados con modelos
    // que no existen (nombres de plantilla) y el chat fallaba con 404.
    const usableEngines = engines.filter((e) =>
        e.enabled && (
            ['ollama', 'lmstudio', 'vllm'].includes(e.providerType)
            || /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(e.endpoint)
            || !!e.apiKey
        ));
    const activeEngine = engines.find((e) => e.id === engineId)
        ?? usableEngines[0]
        ?? engines.find((e) => e.enabled)
        ?? engines[0];

    // Auto-reparacion: si el motor local activo tiene un modelo que NO esta
    // instalado (ej. el default 'qwen2.5:3b' cuando solo bajaste otros), se
    // cambia solo al primer modelo instalado que reporta el servidor.
    useEffect(() => {
        if (!activeEngine) return;
        const isLocal = ['ollama', 'lmstudio', 'vllm'].includes(activeEngine.providerType)
            || /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(activeEngine.endpoint);
        if (!isLocal || !activeEngine.endpoint) return;
        let cancelled = false;
        void checkEngineHealth(activeEngine).then((h) => {
            if (cancelled || !h.ok || !h.models.length) return;
            if (!h.models.includes(activeEngine.model)) {
                dispatch({ type: 'update-engine', id: activeEngine.id, patch: { model: h.models[0] } });
            }
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [activeEngine?.id, activeEngine?.endpoint, activeEngine?.model, dispatch]);

    // Autoscroll al último mensaje.
    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, [msgs, loading]);

    // Persistencia local del chat (archivo de conversaciones en este equipo).
    useEffect(() => {
        const existing = loadSessions().find((s) => s.id === sessionId);
        const session: ChatSession = {
            id: sessionId,
            title: sessionTitle(msgs.map((m) => ({ role: m.role, text: m.text })), `Chat ${state.agentName}`),
            createdAt: existing?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
            messages: msgs.map((m) => ({ role: m.role, text: m.text })),
        };
        saveSession(session);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [msgs, sessionId]);

    const saveToVault = () => {
        const body = msgs.map((m) => `${m.role === 'user' ? 'Tú' : state.agentName}: ${m.text}`).join('\n\n');
        const note = { ...createNote(sessionTitle(msgs.map((m) => ({ role: m.role, text: m.text })), 'Chat'), body), source: 'chat' as const };
        saveNotes([note, ...loadNotes()]);
    };

    const exportChat = () => {
        const body = msgs.map((m) => `${m.role === 'user' ? '**Tú:**' : `**${state.agentName}:**`} ${m.text}`).join('\n\n');
        downloadText(`${sessionTitle(msgs.map((m) => ({ role: m.role, text: m.text })), 'chat').replace(/[^\wáéíóúñ -]/gi, '_')}.md`, `# Chat con ${state.agentName}\n\n${body}\n`);
    };

    /** Confirma/cancela una acción propuesta por la IA (tool-calling nivel 2). */
    const resolveAction = async (msgIdx: number, actId: string, approve: boolean) => {
        setMsgs((prev) => prev.map((m, i) => i !== msgIdx || !m.actions ? m : {
            ...m,
            actions: m.actions.map((a) => a.id === actId ? { ...a, status: approve ? 'running' : 'cancelled' } : a),
        }));
        if (!approve) return;
        const action = msgs[msgIdx]?.actions?.find((a) => a.id === actId);
        if (!action) return;
        // Acciones web confirmadas por el usuario abren en Vista Previa.
        const prevUrl = previewUrlForAction(action);
        if (prevUrl) {
            dispatch({ type: 'set-preview-url', url: prevUrl });
            dispatch({ type: 'set-tab', tab: 'preview' });
            setMsgs((prev) => prev.map((m, i) => i !== msgIdx || !m.actions ? m : {
                ...m,
                actions: m.actions.map((a) => a.id === actId ? { ...a, status: 'done', result: `Abierto en Vista Previa: ${prevUrl}` } : a),
            }));
            return;
        }
        const r: { ok: boolean; error?: string; output?: string } = await runAction(action)
            .catch((e): { ok: boolean; error?: string; output?: string } => ({ ok: false, error: String(e) }));
        const resultText = r.ok
            ? `✓ ${action.label}: ${action.type === 'shell' ? (r.output ?? 'sin salida').slice(0, 300) : action.target}`
            : `✗ ${action.label} falló: ${r.error ?? 'sin detalle'}`;
        setMsgs((prev) => prev.map((m, i) => i !== msgIdx || !m.actions ? m : {
            ...m,
            actions: m.actions.map((a) => a.id === actId ? { ...a, status: r.ok ? 'done' : 'failed', result: resultText } : a),
        }));
    };

    const send = async () => {
        const t = text.trim();
        if ((!t && !pendingAttach) || loading) return;
        const attachNote = pendingAttach
            ? `[${pendingAttach.kind === 'link' ? 'enlace' : pendingAttach.kind}: ${pendingAttach.name}]`
            : '';
        const content = [t, attachNote].filter(Boolean).join(' ');
        const next = [...msgs, { role: 'user' as const, text: content, attachment: pendingAttach ?? undefined }];
        setMsgs(next);
        setText('');
        setPendingAttach(null);
        setLoading(true);

        // Acciones locales del agente (abrir app/archivo/búsqueda/ventana).
        const actions = detectActions(t);
        if (actions.length) {
            const replies: string[] = [];
            for (const action of actions) {
                // Vista Previa SOLO si el usuario la pidió ("en vista previa",
                // "dentro de la app"); si no, url/search abren en el navegador
                // real del sistema vía osOpen.
                const prev = action.inApp ? previewUrlForAction(action) : null;
                if (prev) {
                    dispatch({ type: 'set-preview-url', url: prev });
                    dispatch({ type: 'set-tab', tab: 'preview' });
                    replies.push(`✓ Abrí ${action.label} en Vista Previa.`);
                    continue;
                }
                const r = await runAction(action);
                const detail = r.output ? `\n${r.output.slice(0, 800)}` : '';
                replies.push(r.ok
                    ? `✓ Ejecuté: ${action.label}.${action.type === 'shot' && r.output ? ` Guardada en: ${r.output}` : detail}`
                    : `Intenté ${action.label} pero falló (${r.error ?? 'sin detalle'}).`);
            }
            setMsgs((m) => [...m, { role: 'assistant', text: replies.join('\n') }]);
            setLoading(false);
            return;
        }
        try {
            if (!activeEngine) throw new Error('No hay motor configurado');
            // Punto 5: la bóveda alimenta a la IA — inyecta notas relevantes al prompt.
            const lastUserText = [...next].reverse().find((m) => m.role === 'user')?.text ?? '';
            const relevant = searchNotes(loadNotes(), lastUserText, 4);
            const vaultCtx = relevant.length
                ? `\n\nNotas relevantes de la bóveda del usuario (úsalas si aportan contexto):\n${relevant.map((n) => `- ${n.title}: ${n.content.slice(0, 300)}`).join('\n')}`
                : '';
            const tonePrompt = AGENT_TONES[loadToneIndex()]?.prompt ?? '';
            const reply = await chatCompletion(activeEngine, [
                { role: 'system', content: `${APP_CONTEXT}\n\n${state.agentName} es el asistente personal de este usuario dentro de CaRo Ai.${tonePrompt ? ` ${tonePrompt}` : ''}\n${AGENT_ACTIONS_HINT}${memoryContext()}${vaultCtx}` },
                ...next.map((m) => ({ role: m.role, content: m.text })),
            ]);
            // Tool-calling nivel 2: la IA propone acciones; el usuario confirma.
            const parsed = parseAgentActions(reply);
            setMsgs((m) => [...m, {
                role: 'assistant',
                text: parsed.text || (parsed.actions.length ? 'Te propongo una acción:' : reply),
                actions: parsed.actions.map((a) => ({ ...a, id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, status: 'pending' as const })),
            }]);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'error';
            setMsgs((m) => [...m, { role: 'assistant', text: `No pude responder con ${activeEngine?.name ?? 'el motor'} (${msg}). Revisa Modelos e IA.` }]);
        } finally {
            setLoading(false);
        }
    };

    const onAttach = (att: Attachment) => {
        setPendingAttach(att);
        if (att.kind === 'link' && !text.trim()) {
            // El enlace queda visible en el composer para que el usuario lo vea/edite.
            setText(`Abre ${att.name}`);
        }
    };

    const toggleMic = async () => {
        if (recording) {
            setRecording(false);
            const blob = await stopMicRecording().catch(() => null);
            if (blob && blob.size > 0) {
                const t = await transcribeBlob(blob).catch(() => null);
                if (t) setText((v) => (v ? `${v} ${t}` : t));
            }
            return;
        }
        setRecording(true);
        await startMicRecording().catch(() => setRecording(false));
    };

    return (
        <div
            className="h-full flex flex-col gap-3 px-4 sm:px-6 py-4 animate-fade-in"
            style={state.chatBgImage ? {
                backgroundImage: `linear-gradient(rgba(5,5,5,0.72), rgba(5,5,5,0.72)), url(${state.chatBgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            } : undefined}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl font-bold text-white">Chat</h1>
                    <p className="text-xs text-neutral-500">Chat con {state.agentName}</p>
                </div>
                <div className="flex items-center gap-2">
                    {usableEngines.length > 0 && (
                        <select
                            value={activeEngine?.id ?? ''}
                            onChange={(e) => setEngineId(e.target.value)}
                            className="px-2 py-1.5 rounded-lg bg-[#141414] border border-white/10 text-[11px] text-neutral-300 outline-none focus:border-[rgb(var(--accent)/0.5)] max-w-[140px]"
                            title="Motor de IA"
                        >
                            {usableEngines.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    )}
                    <button
                        type="button"
                        onClick={() => { setMsgs([{ role: 'assistant', text: `Hola, soy ${state.agentName}. ¿En qué te ayudo?` }]); setSessionId(`chat-${Date.now()}`); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors"
                    >
                        <Plus size={12} /> Nuevo chat
                    </button>
                    <button
                        type="button"
                        onClick={saveToVault}
                        title="Guardar esta conversación en la Bóveda"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors"
                    >
                        <BookOpen size={12} /> Guardar en bóveda
                    </button>
                    <button
                        type="button"
                        onClick={exportChat}
                        title="Descargar conversación en Markdown"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors"
                    >
                        <Download size={12} /> Exportar
                    </button>
                </div>
            </div>

            {/* Mensajes: ocupa todo el ancho y alto disponible. */}
            <div
                ref={listRef}
                className="flex-1 overflow-y-auto rounded-2xl p-4 sm:p-6 flex flex-col gap-3 min-h-0"
                style={state.chatBgImage ? {
                    backgroundImage: `linear-gradient(rgba(8,8,8,0.55), rgba(8,8,8,0.55)), url(${state.chatBgImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                } : undefined}
            >
                {msgs.map((m, i) => (
                    <div key={i} className={`flex flex-col gap-1.5 max-w-[85%] sm:max-w-[70%] ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                        {m.attachment && (
                            <div className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] ${m.role === 'user' ? 'self-end border-white/20 bg-white/10 text-white/80' : 'self-start border-white/10 bg-white/5 text-neutral-400'}`}>
                                <Paperclip size={11} />
                                <span className="truncate max-w-[220px]">{m.attachment.name}</span>
                            </div>
                        )}
                        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'self-end bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]' : 'self-start bg-white/[0.06] text-neutral-200 border border-white/5'}`}>
                            {m.text}
                        </div>
                        {/* Tarjetas de acción propuestas por la IA (confirmación del usuario). */}
                        {m.actions?.map((a) => (
                            <div key={a.id} className={`self-start w-full max-w-md rounded-xl border px-3 py-2.5 text-[11px] ${
                                a.status === 'pending' ? 'border-amber-400/30 bg-amber-400/5'
                                : a.status === 'running' ? 'border-sky-400/30 bg-sky-400/5'
                                : a.status === 'done' ? 'border-emerald-400/30 bg-emerald-400/5'
                                : a.status === 'failed' ? 'border-red-400/30 bg-red-400/5'
                                : 'border-white/10 bg-white/[0.02] opacity-60'
                            }`}>
                                <p className="font-semibold text-neutral-200 mb-0.5">
                                    {a.type === 'shell' ? '⚠ ' : ''}{a.label}: <span className="font-mono text-neutral-400">{a.target.length > 90 ? `${a.target.slice(0, 90)}…` : a.target}</span>
                                </p>
                                {a.result && <p className={`font-mono mb-1.5 ${a.status === 'failed' ? 'text-red-300' : 'text-emerald-300'}`}>{a.result}</p>}
                                {a.status === 'pending' && (
                                    <div className="flex gap-2 mt-1">
                                        <button type="button" onClick={() => void resolveAction(i, a.id, true)} className="px-3 py-1 rounded-md text-[10px] font-semibold text-black bg-emerald-400 hover:bg-emerald-300 transition-colors">Ejecutar</button>
                                        <button type="button" onClick={() => void resolveAction(i, a.id, false)} className="px-3 py-1 rounded-md text-[10px] font-semibold text-neutral-300 bg-white/10 hover:bg-white/15 transition-colors">Cancelar</button>
                                    </div>
                                )}
                                {a.status === 'running' && <p className="text-sky-300">Ejecutando…</p>}
                                {a.status === 'cancelled' && <p className="text-neutral-500">Cancelado por ti.</p>}
                            </div>
                        ))}
                    </div>
                ))}
                {loading && (
                    <div className="self-start rounded-2xl px-4 py-2.5 text-sm bg-white/[0.06] border border-white/5 text-neutral-400">
                        {state.agentName} está escribiendo…
                    </div>
                )}
            </div>

            {/* Adjunto pendiente */}
            {pendingAttach && (
                <div className="flex items-center gap-2 self-start rounded-xl border border-[rgb(var(--accent)/0.4)] bg-[rgb(var(--accent)/0.08)] px-3 py-1.5 text-[11px] text-neutral-200">
                    <Paperclip size={11} className="text-[rgb(var(--accent))]" />
                    <span className="truncate max-w-[260px]">{pendingAttach.name}</span>
                    <button type="button" onClick={() => setPendingAttach(null)} aria-label="Quitar adjunto" className="text-neutral-500 hover:text-white">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Composer grande a todo lo ancho. */}
            <div className="rounded-2xl border border-white/10 bg-[#101010]/90 backdrop-blur p-3 flex items-end gap-2">
                <div className="relative shrink-0">
                    <AttachMenu onSelect={onAttach} />
                </div>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    placeholder={`Escribe tu mensaje o adjunta imagen, audio, archivo, video o enlace para ${state.agentName}`}
                    rows={1}
                    className="flex-1 resize-none bg-transparent outline-none text-[15px] text-neutral-100 placeholder:text-neutral-600 py-2 max-h-40"
                />
                <button
                    type="button"
                    onClick={() => void toggleMic()}
                    aria-label={recording ? 'Detener dictado' : 'Dictar'}
                    title={recording ? 'Detener y transcribir' : 'Dictar por voz'}
                    className={`p-2.5 rounded-xl transition-colors ${recording ? 'text-red-400 bg-red-500/10 animate-pulse' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                >
                    <Mic size={18} />
                </button>
                {usableEngines.length > 1 && activeEngine && (
                    <select
                        value={activeEngine.id}
                        onChange={(e) => setEngineId(e.target.value)}
                        title={`Proveedor/modelo activo: ${PROVIDER_LABELS[activeEngine.providerType] ?? activeEngine.providerType} · ${activeEngine.model}`}
                        className="shrink-0 max-w-[180px] px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-[10px] text-neutral-400 outline-none focus:border-[rgb(var(--accent)/0.5)] truncate"
                    >
                        {usableEngines.map((e) => (
                            <option key={e.id} value={e.id} className="bg-neutral-900">
                                {PROVIDER_LABELS[e.providerType] ?? e.providerType} · {e.model}
                            </option>
                        ))}
                    </select>
                )}
                <button
                    type="button"
                    onClick={() => void send()}
                    disabled={loading || (!text.trim() && !pendingAttach)}
                    aria-label="Enviar"
                    className="p-2.5 rounded-xl text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                    <Send size={17} />
                </button>
            </div>
        </div>
    );
};
