import React, { useRef, useState } from 'react';
import { Send, Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../store';
import { chatCompletion } from '../ai';
import { speak, PIPER_VOICES } from '../speech';

interface Msg { role: 'user' | 'assistant'; text: string }

/**
 * MiniChat (punto 12 del feedback #3): chat contextual compacto para las
 * pestañas que no son Chat principal (Bóveda, Vista Previa, Terminal…).
 * - Colapsable: solo una barra hasta que el usuario lo abre.
 * - `contextNote`: texto extra inyectado al system prompt (ej. notas de la
 *   bóveda visibles, URL actual de Vista Previa).
 * - Responde con el motor activo y puede hablar con la voz configurada.
 */
export const MiniChat: React.FC<{ contextNote?: string; placeholder?: string }> = ({ contextNote, placeholder }) => {
    const { state } = useApp();
    const [open, setOpen] = useState(false);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    const voiceFile = PIPER_VOICES.find((v) => v.file === state.ttsVoiceId)?.file ?? state.ttsVoiceId;

    const send = async () => {
        const t = text.trim();
        if (!t || busy) return;
        const next = [...msgs, { role: 'user' as const, text: t }];
        setMsgs(next);
        setText('');
        setOpen(true);
        setBusy(true);
        try {
            const engine = state.engines.find((e) => e.enabled) ?? state.engines[0];
            if (!engine) throw new Error('sin motor');
            const reply = await chatCompletion(engine, [
                { role: 'system', content: `Eres ${state.agentName}, asistente contextual dentro de CaRo Ai.${contextNote ? ` Contexto actual: ${contextNote}` : ''} Responde corto y útil.` },
                ...next.map((m) => ({ role: m.role, content: m.text })),
            ]);
            setMsgs((m) => [...m, { role: 'assistant', text: reply }]);
            void speak(reply.slice(0, 200), voiceFile).catch(() => {});
        } catch (e) {
            setMsgs((m) => [...m, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'sin respuesta'}` }]);
        } finally {
            setBusy(false);
            setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }), 50);
        }
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 shadow-lg transition-all"
                title="Abrir chat contextual"
            >
                <Bot size={13} /> Chat <ChevronUp size={11} />
            </button>
        );
    }

    return (
        <div className="absolute bottom-3 right-3 z-20 w-[min(92vw,380px)] rounded-2xl border border-white/10 bg-[#141414]/95 backdrop-blur shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                <Bot size={13} className="text-[rgb(var(--accent))]" />
                <span className="flex-1 text-[11px] font-semibold text-neutral-200">{state.agentName} · contexto</span>
                <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-md text-neutral-500 hover:text-white" title="Minimizar"><ChevronDown size={13} /></button>
            </div>
            <div ref={listRef} className="max-h-56 overflow-y-auto p-2.5 flex flex-col gap-2">
                {msgs.length === 0 && (
                    <p className="text-[10px] text-neutral-600">Pregunta sobre lo que ves en esta pantalla.</p>
                )}
                {msgs.map((m, i) => (
                    <div key={i} className={`text-[11.5px] rounded-lg px-2.5 py-1.5 leading-snug ${m.role === 'user' ? 'self-end bg-[rgb(var(--accent)/0.25)] text-white max-w-[85%]' : 'self-start bg-white/[0.05] text-neutral-300 max-w-[85%]'}`}>
                        {m.text}
                    </div>
                ))}
                {busy && <p className="text-[10px] text-neutral-600">pensando…</p>}
            </div>
            <div className="flex items-center gap-1.5 p-2 border-t border-white/5">
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void send()}
                    placeholder={placeholder ?? 'pregunta…'}
                    className="flex-1 min-w-0 bg-transparent outline-none text-xs text-neutral-100 placeholder:text-neutral-600"
                />
                <button type="button" onClick={() => void send()} disabled={busy || !text.trim()}
                    className="p-1.5 rounded-lg text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 disabled:opacity-40">
                    <Send size={12} />
                </button>
            </div>
        </div>
    );
};
