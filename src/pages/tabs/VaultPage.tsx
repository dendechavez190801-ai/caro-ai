import React, { useMemo, useRef, useState } from 'react';
import {
    BookOpen, Brain, ChevronDown, ChevronRight, Download, FileText, FileUp,
    Folder, FolderPlus, MessageSquare, Plus, Save, Search, Trash2, X,
} from 'lucide-react';
import {
    VaultNote, VaultNoteType, VaultAttachment, loadNotes, saveNotes, createNote,
    loadFolders, saveFolders, noteToMarkdown, downloadText,
} from '../../vault';
import {
    ChatSession, loadSessions, deleteSession, sessionToMarkdown,
} from '../../chats';
import { MiniChat } from '../../components/MiniChat';

const inputCls =
    'w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors';

/** Paleta para tipos de nota arbitrarios (texto libre): hash estable → color. */
const TYPE_PALETTE = ['#60a5fa', '#fbbf24', '#34d399', '#c084fc', '#fb7185', '#22d3ee', '#a3e635', '#f97316'];
const TYPE_COLORS: Record<string, string> = {
    nota: '#60a5fa', idea: '#fbbf24', referencia: '#34d399', documento: '#c084fc',
};
function typeColor(type?: string): string {
    if (!type) return TYPE_COLORS.nota;
    if (TYPE_COLORS[type]) return TYPE_COLORS[type];
    let h = 0;
    for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
    return TYPE_PALETTE[h % TYPE_PALETTE.length];
}

function fmtDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Lee un archivo a base64 para guardarlo como adjunto local. */
function fileToAttachment(f: File): Promise<VaultAttachment> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result ?? '');
            resolve({
                name: f.name,
                mime: f.type || 'application/octet-stream',
                data: dataUrl.split(',')[1] ?? '',
                size: f.size,
            });
        };
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(f);
    });
}

/** Grafo "cerebro": notas como nodos clicables, aristas por etiquetas compartidas. */
const BrainGraph: React.FC<{ notes: VaultNote[]; onSelect?: (n: VaultNote) => void }> = ({ notes, onSelect }) => {
    const nodes = useMemo(() => {
        const visible = notes.slice(0, 60);
        const cx = 210, cy = 105;
        return visible.map((n, i) => {
            const angle = (i / Math.max(visible.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const radius = 30 + (i % 3) * 28;
            return {
                note: n,
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius * 0.85,
                r: 5 + Math.min(n.content.length / 400, 6),
            };
        });
    }, [notes]);

    const edges = useMemo(() => {
        const out: [number, number][] = [];
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const shared = nodes[i].note.tags.filter((t) => nodes[j].note.tags.includes(t));
                if (shared.length) out.push([i, j]);
                if (out.length > 80) return out;
            }
        }
        return out;
    }, [nodes]);

    if (notes.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-neutral-600 text-xs">
                El cerebro se llena conforme guardas notas con etiquetas.
            </div>
        );
    }
    return (
        <svg viewBox="0 0 420 210" className="w-full h-full" role="img" aria-label="Grafo del conocimiento">
            {edges.map(([a, b], i) => (
                <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
                    stroke="rgb(var(--accent))" strokeOpacity="0.15" strokeWidth="1" />
            ))}
            {nodes.map((nd) => (
                <g key={nd.note.id} onClick={() => onSelect?.(nd.note)} className="cursor-pointer">
                    <circle cx={nd.x} cy={nd.y} r={nd.r + 6} fill={typeColor(nd.note.type)} fillOpacity="0" />
                    <circle cx={nd.x} cy={nd.y} r={nd.r + 4} fill={typeColor(nd.note.type)} fillOpacity="0.12" />
                    <circle cx={nd.x} cy={nd.y} r={nd.r} fill={typeColor(nd.note.type)} fillOpacity="0.85">
                        <title>{nd.note.title}</title>
                    </circle>
                    <text x={nd.x} y={nd.y + nd.r + 10} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.45)" className="pointer-events-none select-none">
                        {nd.note.title.length > 14 ? `${nd.note.title.slice(0, 13)}…` : nd.note.title}
                    </text>
                </g>
            ))}
        </svg>
    );
};

interface DraftNote {
    title: string;
    /** Tipo libre definido por el usuario (texto, no catálogo fijo). */
    type: string;
    folder: string;
    tags: string;
    content: string;
    attachments: VaultAttachment[];
}

const emptyDraft = (folder = ''): DraftNote => ({ title: '', type: '', folder, tags: '', content: '', attachments: [] });

/**
 * Bóveda a pantalla completa estilo Obsidian: árbol de carpetas a la
 * izquierda, cerebro (grafo) + editor con guardado explícito a la derecha,
 * y "Archivos y conversaciones" como menú compacto.
 */
export const VaultPage: React.FC = () => {
    const [notes, setNotes] = useState<VaultNote[]>(loadNotes);
    const [folders, setFolders] = useState<string[]>(loadFolders);
    const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [chatsOpen, setChatsOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [draft, setDraft] = useState<DraftNote>(emptyDraft());
    const [dirty, setDirty] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [newFolderName, setNewFolderName] = useState<string | null>(null);
    /** true = editor visible sobre el cerebro; false = solo cerebro grande (estilo Obsidian tras guardar). */
    const [editorOpen, setEditorOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const active = notes.find((n) => n.id === activeId) ?? null;

    const persist = (next: VaultNote[]) => { setNotes(next); saveNotes(next); };
    const persistFolders = (next: string[]) => { setFolders(next); saveFolders(next); };

    /** Todas las carpetas: las explícitas + las que usan las notas. */
    const allFolders = useMemo(() => {
        const set = new Set(folders);
        notes.forEach((n) => { if (n.folder) set.add(n.folder); });
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }, [folders, notes]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return notes
            .filter((n) => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q)))
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }, [notes, query]);

    const byFolder = useMemo(() => {
        const map = new Map<string, VaultNote[]>();
        filtered.forEach((n) => {
            const f = n.folder ?? '';
            if (!map.has(f)) map.set(f, []);
            map.get(f)!.push(n);
        });
        return map;
    }, [filtered]);

    const openNote = (n: VaultNote) => {
        setActiveId(n.id);
        setDraft({
            title: n.title,
            type: n.type ?? '',
            folder: n.folder ?? '',
            tags: n.tags.join(', '),
            content: n.content,
            attachments: n.attachments ?? [],
        });
        setDirty(false);
        setEditorOpen(true);
    };

    const saveActive = () => {
        if (!active) return;
        persist(notes.map((n) => n.id === active.id ? {
            ...n,
            title: draft.title.trim() || 'Nota sin título',
            type: draft.type.trim() || undefined,
            folder: draft.folder || undefined,
            tags: draft.tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
            content: draft.content,
            attachments: draft.attachments,
            updatedAt: Date.now(),
        } : n));
        setDirty(false);
        setSavedFlash(true);
        // Tras guardar el editor se cierra y el cerebro vuelve a pantalla completa.
        setEditorOpen(false);
        setTimeout(() => setSavedFlash(false), 1600);
    };

    const deleteNote = (id: string) => {
        persist(notes.filter((n) => n.id !== id));
        if (activeId === id) { setActiveId(null); setDraft(emptyDraft()); setDirty(false); }
    };

    const createFolder = () => {
        const name = (newFolderName ?? '').trim();
        if (!name) return;
        if (!allFolders.includes(name)) persistFolders([...folders, name].sort((a, b) => a.localeCompare(b, 'es')));
        setNewFolderName(null);
    };

    const deleteFolder = (name: string) => {
        // Las notas de la carpeta pasan a la raíz; la carpeta desaparece.
        persist(notes.map((n) => n.folder === name ? { ...n, folder: undefined } : n));
        persistFolders(folders.filter((f) => f !== name));
    };

    const openNewModal = (folder = '') => {
        setDraft(emptyDraft(folder));
        setModalOpen(true);
    };

    const saveNewNote = () => {
        const n = createNote(draft.title.trim() || 'Nota sin título', draft.content, {
            folder: draft.folder || undefined,
            type: draft.type.trim() || undefined,
            tags: draft.tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
            attachments: draft.attachments,
        });
        persist([n, ...notes]);
        setModalOpen(false);
        setActiveId(n.id);
        setDraft(emptyDraft());
        setEditorOpen(false);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1600);
    };

    const addFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        const accepted = Array.from(files).filter((f) =>
            /\.(pdf|png|jpe?g|gif|webp|txt|md)$/i.test(f.name) || f.type.startsWith('image/') || f.type === 'application/pdf');
        for (const f of accepted) {
            try {
                const att = await fileToAttachment(f);
                // Límite localStorage ~5MB: avisa si el adjunto es muy grande.
                if (att.data.length > 3_500_000) {
                    alert(`"${f.name}" pesa ${fmtSize(f.size)}; demasiado grande para la bóveda local. Usa un archivo menor a ~2.5 MB.`);
                    continue;
                }
                setDraft((d) => ({ ...d, attachments: [...d.attachments, att] }));
            } catch { /* archivo ilegible: se omite */ }
        }
        if (fileRef.current) fileRef.current.value = '';
    };

    const removeAttachment = (name: string) => {
        setDraft((d) => ({ ...d, attachments: d.attachments.filter((a) => a.name !== name) }));
    };

    const exportNote = (n: VaultNote) => downloadText(`${n.title.replace(/[^\wáéíóúñ -]/gi, '_')}.md`, noteToMarkdown(n));
    const exportAll = () => downloadText(`caroai-boveda-${Date.now()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), notes }, null, 2), 'application/json');

    const attachmentUrl = (a: VaultAttachment) => `data:${a.mime};base64,${a.data}`;

    const NoteRow: React.FC<{ n: VaultNote }> = ({ n }) => (
        <button
            type="button"
            onClick={() => openNote(n)}
            className={`w-full text-left rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-2 ${
                activeId === n.id ? 'bg-[rgb(var(--accent)/0.12)] text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
            }`}
        >
            <FileText size={12} className="shrink-0 opacity-60" />
            <span className="text-xs truncate flex-1">{n.title}</span>
            <span className="text-[9px] text-neutral-600 shrink-0">{fmtDate(n.updatedAt)}</span>
        </button>
    );

    return (
        <div className="h-full flex min-h-0">
            {/* ── Árbol izquierdo ─────────────────────────────────────── */}
            <aside className="w-64 shrink-0 border-r border-white/5 flex flex-col min-h-0 bg-black/20">
                <div className="p-3 border-b border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                            <Brain size={13} className="text-[rgb(var(--accent))]" /> Bóveda
                        </p>
                        <span className="text-[10px] text-neutral-600">{notes.length} notas</span>
                    </div>
                    <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…"
                            className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                    </div>
                    <div className="flex gap-1.5">
                        <button type="button" onClick={() => openNewModal()}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90">
                            <Plus size={11} /> Agregar nuevo
                        </button>
                        <button type="button" onClick={() => setNewFolderName('')} title="Nueva carpeta"
                            className="p-1.5 rounded-lg border border-white/10 text-neutral-400 hover:text-white hover:border-white/25">
                            <FolderPlus size={13} />
                        </button>
                    </div>
                    {newFolderName !== null && (
                        <div className="flex gap-1">
                            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                                placeholder="Nombre de carpeta" autoFocus
                                className="flex-1 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] text-neutral-200 outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                            <button type="button" onClick={createFolder} className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/10 text-white">OK</button>
                        </div>
                    )}
                </div>

                {/* Árbol */}
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {/* Raíz */}
                    <div>
                        <button type="button" onClick={() => setCollapsed((c) => ({ ...c, '': !c[''] }))}
                            className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-semibold text-neutral-300 hover:text-white">
                            {collapsed[''] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                            <BookOpen size={12} className="opacity-60" /> Raíz
                        </button>
                        {!collapsed[''] && (
                            <div className="ml-4 space-y-0.5">
                                {(byFolder.get('') ?? []).map((n) => <NoteRow key={n.id} n={n} />)}
                            </div>
                        )}
                    </div>
                    {allFolders.map((f) => (
                        <div key={f}>
                            <div className="group flex items-center gap-1 px-1.5 py-1">
                                <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [f]: !c[f] }))}
                                    className="flex items-center gap-1.5 flex-1 text-left text-[11px] font-semibold text-neutral-300 hover:text-white">
                                    {collapsed[f] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                    <Folder size={12} className="text-[rgb(var(--accent))] opacity-80" />
                                    <span className="truncate">{f}</span>
                                </button>
                                <button type="button" onClick={() => deleteFolder(f)} title="Eliminar carpeta (notas van a raíz)"
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-600 hover:text-rose-400 transition-all">
                                    <X size={11} />
                                </button>
                            </div>
                            {!collapsed[f] && (
                                <div className="ml-4 space-y-0.5">
                                    {(byFolder.get(f) ?? []).map((n) => <NoteRow key={n.id} n={n} />)}
                                    {(byFolder.get(f) ?? []).length === 0 && (
                                        <p className="text-[10px] text-neutral-700 px-2 py-1">vacía</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <p className="text-[11px] text-neutral-600 text-center py-6">
                            {notes.length === 0 ? 'Bóveda vacía. Agrega tu primera nota.' : 'Sin resultados.'}
                        </p>
                    )}
                </div>

                {/* Archivos y conversaciones — menú compacto */}
                <div className="border-t border-white/5 p-2">
                    <button type="button" onClick={() => setChatsOpen((o) => !o)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] text-neutral-400 hover:bg-white/5 hover:text-neutral-200">
                        <span className="flex items-center gap-1.5"><MessageSquare size={12} /> Archivos y conversaciones</span>
                        <ChevronDown size={12} className={`transition-transform ${chatsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {chatsOpen && (
                        <div className="mt-1 max-h-44 overflow-y-auto space-y-1 px-1 pb-1">
                            {sessions.length === 0 && <p className="text-[10px] text-neutral-600 px-2 py-1">Sin conversaciones guardadas.</p>}
                            {sessions.slice(0, 15).map((s) => (
                                <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.02]">
                                    <span className="text-[10px] text-neutral-400 truncate flex-1">{s.title}</span>
                                    <button type="button" onClick={() => downloadText(`${s.title.replace(/[^\wáéíóúñ -]/gi, '_')}.md`, sessionToMarkdown(s))}
                                        className="text-neutral-600 hover:text-white" title="Exportar"><Download size={11} /></button>
                                    <button type="button" onClick={() => { deleteSession(s.id); setSessions(loadSessions()); }}
                                        className="text-neutral-600 hover:text-rose-400" title="Eliminar"><Trash2 size={11} /></button>
                                </div>
                            ))}
                            {sessions.length > 0 && (
                                <button type="button" onClick={exportAll}
                                    className="w-full mt-1 px-2 py-1 rounded-md text-[10px] text-neutral-500 hover:text-white border border-white/10">
                                    Exportar toda la bóveda (.json)
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </aside>

            {/* ── Derecha: cerebro grande + editor como panel lateral ── */}
            <main className="flex-1 min-w-0 relative min-h-0">
                {/* Cerebro: siempre ocupa todo el área disponible */}
                <div className="absolute inset-0 p-3 flex flex-col">
                    <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1.5 shrink-0">
                        <Brain size={11} className="text-[rgb(var(--accent))]" />
                        Cerebro — {notes.length} notas{savedFlash ? ' · ✓ guardado' : ''}
                        {active && editorOpen && <span className="normal-case text-neutral-600">· editando: {active.title}</span>}
                    </p>
                    <div className="flex-1 min-h-0">
                        <BrainGraph notes={notes} onSelect={openNote} />
                    </div>
                </div>

                {/* Sin editor: ayuda contextual */}
                {!editorOpen && (
                    <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
                        <p className="text-[11px] text-neutral-600 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full border border-white/5">
                            {notes.length === 0
                                ? 'Bóveda vacía — usa "Agregar nuevo" para crear tu primera nota.'
                                : 'Cerebro de conocimiento — haz clic en un nodo para editar su nota.'}
                        </p>
                    </div>
                )}

                {/* Editor: panel lateral sobre el cerebro; se cierra al guardar */}
                {editorOpen && active && (
                <div className="absolute right-0 top-0 bottom-0 w-[460px] max-w-[92%] flex flex-col border-l border-white/10 bg-[#0d0d0f]/95 backdrop-blur-md shadow-2xl">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 shrink-0">
                        <p className="text-xs font-semibold text-neutral-300 truncate">{active.title}</p>
                        <button type="button" onClick={() => { setEditorOpen(false); setDirty(false); setDraft(emptyDraft()); setActiveId(null); }}
                            className="p-1 text-neutral-500 hover:text-white" title="Cerrar editor"><X size={14} /></button>
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col p-4 gap-3 overflow-y-auto">
                        <>
                            <div className="flex items-center gap-2">
                                <input value={draft.title} onChange={(e) => { setDraft((d) => ({ ...d, title: e.target.value })); setDirty(true); }}
                                    placeholder="Título de la nota" className={`${inputCls} text-base font-semibold`} />
                                <input value={draft.type} onChange={(e) => { setDraft((d) => ({ ...d, type: e.target.value })); setDirty(true); }}
                                    placeholder="Tipo (libre)" title="Tipo de nota — texto libre, lo defines tú"
                                    className="w-24 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-300 outline-none shrink-0 placeholder:text-neutral-600" />
                                <select value={draft.folder} onChange={(e) => { setDraft((d) => ({ ...d, folder: e.target.value })); setDirty(true); }}
                                    className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-300 outline-none shrink-0 max-w-32">
                                    <option value="" className="bg-neutral-900">Raíz</option>
                                    {allFolders.map((f) => <option key={f} value={f} className="bg-neutral-900">{f}</option>)}
                                </select>
                                <button type="button" onClick={() => fileRef.current?.click()}
                                    className="p-2 rounded-lg border border-white/10 text-neutral-400 hover:text-white hover:border-white/25 shrink-0" title="Adjuntar PDF/imagen">
                                    <FileUp size={15} />
                                </button>
                                <button type="button" onClick={() => exportNote(active)}
                                    className="p-2 rounded-lg border border-white/10 text-neutral-400 hover:text-white hover:border-white/25 shrink-0" title="Exportar .md">
                                    <Download size={15} />
                                </button>
                                <button type="button" onClick={() => deleteNote(active.id)}
                                    className="p-2 rounded-lg border border-white/10 text-neutral-400 hover:text-rose-400 hover:border-rose-400/40 shrink-0" title="Eliminar nota">
                                    <Trash2 size={15} />
                                </button>
                            </div>
                            <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md" className="hidden" onChange={(e) => void addFiles(e.target.files)} />
                            <input value={draft.tags} onChange={(e) => { setDraft((d) => ({ ...d, tags: e.target.value })); setDirty(true); }}
                                placeholder="Etiquetas separadas por coma (unen notas en el cerebro)" className={`${inputCls} text-xs`} />
                            <textarea value={draft.content} onChange={(e) => { setDraft((d) => ({ ...d, content: e.target.value })); setDirty(true); }}
                                placeholder="Escribe aquí… Markdown básico soportado."
                                className={`${inputCls} flex-1 min-h-[200px] font-mono text-[13px] leading-relaxed resize-y`} />
                            {draft.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {draft.attachments.map((a) => (
                                        <span key={a.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-neutral-300">
                                            {a.mime === 'application/pdf' ? <FileText size={11} /> : <FileUp size={11} />}
                                            <a href={attachmentUrl(a)} target="_blank" rel="noreferrer" className="hover:underline">{a.name}</a>
                                            <span className="text-neutral-600">{fmtSize(a.size)}</span>
                                            <button type="button" onClick={() => removeAttachment(a.name)} className="text-neutral-600 hover:text-rose-400"><X size={11} /></button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] text-neutral-600">
                                    {savedFlash ? '✓ Guardado' : dirty ? 'Cambios sin guardar' : `Actualizada ${fmtDate(active.updatedAt)}`}
                                </p>
                                <button type="button" onClick={saveActive} disabled={!dirty}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 disabled:opacity-40 transition-opacity">
                                    <Save size={13} /> Guardar
                                </button>
                            </div>
                        </>
                    </div>
                </div>
                )}
                <MiniChat
                    contextNote={`estás en la Bóveda con ${notes.length} notas; puedes preguntar sobre su contenido`}
                    placeholder="pregunta sobre tus notas…"
                />
            </main>

            {/* ── Modal "Agregar nuevo" ───────────────────────────────── */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setModalOpen(false)}>
                    <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111] p-5 flex flex-col gap-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">Agregar nuevo a la bóveda</p>
                            <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-neutral-500 hover:text-white"><X size={16} /></button>
                        </div>
                        <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                            placeholder="Título de la nota" className={inputCls} autoFocus />
                        <div className="grid grid-cols-2 gap-2">
                            <input value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                                placeholder="Tipo (libre: idea, proyecto…)" className={inputCls} />
                            <input value={draft.tags} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                                placeholder="Etiquetas (separadas por coma)" className={inputCls} />
                        </div>
                        <p className="text-[10px] text-neutral-600">La carpeta se asigna después desde el editor; las carpetas se crean con el botón + junto a "Agregar nuevo".</p>
                        <textarea value={draft.content} onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                            placeholder="Contenido de la nota… pega texto o escribe aquí."
                            className={`${inputCls} min-h-[140px] font-mono text-[13px]`} />
                        <div>
                            <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md" className="hidden" onChange={(e) => void addFiles(e.target.files)} />
                            <button type="button" onClick={() => fileRef.current?.click()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20">
                                <FileUp size={12} /> Adjuntar archivo (PDF, imagen, txt)
                            </button>
                            {draft.attachments.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {draft.attachments.map((a) => (
                                        <span key={a.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05] text-[10px] text-neutral-300">
                                            {a.name} <button type="button" onClick={() => removeAttachment(a.name)} className="text-neutral-600 hover:text-rose-400"><X size={10} /></button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button type="button" onClick={() => setModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-300 border border-white/10 hover:border-white/20">Cancelar</button>
                            <button type="button" onClick={saveNewNote}
                                className="px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90">
                                Guardar en la bóveda
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
