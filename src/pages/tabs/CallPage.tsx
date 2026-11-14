import React, { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, PhoneOff, Paperclip, Send, X } from 'lucide-react';
import { useApp } from '../../store';
import { startListening } from '../../voice';
import { speak, startMicRecording, stopMicRecording, transcribeBlob, PIPER_VOICES, onSpeakLevel } from '../../speech';
import { chatCompletion } from '../../ai';
import { APP_CONTEXT, AGENT_ACTIONS_HINT, detectActions, runAction, parseAgentActions, memoryContext } from '../../agent';
import { AttachMenu, Attachment } from '../../components/AttachMenu';
import { permEnabled } from '../../permissions';

const BARS = [38, 62, 84, 55, 72, 90, 48, 66, 80, 52, 70, 88, 44, 60, 78, 58, 74, 92, 50, 68, 82, 56, 71, 87];

interface PendingFile { name: string }

/**
 * Pantalla de Llamada a pantalla completa: el visualizador ocupa casi todo el
 * área (estilo elegido en Apariencia) y los controles quedan en las dos
 * esquinas inferiores: izquierda = voz (mic/silenciar/colgar/altavoz),
 * derecha = escritura + clip para adjuntar.
 */
export const CallPage: React.FC = () => {
    const { state, dispatch } = useApp();
    const style = state.callStyle;
    const [muted, setMuted] = useState(false);
    const [text, setText] = useState('');
    const [note, setNote] = useState('');
    const [listening, setListening] = useState(false);
    const [pending, setPending] = useState<PendingFile | null>(null);
    const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [busy, setBusy] = useState(false);
    const recRef = useRef<{ stop: () => void } | null>(null);
    const [level, setLevel] = useState(0);
    const [aiLevel, setAiLevel] = useState(0);

    const selectedAvatar = state.avatars.find((a) => a.id === state.avatarId);
    const voiceFile = PIPER_VOICES.find((v) => v.file === state.ttsVoiceId)?.file ?? state.ttsVoiceId;

    // Nivel de voz real del micrófono (Web Audio AnalyserNode → RMS).
    // Los visualizadores se animan con este valor: en silencio quedan casi
    // estáticos y reaccionan cuando hay voz. Se respeta el mute.
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
        let stream: MediaStream | null = null;
        let raf = 0;
        let ctx: AudioContext | null = null;
        let dead = false;
        void navigator.mediaDevices.getUserMedia({ audio: true })
            .then((s) => {
                if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
                stream = s;
                ctx = new AudioContext();
                const src = ctx.createMediaStreamSource(s);
                const an = ctx.createAnalyser();
                an.fftSize = 512;
                src.connect(an);
                const buf = new Uint8Array(an.frequencyBinCount);
                const tick = () => {
                    an.getByteTimeDomainData(buf);
                    let sum = 0;
                    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
                    const rms = Math.sqrt(sum / buf.length);
                    setLevel((prev) => {
                        const next = Math.min(1, rms * 4);
                        // Suavizado: sube rápido, baja lento (sensación analógica).
                        return next > prev ? prev + (next - prev) * 0.5 : prev + (next - prev) * 0.15;
                    });
                    raf = requestAnimationFrame(tick);
                };
                tick();
            })
            .catch(() => { /* sin mic: los visualizadores quedan en reposo */ });
        return () => {
            dead = true;
            cancelAnimationFrame(raf);
            stream?.getTracks().forEach((t) => t.stop());
            void ctx?.close().catch(() => {});
        };
    }, []);

    // Nivel de la voz de la IA (TTS local medido con Web Audio).
    useEffect(() => onSpeakLevel(setAiLevel), []);

    // El visualizador reacciona a la voz de la IA; si esta en silencio,
    // cae al nivel del microfono del usuario.
    const lvl = muted ? 0 : Math.max(aiLevel, level * 0.6);
    const barBoost = 0.35 + lvl * 1.1;

    // Colgar: detiene micrófono/escucha, limpia la llamada y vuelve al chat.
    const colgar = () => {
        if (listening) { setListening(false); void stopMicRecording().catch(() => {}); }
        recRef.current?.stop();
        setHistory([]);
        setText('');
        setPending(null);
        setNote('Llamada terminada.');
        dispatch({ type: 'set-tab', tab: 'chat' });
    };

    const dictar = async () => {
        if (!permEnabled('mic')) { setNote('Micrófono bloqueado: actívalo en Sistema → Permisos.'); return; }
        if (window.joyai?.speechStt) {
            if (listening) {
                setListening(false);
                const blob = await stopMicRecording();
                const t = await transcribeBlob(blob);
                if (t) setText(t);
                else setNote('No se entendió el audio. Intenta de nuevo.');
                return;
            }
            try {
                await startMicRecording();
                setListening(true);
                setNote('Grabando… vuelve a pulsar el micrófono para transcribir (whisper local).');
            } catch {
                setNote('Sin acceso al micrófono.');
            }
            return;
        }
        if (listening) { recRef.current?.stop(); setListening(false); return; }
        const rec = startListening('es-ES', {
            onResult: (t) => { if (t) setText(t); },
            onEnd: () => setListening(false),
            onError: () => setListening(false),
        });
        if (rec) { recRef.current = rec; setListening(true); }
        else setNote('STT no soportado en este navegador.');
    };

    const probarVoz = () => { void speak(`Hola, soy ${state.agentName}.`, voiceFile); };

    const attach = (att: Attachment) => {
        setPending({ name: att.name });
        if (att.kind === 'link' && !text.trim()) setText(`Abre ${att.name}`);
    };

    // Motor activo: mismo criterio que Chat (locales siempre; nube con key).
    const usableEngines = state.engines.filter((e) =>
        e.enabled && (
            ['ollama', 'lmstudio', 'vllm'].includes(e.providerType)
            || /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(e.endpoint)
            || !!e.apiKey
        ));
    const activeEngine = usableEngines[0] ?? state.engines.find((e) => e.enabled) ?? state.engines[0];

    const send = async () => {
        const t = text.trim();
        if ((!t && !pending) || busy) return;
        const withFile = pending ? `${t ? t + ' ' : ''}[archivo: ${pending.name}]` : t;
        setText('');
        setPending(null);
        setBusy(true);
        const next = [...history, { role: 'user' as const, content: withFile }];
        setHistory(next);

        // Acciones directas ("abre X", "minimiza", "isla") — igual que Avatar/Chat.
        const directs = detectActions(t);
        if (directs.length) {
            const replies: string[] = [];
            for (const a of directs) {
                const r = await runAction(a).catch((e) => ({ ok: false as const, error: String(e) }));
                replies.push(r.ok ? `Listo, ${a.label}.` : `No pude ${a.label}.`);
            }
            const reply = replies.join(' ');
            setHistory((h) => [...h, { role: 'assistant', content: reply }]);
            setNote(reply);
            void speak(reply, voiceFile).catch(() => {});
            setBusy(false);
            return;
        }

        if (!activeEngine) {
            setNote('No hay motor de IA configurado. Revisa Modelos.');
            setBusy(false);
            return;
        }
        try {
            const reply = await chatCompletion(activeEngine, [
                { role: 'system', content: `${APP_CONTEXT}\n\n${state.agentName} atiende una LLAMADA DE VOZ con el usuario: responde corto, natural y hablable (1-3 frases), sin markdown ni listas — esto se convierte a voz.\n${AGENT_ACTIONS_HINT}${memoryContext()}` },
                ...next,
            ]);
            const parsed = parseAgentActions(reply);
            const spoken = parsed.text || reply;
            setHistory((h) => [...h, { role: 'assistant', content: spoken }]);
            setNote(spoken.slice(0, 90));
            void speak(spoken.slice(0, 600), voiceFile).catch(() => {});
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'error';
            setNote(`No pude responder (${msg}). Revisa Modelos e IA.`);
        } finally {
            setBusy(false);
        }
    };

    const ctrlBtn = (active = false, danger = false) =>
        `p-3.5 rounded-full border transition-all ${
            danger
                ? 'bg-rose-500/90 border-rose-400/60 text-white hover:bg-rose-500 shadow-[0_0_24px_rgba(244,63,94,0.35)]'
                : active
                    ? 'bg-[rgb(var(--accent)/0.2)] border-[rgb(var(--accent)/0.6)] text-[rgb(var(--accent))] shadow-[0_0_20px_rgb(var(--accent)/0.25)]'
                    : 'bg-white/[0.05] border-white/10 text-neutral-300 hover:text-white hover:bg-white/10 backdrop-blur'
        }`;

    return (
        <div className="h-full flex flex-col relative overflow-hidden">
            {/* ── Visualizador gigante ─────────────────────────────────── */}
            <div className="flex-1 flex items-center justify-center relative min-h-0">
                {/* halo de fondo */}
                <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,rgb(var(--accent)/0.10),transparent_70%)]" />

                {style === 'orb' && (
                    <div className="relative flex items-center justify-center">
                        {/* Halo ambiental difuso */}
                        <div className="absolute w-[52vmin] h-[52vmin] rounded-full bg-[rgb(var(--accent)/0.14)] blur-3xl" />
                        {/* Anillo cónico giratorio (vidrio esmerilado) */}
                        <div className="absolute w-[42vmin] h-[42vmin] rounded-full animate-[spin_10s_linear_infinite]"
                            style={{ background: 'conic-gradient(from 0deg, transparent 0%, rgb(var(--accent)) 12%, transparent 26%, transparent 55%, rgb(var(--accent)) 68%, transparent 82%)', WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))', mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))' }} />
                        <div className="absolute w-[34vmin] h-[34vmin] rounded-full border border-white/10" style={{ transform: `scale(${1 + lvl * 0.12})` }} />
                        <div className="absolute w-[26vmin] h-[26vmin] rounded-full bg-gradient-to-b from-white/[0.08] to-transparent backdrop-blur-sm border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_90px_rgb(var(--accent)/0.25)]" style={{ transform: `scale(${1 + lvl * 0.18})` }}>
                            {selectedAvatar
                                ? <img src={selectedAvatar.dataUrl} alt={selectedAvatar.name} className="w-full h-full rounded-full object-cover" />
                                : <span className="text-5xl font-bold text-white/90" style={{ textShadow: '0 0 30px rgb(var(--accent))' }}>{state.agentName.slice(0, 1)}</span>}
                        </div>
                    </div>
                )}

                {style === 'bars' && (
                    <div className="relative flex items-end justify-center gap-[0.45vmin] h-[54vmin]">
                        <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-[rgb(var(--accent)/0.35)] to-transparent" />
                        {BARS.map((h, i) => (
                            <span
                                key={i}
                                className="eq-bar w-[1.1vmin] min-w-[3px] rounded-full bg-gradient-to-t from-[rgb(var(--accent)/0.05)] via-[rgb(var(--accent)/0.55)] to-[rgb(var(--accent))] shadow-[0_0_10px_rgb(var(--accent)/0.35)]"
                                style={{ height: `${Math.min(100, h * barBoost)}%`, animation: `eq ${1.1 + (i % 6) * 0.13}s ease-in-out ${i * 0.05}s infinite` }}
                            />
                        ))}
                    </div>
                )}

                {style === 'wave' && (
                    <div className="relative w-[82vmin] h-[42vmin] flex items-center justify-center" style={{ transform: `scaleY(${0.75 + lvl * 0.6})` }}>
                        <svg viewBox="0 0 800 200" className="w-full h-full overflow-visible">
                            <defs>
                                <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0" />
                                    <stop offset="50%" stopColor="rgb(var(--accent))" stopOpacity="0.9" />
                                    <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            {[0, 1, 2].map((layer) => (
                                <g key={layer}>
                                    <path
                                        d={`M0 ${100 + layer * 16} ${Array.from({ length: 40 }, (_, i) => `Q ${i * 20 + 10} ${100 + layer * 16 + Math.sin(i * 0.9 + layer * 2) * (44 - layer * 9)}, ${i * 20 + 20} ${100 + layer * 16}`).join(' ')}`}
                                        fill="none"
                                        stroke="url(#waveGrad)"
                                        strokeOpacity={0.55 - layer * 0.15}
                                        strokeWidth={3.5 - layer * 0.9}
                                        strokeLinecap="round"
                                        style={{ filter: layer === 0 ? 'blur(1px)' : undefined }}
                                    />
                                </g>
                            ))}
                        </svg>
                        <div className="absolute inset-x-0 bottom-[18%] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    </div>
                )}

                {style === 'lines' && (
                    <div className="relative w-[58vmin] h-[58vmin]" style={{ transform: `scale(${1 + lvl * 0.1})` }}>
                        {/* Tres órbitas de partículas (átomo moderno) */}
                        {[0, 1, 2].map((ring) => (
                            <div key={ring} className="absolute inset-0"
                                style={{ transform: `rotateX(${ring * 55}deg) rotateZ(${ring * 30}deg)`, animation: `spin ${18 + ring * 7}s linear infinite ${ring % 2 ? 'reverse' : ''}` }}>
                                <div className="absolute inset-[8%] rounded-full border border-white/[0.07]" style={{ inset: `${10 + ring * 9}%` }} />
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <span key={i} className="absolute w-[1vmin] min-w-[4px] h-[1vmin] min-h-[4px] rounded-full bg-[rgb(var(--accent))] shadow-[0_0_14px_rgb(var(--accent))]"
                                        style={{ top: '50%', left: '50%', transform: `rotate(${i * 120}deg) translateY(-26vmin)` }} />
                                ))}
                            </div>
                        ))}
                        <div className="absolute inset-[30%] rounded-full bg-[rgb(var(--accent)/0.08)] border border-[rgb(var(--accent)/0.25)] backdrop-blur-sm flex items-center justify-center">
                            {selectedAvatar
                                ? <img src={selectedAvatar.dataUrl} alt={selectedAvatar.name} className="w-[62%] h-[62%] rounded-full object-cover" />
                                : <span className="text-4xl font-bold text-white/90" style={{ textShadow: '0 0 24px rgb(var(--accent))' }}>{state.agentName.slice(0, 1)}</span>}
                        </div>
                    </div>
                )}

                {style === 'holo' && (
                    <div className="relative flex flex-col items-center gap-[2.5vmin]">
                        {/* Nebulosa: blobs de gradiente animados */}
                        <div className="relative w-[46vmin] h-[46vmin]" style={{ transform: `scale(${1 + lvl * 0.1})` }}>
                            <div className="absolute inset-0 rounded-full overflow-hidden">
                                <div className="absolute w-[70%] h-[70%] rounded-full bg-[rgb(var(--accent)/0.35)] blur-3xl animate-[drift1_9s_ease-in-out_infinite]" />
                                <div className="absolute w-[55%] h-[55%] rounded-full bg-[rgb(var(--accent)/0.25)] blur-3xl animate-[drift2_12s_ease-in-out_infinite]" style={{ left: '30%', top: '30%' }} />
                                <div className="absolute w-[40%] h-[40%] rounded-full bg-white/[0.12] blur-2xl animate-[drift3_7s_ease-in-out_infinite]" style={{ left: '45%', top: '20%' }} />
                            </div>
                            <div className="absolute inset-[18%] rounded-full border border-white/10 backdrop-blur-[2px] flex items-center justify-center">
                                {selectedAvatar
                                    ? <img src={selectedAvatar.dataUrl} alt={selectedAvatar.name} className="w-[70%] h-[70%] rounded-full object-cover border border-white/20" />
                                    : <span className="text-4xl font-bold text-white" style={{ textShadow: '0 0 30px rgb(var(--accent))' }}>{state.agentName.slice(0, 1)}</span>}
                            </div>
                        </div>
                        <p className="text-xl sm:text-2xl font-semibold tracking-[0.3em] text-white/80 uppercase" style={{ textShadow: '0 0 20px rgb(var(--accent)/0.6)' }}>
                            {state.agentName}
                        </p>
                    </div>
                )}

                {/* Estado de llamada */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
                    <p className="text-sm text-neutral-300">{muted ? 'Micrófono silenciado' : 'En llamada con'} <span className="text-white font-semibold">{state.agentName}</span></p>
                    <p className="text-[11px] text-neutral-500">{window.joyai?.speechStt ? 'Voz local (Piper/whisper)' : 'Voz del sistema'}</p>
                    {note && <p className="text-[11px] text-neutral-500 max-w-md text-center">{note}</p>}
                </div>
            </div>

            {/* ── Controles inferiores ─────────────────────────────────── */}
            <div className="shrink-0 grid grid-cols-2 gap-3 px-4 sm:px-8 pb-5">
                {/* Izquierda: controles de voz */}
                <div className="flex items-center gap-3 justify-start">
                    <button type="button" onClick={() => setMuted(!muted)} className={ctrlBtn(muted)} aria-label={muted ? 'Activar micrófono' : 'Silenciar'} title={muted ? 'Activar micrófono' : 'Silenciar'}>
                        <Mic size={18} className={muted ? 'opacity-40' : ''} />
                    </button>
                    <button type="button" onClick={probarVoz} className={ctrlBtn()} aria-label="Altavoz" title="Probar voz (TTS)">
                        <Volume2 size={18} />
                    </button>
                    <button type="button" onClick={colgar} className={ctrlBtn(false, true)} aria-label="Colgar" title="Colgar">
                        <PhoneOff size={18} />
                    </button>
                </div>

                {/* Derecha: escritura + adjuntos */}
                <div className="flex items-center gap-2 justify-end">
                    {pending && (
                        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--accent)/0.4)] bg-[rgb(var(--accent)/0.08)] px-2.5 py-1.5 text-[11px] text-neutral-200">
                            <Paperclip size={11} />
                            <span className="max-w-[120px] truncate">{pending.name}</span>
                            <button type="button" onClick={() => setPending(null)} aria-label="Quitar"><X size={11} /></button>
                        </span>
                    )}
                    <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur px-2 py-1.5 w-full max-w-sm">
                        <AttachMenu onSelect={attach} align="right" />
                        <input
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && send()}
                            placeholder={`Escribe o habla con ${state.agentName}…`}
                            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-neutral-100 placeholder:text-neutral-600"
                        />
                        <button
                            type="button"
                            onClick={() => void dictar()}
                            aria-label={listening ? 'Detener dictado' : 'Dictar'}
                            title={listening ? 'Escuchando…' : 'Dictar (STT)'}
                            className={`p-2 rounded-lg transition-colors ${listening ? 'text-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.15)] animate-pulse' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <Mic size={15} />
                        </button>
                        <button
                            type="button"
                            onClick={send}
                            aria-label="Enviar"
                            className="p-2 rounded-lg text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity"
                        >
                            <Send size={15} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
