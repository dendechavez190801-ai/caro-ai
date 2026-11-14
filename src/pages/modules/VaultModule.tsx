import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, Download, FileUp, Plus, Search, Trash2, Clock } from 'lucide-react';
import { Section, Card, Pill } from '../../components/ui';
import {
    VaultNote, loadNotes, saveNotes, createNote, expiredNotes,
    noteToMarkdown, markdownToNote, downloadText, RETENTION_MS,
} from '../../vault';
import {
    ChatSession, loadSessions, deleteSession, expiredSessions, sessionToMarkdown,
} from '../../chats';

const inputCls =
    'w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors';

function fmtDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Bóveda: notas y memorias locales estilo Obsidian. Importa .md/.txt,
 * exporta .md, y avisa cuando una nota supera el lapso de retención (6 meses)
 * para que el usuario decida conservarla o eliminarla.
 */
export const VaultModule: React.FC = () => {
    const [notes, setNotes] = useState<VaultNote[]>(loadNotes);
    const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [retentionChoice, setRetentionChoice] = useState<Record<string, 'keep' | 'delete'>>({});
    const importRef = useRef<HTMLInputElement>(null);

    const active = notes.find((n) => n.id === activeId) ?? null;
    const expired = useMemo(() => expiredNotes(notes), [notes]);
    const expiredChats = useMemo(() => expiredSessions(sessions, RETENTION_MS), [sessions]);

    const persist = (next: VaultNote[]) => { setNotes(next); saveNotes(next); };

    const patchActive = (patch: Partial<VaultNote>) => {
        if (!active) return;
        persist(notes.map((n) => (n.id === active.id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
    };

    const newNote = () => {
        const n = createNote();
        persist([n, ...notes]);
        setActiveId(n.id);
    };

    const deleteNote = (id: string) => {
        persist(notes.filter((n) => n.id !== id));
        if (activeId === id) setActiveId(null);
    };

    const exportAll = () => {
        const payload = { exportedAt: new Date().toISOString(), notes };
        downloadText(`caroai-boveda-${Date.now()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    };

    const exportNote = (n: VaultNote) => {
        downloadText(`${n.title.replace(/[^\wáéíóúñ -]/gi, '_')}.md`, noteToMarkdown(n));
    };

    const importFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        const imported: VaultNote[] = [];
        for (const f of Array.from(files)) {
            const text = await f.text();
            if (/\.(md|markdown|txt)$/i.test(f.name)) {
                imported.push(markdownToNote(f.name, text));
            } else if (/\.json$/i.test(f.name)) {
                try {
                    const parsed = JSON.parse(text);
                    const arr = Array.isArray(parsed) ? parsed : parsed.notes;
                    if (Array.isArray(arr)) {
                        for (const n of arr) {
                            if (n && typeof n.title === 'string') {
                                imported.push({ ...createNote(n.title, n.content ?? ''), tags: n.tags ?? [], source: 'import' });
                            }
                        }
                    }
                } catch { /* json inválido: se ignora */ }
            }
        }
        if (imported.length) persist([...imported, ...notes]);
    };

    const filtered = notes.filter((n) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q));
    });

    const resolveExpired = () => {
        const del = expired.filter((n) => retentionChoice[n.id] === 'delete').map((n) => n.id);
        if (del.length) persist(notes.filter((n) => !del.includes(n.id)));
        setRetentionChoice({});
    };

    return (
        <div className="flex flex-col gap-5">
            <Section
                title="Bóveda"
                desc="Notas y memorias guardadas solo en este equipo (estilo Obsidian). Nada se sube a ningún servidor."
                right={
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => importRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-white/10 hover:border-white/20 transition-colors">
                            <FileUp size={12} /> Importar
                        </button>
                        <button type="button" onClick={exportAll} disabled={!notes.length} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-white/10 hover:border-white/20 transition-colors disabled:opacity-40">
                            <Download size={12} /> Exportar todo
                        </button>
                        <button type="button" onClick={newNote} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity">
                            <Plus size={12} /> Nueva nota
                        </button>
                    </div>
                }
            >
                <input ref={importRef} type="file" multiple accept=".md,.markdown,.txt,.json" className="hidden" onChange={(e) => { void importFiles(e.target.files); e.target.value = ''; }} />

                {/* Aviso de retención */}
                {expired.length > 0 && (
                    <Card className="mb-4 border-amber-400/25 bg-amber-400/[0.06]">
                        <div className="flex items-start gap-2.5">
                            <Clock size={15} className="text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-white">{expired.length} nota{expired.length > 1 ? 's' : ''} supera{expired.length > 1 ? 'n' : ''} el lapso de retención</p>
                                <p className="text-[11px] text-neutral-400 mt-0.5">
                                    Estas notas llevan más de {Math.round(RETENTION_MS / (24 * 3600 * 1000))} días sin tocarse. Conserva o elimina cada una:
                                </p>
                                <div className="mt-2 flex flex-col gap-1.5">
                                    {expired.slice(0, 8).map((n) => (
                                        <div key={n.id} className="flex items-center gap-2 text-xs">
                                            <span className="text-neutral-300 truncate flex-1">{n.title}</span>
                                            <button type="button" onClick={() => setRetentionChoice((c) => ({ ...c, [n.id]: 'keep' }))} className={`px-2 py-0.5 rounded border text-[10px] ${retentionChoice[n.id] === 'keep' ? 'border-emerald-400/50 text-emerald-300 bg-emerald-400/10' : 'border-white/10 text-neutral-400'}`}>Conservar</button>
                                            <button type="button" onClick={() => setRetentionChoice((c) => ({ ...c, [n.id]: 'delete' }))} className={`px-2 py-0.5 rounded border text-[10px] ${retentionChoice[n.id] === 'delete' ? 'border-rose-400/50 text-rose-300 bg-rose-400/10' : 'border-white/10 text-neutral-400'}`}>Eliminar</button>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={resolveExpired} className="mt-2.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-400/90 text-black hover:bg-amber-300 transition-colors">
                                    Aplicar decisiones
                                </button>
                            </div>
                        </div>
                    </Card>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
                    {/* Lista */}
                    <div className="flex flex-col gap-2 min-h-[300px]">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
                            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en la bóveda…" className={`${inputCls} pl-8`} />
                        </div>
                        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 max-h-[55vh]">
                            {filtered.length === 0 && (
                                <p className="text-xs text-neutral-600 text-center py-8">
                                    {notes.length === 0 ? 'Bóveda vacía. Crea tu primera nota o importa archivos.' : 'Sin resultados.'}
                                </p>
                            )}
                            {filtered.map((n) => (
                                <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => setActiveId(n.id)}
                                    className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                                        activeId === n.id ? 'border-[rgb(var(--accent)/0.5)] bg-[rgb(var(--accent)/0.08)]' : 'border-white/5 bg-white/[0.02] hover:border-white/15'
                                    }`}
                                >
                                    <p className="text-[13px] font-medium text-neutral-100 truncate">{n.title}</p>
                                    <p className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-2">
                                        <span>{fmtDate(n.updatedAt)}</span>
                                        <span className="text-neutral-600">·</span>
                                        <span>{n.source === 'import' ? 'importada' : n.source === 'chat' ? 'chat' : 'manual'}</span>
                                        {expiredNotes([n]).length > 0 && <Clock size={9} className="text-amber-400" />}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Editor */}
                    <Card className="flex flex-col gap-3 min-h-[300px]">
                        {!active ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-10">
                                <BookOpen size={22} className="text-neutral-600" />
                                <p className="text-sm text-neutral-500">Selecciona una nota o crea una nueva.</p>
                                <button type="button" onClick={newNote} className="text-xs text-[rgb(var(--accent))] hover:underline">Crear nota</button>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-2">
                                    <input
                                        value={active.title}
                                        onChange={(e) => patchActive({ title: e.target.value })}
                                        className={`${inputCls} font-semibold`}
                                        placeholder="Título"
                                    />
                                    <button type="button" onClick={() => deleteNote(active.id)} aria-label="Eliminar nota" className="p-2 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 transition-colors shrink-0">
                                        <Trash2 size={15} />
                                    </button>
                                    <button type="button" onClick={() => exportNote(active)} aria-label="Exportar nota" className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition-colors shrink-0">
                                        <Download size={15} />
                                    </button>
                                </div>
                                <input
                                    value={active.tags.join(', ')}
                                    onChange={(e) => patchActive({ tags: e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean) })}
                                    className={`${inputCls} text-xs`}
                                    placeholder="Etiquetas separadas por coma"
                                />
                                <textarea
                                    value={active.content}
                                    onChange={(e) => patchActive({ content: e.target.value })}
                                    placeholder="Escribe tu nota aquí… (Markdown básico soportado)"
                                    className={`${inputCls} flex-1 min-h-[220px] font-mono text-[13px] leading-relaxed resize-y`}
                                />
                                <div className="flex items-center justify-between text-[10px] text-neutral-600">
                                    <Pill>{active.source === 'import' ? 'Importada' : active.source === 'chat' ? 'Desde chat' : 'Manual'}</Pill>
                                    <span>Actualizada {fmtDate(active.updatedAt)}</span>
                                </div>
                            </>
                        )}
                    </Card>
                </div>
            </Section>

            {/* ── Archivo de conversaciones ─────────────────────────── */}
            <Section
                title="Archivo de conversaciones"
                desc="Chats guardados automáticamente en este equipo. Se conservan 6 meses; luego la bóveda te pide decidir."
                right={
                    sessions.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => downloadText(`caroai-chats-${Date.now()}.json`, JSON.stringify(sessions, null, 2), 'application/json')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-white/10 hover:border-white/20 transition-colors"
                        >
                            <Download size={12} /> Exportar chats
                        </button>
                    ) : undefined
                }
            >
                {expiredChats.length > 0 && (
                    <Card className="mb-4 border-amber-400/25 bg-amber-400/[0.06]">
                        <div className="flex items-start gap-2.5">
                            <Clock size={15} className="text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-white">{expiredChats.length} conversación{expiredChats.length > 1 ? 'es' : ''} supera{expiredChats.length > 1 ? 'n' : ''} el lapso de retención</p>
                                <p className="text-[11px] text-neutral-400 mt-0.5">
                                    {expiredChats.slice(0, 5).map((s) => s.title).join(' · ')}
                                </p>
                                <div className="flex gap-2 mt-2">
                                    <button type="button" onClick={() => { expiredChats.forEach((s) => deleteSession(s.id)); setSessions(loadSessions()); }} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-400/90 text-black hover:bg-amber-300 transition-colors">Eliminar vencidas</button>
                                    <button type="button" onClick={() => setSessions(loadSessions())} className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors">Conservar todas</button>
                                </div>
                            </div>
                        </div>
                    </Card>
                )}
                {sessions.length === 0 ? (
                    <p className="text-xs text-neutral-600 text-center py-6">Aún no hay conversaciones guardadas. Los chats se archivan solos al usarlos.</p>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {sessions.slice(0, 20).map((s) => (
                            <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-neutral-200 truncate">{s.title}</p>
                                    <p className="text-[10px] text-neutral-600">{s.messages.length} mensajes · {fmtDate(s.updatedAt)}</p>
                                </div>
                                <button type="button" onClick={() => downloadText(`${s.title.replace(/[^\wáéíóúñ -]/gi, '_')}.md`, sessionToMarkdown(s))} className="p-1.5 text-neutral-500 hover:text-white transition-colors" aria-label="Exportar chat">
                                    <Download size={13} />
                                </button>
                                <button type="button" onClick={() => { deleteSession(s.id); setSessions(loadSessions()); }} className="p-1.5 text-neutral-500 hover:text-rose-400 transition-colors" aria-label="Eliminar chat">
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
};
