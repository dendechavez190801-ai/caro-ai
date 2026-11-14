import React, { useEffect, useRef, useState } from 'react';
import { Mic, Paperclip, Send, ChevronDown, X } from 'lucide-react';
import { useApp } from '../../store';
import { chatCompletion } from '../../ai';
import { getSystemInfo, SystemInfo } from '../../system';
import { speak, PIPER_VOICES, startMicRecording, stopMicRecording, transcribeBlob } from '../../speech';
import { AttachMenu, Attachment } from '../../components/AttachMenu';
import { AGENT_ACTIONS_HINT, APP_CONTEXT, detectActions, runAction, parseAgentActions, memoryContext } from '../../agent';
import { AGENT_TONES, loadToneIndex } from '../../agentTone';
import { searchNotes, loadNotes } from '../../vault';
import iconUrl from '../../assets/icon.jpg';
import { resolveAvatarScene } from '../../avatarScenes';

interface Msg { role: 'user' | 'assistant'; text: string }

/**
 * Pantalla Avatar a pantalla grande: el avatar ocupa la mayor parte del área,
 * el selector de avatares cargados (Apariencia) queda en la esquina, y abajo
 * un compositor de chat con clip funcional. Las voces y la clonación se
 * configuran en Apariencia.
 */
export const AvatarPage: React.FC = () => {
    const { state, dispatch } = useApp();
    const [info, setInfo] = useState<SystemInfo | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [text, setText] = useState('');
    const [attachName, setAttachName] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [recording, setRecording] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

    const avatar = state.avatars.find((a) => a.id === state.avatarId);
    // Adaptativo (#16): GPU baja/media → avatar 2D ligero sin blur/spin pesados.
    const lightMode = !info || info.gpuTier === 'low' || info.gpuTier === 'mid';
    // Fondo del avatar: escena SVG día/noche (auto por hora local), imagen
    // subida (dataURL) o color sólido — en ese orden de prioridad.
    const sceneUrl = resolveAvatarScene(state.avatarBg);
    const bgImage = sceneUrl ?? (state.avatarBg?.startsWith('data:') ? state.avatarBg : null);
    const bgColor = bgImage || state.avatarBg?.startsWith('scene:') ? undefined : (state.avatarBg ?? undefined);
    // Voz propia del avatar si está definida; si no, la voz general del agente.
    const voiceId = state.avatarVoiceId || state.ttsVoiceId;
    const voiceFile = PIPER_VOICES.find((v) => v.file === voiceId)?.file ?? voiceId;

    useEffect(() => {
        let on = true;
        getSystemInfo().then((s) => { if (on) setInfo(s); }).catch(() => {});
        return () => { on = false; };
    }, []);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, [msgs, loading]);

    useEffect(() => {
        if (!pickerOpen) return;
        const close = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [pickerOpen]);

    const send = async () => {
        const t = text.trim();
        if ((!t && !attachName) || loading) return;
        const content = [t, attachName ? `[archivo: ${attachName}]` : ''].filter(Boolean).join(' ');
        const next = [...msgs, { role: 'user' as const, text: content }];
        setMsgs(next);
        setText('');
        setAttachName(null);
        setLoading(true);
        try {
            const usable = state.engines.filter((e) =>
                e.enabled && (
                    ['ollama', 'lmstudio', 'vllm'].includes(e.providerType)
                    || /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(e.endpoint)
                    || !!e.apiKey
                ));
            const engine = usable[0] ?? state.engines.find((e) => e.enabled) ?? state.engines[0];
            if (!engine) throw new Error('No hay motor configurado');
            // Mismo cerebro que el chat: prompt del agente con acciones,
            // tono del usuario, contexto de la bóveda y parseo de acciones.
            const tonePrompt = AGENT_TONES[loadToneIndex()]?.prompt ?? '';
            const relevant = searchNotes(loadNotes(), t, 4);
            const vaultCtx = relevant.length
                ? `\n\nNotas relevantes de la bóveda del usuario:\n${relevant.map((n) => `- ${n.title}: ${n.content.slice(0, 300)}`).join('\n')}`
                : '';
            // Acciones directas del usuario ("abre X", "busca Y", ventana) — igual que en Chat.
            const directs = detectActions(t);
            if (directs.length) {
                const replies: string[] = [];
                for (const direct of directs) {
                    const r = await runAction(direct).catch((e) => ({ ok: false as const, error: String(e) }));
                    replies.push(r.ok
                        ? `✓ Ejecuté: ${direct.label}.`
                        : `Intenté ${direct.label} pero falló (${r.error ?? 'sin detalle'}).`);
                }
                const reply = replies.join('\n');
                setMsgs((m) => [...m, { role: 'assistant', text: reply }]);
                void speak(reply.slice(0, 300), voiceFile).catch(() => {});
                return;
            }
            const reply = await chatCompletion(engine, [
                { role: 'system', content: `${APP_CONTEXT}\n\n${state.agentName} es el asistente personal de este usuario dentro de CaRo Ai, ahora con avatar visible.${tonePrompt ? ` ${tonePrompt}` : ''}\n${AGENT_ACTIONS_HINT}${memoryContext()}${vaultCtx}` },
                ...next.map((m) => ({ role: m.role, content: m.text })),
            ]);
            const parsed = parseAgentActions(reply);
            setMsgs((m) => [...m, { role: 'assistant', text: parsed.text || reply }]);
            void speak((parsed.text || reply).slice(0, 300), voiceFile).catch(() => {});
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'error';
            setMsgs((m) => [...m, { role: 'assistant', text: `No pude responder (${msg}).` }]);
        } finally {
            setLoading(false);
        }
    };

    const attach = (att: Attachment) => {
        setAttachName(att.name);
        if (att.kind === 'link' && !text.trim()) setText(`Abre ${att.name}`);
    };

    const toggleMic = async () => {
        if (recording) {
            setRecording(false);
            const blob = await stopMicRecording().catch(() => null);
            const t = blob ? await transcribeBlob(blob).catch(() => null) : null;
            if (t) setText(t);
            return;
        }
        setRecording(true);
        await startMicRecording().catch(() => setRecording(false));
    };

    return (
        <div
            className="h-full flex flex-col relative overflow-hidden"
            style={bgImage || bgColor ? {
                backgroundImage: bgImage ? `url(${bgImage})` : undefined,
                backgroundColor: bgColor,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            } : undefined}
        >
            {/* Viñeta para legibilidad sobre fondo personalizado */}
            {bgImage && <div className="absolute inset-0 bg-black/45 pointer-events-none" />}
            {/* ── Avatar gigante ───────────────────────────────────────── */}
            <div className="flex-1 flex items-center justify-center relative min-h-0">
                <div className="absolute inset-0 bg-[radial-gradient(55%_55%_at_50%_50%,rgb(var(--accent)/0.12),transparent_70%)]" />
                <div className="relative flex flex-col items-center gap-4">
                    <div className="relative">
                        {!lightMode && <div className="absolute -inset-8 rounded-full bg-[rgb(var(--accent)/0.12)] blur-3xl animate-pulse" />}
                        {!lightMode && <div className="absolute -inset-4 rounded-full border border-[rgb(var(--accent)/0.25)] animate-[spin_16s_linear_infinite]">
                            <span className="absolute -top-1 left-1/2 w-2 h-2 rounded-full bg-[rgb(var(--accent))] shadow-[0_0_12px_rgb(var(--accent))]" />
                        </div>}
                        <div className="relative w-[38vmin] h-[38vmin] min-w-[220px] min-h-[220px] max-w-[420px] max-h-[420px] rounded-full overflow-hidden border-2 border-[rgb(var(--accent)/0.4)] bg-white/5 flex items-center justify-center shadow-[0_0_90px_rgb(var(--accent)/0.3)]">
                            {avatar ? (
                                <img src={avatar.dataUrl} alt={avatar.name} className="w-full h-full object-cover" />
                            ) : (
                                <img src={iconUrl} alt={state.agentName} className="w-3/4 h-3/4 rounded-full object-cover" />
                            )}
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-lg font-bold text-white">{avatar?.name ?? state.agentName}</p>
                        {info && (
                            <p className="text-[11px] text-neutral-500 mt-0.5">
                                GPU: {info.gpuRenderer.slice(0, 40)}{info.gpuRenderer.length > 40 ? '…' : ''} · nivel: <span className="text-[rgb(var(--accent))]">{info.avatarQuality}</span>
                            </p>
                        )}
                        <p className="text-[10px] text-neutral-600 mt-1 max-w-xs">
                            El avatar actual es 2D animado (CSS): corre en cualquier equipo, incluida tu GPU. Un avatar 3D
                            (Three.js/Live2D) se activaría según el nivel detectado — RTX 30/40/50 y RX 6000/7000 → ultra;
                            gama media → animado fluido; integradas/básicas → 2D ligero.
                        </p>
                        {!avatar && state.avatars.length > 0 && (
                            <p className="text-[11px] text-neutral-500 mt-1">Elige un avatar cargado en el menú de la esquina.</p>
                        )}
                    </div>
                </div>

                {/* Selector de avatares (esquina superior derecha del área) */}
                <div className="absolute top-4 right-4" ref={pickerRef}>
                    <button
                        type="button"
                        onClick={() => setPickerOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-neutral-200 border border-white/15 bg-black/40 backdrop-blur hover:border-[rgb(var(--accent)/0.5)] transition-colors"
                    >
                        Avatares <ChevronDown size={13} className={pickerOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>
                    {pickerOpen && (
                        <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => { dispatch({ type: 'select-avatar', id: null }); setPickerOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-neutral-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                <img src={iconUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                                Predeterminado ({state.agentName})
                            </button>
                            {state.avatars.map((a) => (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => { dispatch({ type: 'select-avatar', id: a.id }); setPickerOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors ${
                                        state.avatarId === a.id ? 'bg-[rgb(var(--accent)/0.12)] text-white' : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <img src={a.dataUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                                    {a.name}
                                </button>
                            ))}
                            {state.avatars.length === 0 && (
                                <p className="px-3 py-2.5 text-[11px] text-neutral-500">Sin avatares. Agrégalos en Apariencia.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Zona inferior: mensajes + compositor (3/4 inferior) ──── */}
            <div className="shrink-0 px-4 sm:px-8 pb-4 flex flex-col gap-2 max-h-[42%]">
                {msgs.length > 0 && (
                    <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 rounded-2xl border border-white/5 bg-black/30 backdrop-blur p-3">
                        {msgs.map((m, i) => (
                            <div key={i} className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'self-end bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]' : 'self-start bg-white/[0.06] text-neutral-200 border border-white/5'}`}>
                                {m.text}
                            </div>
                        ))}
                        {loading && <div className="self-start text-xs text-neutral-500 px-2">{state.agentName} está respondiendo…</div>}
                    </div>
                )}
                <div className="rounded-2xl border border-white/10 bg-[#101010]/90 backdrop-blur p-2 flex items-center gap-2">
                    <AttachMenu onSelect={attach} />
                    {attachName && (
                        <span className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--accent)/0.4)] bg-[rgb(var(--accent)/0.08)] px-2 py-1 text-[10px] text-neutral-200">
                            <Paperclip size={10} />{attachName}
                            <button type="button" onClick={() => setAttachName(null)} aria-label="Quitar"><X size={10} /></button>
                        </span>
                    )}
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void send()}
                        placeholder={`Habla o escribe con ${state.agentName}…`}
                        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-neutral-100 placeholder:text-neutral-600"
                    />
                    <button
                        type="button"
                        onClick={() => void toggleMic()}
                        aria-label={recording ? 'Detener dictado' : 'Dictar'}
                        className={`p-2 rounded-lg transition-colors ${recording ? 'text-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.15)] animate-pulse' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Mic size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => void send()}
                        disabled={loading || (!text.trim() && !attachName)}
                        aria-label="Enviar"
                        className="p-2 rounded-lg text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                        <Send size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
};
