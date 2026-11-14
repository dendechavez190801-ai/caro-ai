import React, { useEffect, useMemo, useState } from 'react';
import { Brain, MessageCircle, Wrench, Baby, Briefcase, HeartHandshake, ShieldAlert, Plus, Pencil, Trash2, Database, FolderOpen, Paperclip, MessagesSquare, ChevronDown, Volume2, Lock } from 'lucide-react';
import { Section, Card, Metric, DemoBadge } from '../../components/ui';
import { useApp } from '../../store';
import { loadNotes, VaultAttachment } from '../../vault';
import { loadSessions, sessionToMarkdown, ChatSession } from '../../chats';
import { downloadText } from '../../vault';
import { speak, PIPER_VOICES } from '../../speech';
import { AGENT_TONES, loadToneIndex, saveToneIndex, isToneLocked, setToneLocked, UNLOCKED_TONE_INDEX } from '../../agentTone';

const REPOS_KEY = 'caroai.repos.v1';
const SKILLS_KEY = 'caroai.skills.v1';

/** Repos del desarrollador: nunca se precargan en instalaciones de usuarios. */
const DEV_ONLY_REPOS = ['Hermes/Boveda', 'joy-ai-multiplatform', 'joy-ai-build', 'jarvis-asistente'];

const DEFAULT_SKILLS = [
    { id: 's1', name: 'Programación Fullstack & Terminal CLI', desc: 'Código, scripts y depuración.', enabled: true },
    { id: 's2', name: 'Bridge de Skills Claude (MCP)', desc: 'Conecta herramientas externas.', enabled: true },
    { id: 's3', name: 'Simulador de Física & Astrofísica', desc: 'Modelos y simulaciones.', enabled: false },
    { id: 's4', name: 'Química Molecular & Bioinformática', desc: 'Moléculas y datos biológicos.', enabled: false },
    { id: 's5', name: 'Extracción Web & Análisis de Repositorios', desc: 'Scraping y lectura de código.', enabled: true },
    { id: 's6', name: 'Automatización del SO & Control de Pantalla', desc: 'Acciones en el equipo.', enabled: false },
];

const TONE_ICONS = [Briefcase, MessageCircle, ShieldAlert, Baby, HeartHandshake, Brain];

interface SkillItem { id: string; name: string; desc: string; enabled: boolean }

function loadJSON<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch { return fallback; }
}
function saveJSON(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

/**
 * Memoria y Personalidad: contadores REALES de la bóveda/conversaciones,
 * skills persistentes por usuario, tono persistente y repos configurables.
 */
export const MemoryModule: React.FC = () => {
    const { state, dispatch } = useApp();
    const [tone, setTone] = useState(() => loadToneIndex());
    const [toneLock, setToneLock] = useState(() => isToneLocked());
    const [skills, setSkills] = useState<SkillItem[]>(() => loadJSON<SkillItem[]>(SKILLS_KEY, DEFAULT_SKILLS));
    // Repos: nunca precargamos los del desarrollador; si quedaron guardados de una
    // versión anterior, se filtran al cargar (eran datos de prueba, no del usuario).
    const [repos, setRepos] = useState<string[]>(() =>
        loadJSON<string[]>(REPOS_KEY, []).filter((r) => !DEV_ONLY_REPOS.includes(r)));
    const [newRepo, setNewRepo] = useState('');
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', desc: '' });
    const [openPanel, setOpenPanel] = useState<'attachments' | 'sessions' | 'skills' | 'repos' | 'files' | null>(null);

    // Contadores reales de la memoria del usuario.
    const stats = useMemo(() => {
        const notes = loadNotes();
        const sessions = loadSessions();
        const attachments: { note: string; att: VaultAttachment }[] = [];
        notes.forEach((n) => n.attachments?.forEach((a) => attachments.push({ note: n.title, att: a })));
        return { notes: notes.length, attachments, sessions, files: attachments.length + notes.length + sessions.length };
    }, []);

    useEffect(() => { saveJSON(SKILLS_KEY, skills); }, [skills]);
    useEffect(() => { saveToneIndex(tone); }, [tone]);
    useEffect(() => { saveJSON(REPOS_KEY, repos); }, [repos]);

    const startEdit = (s: SkillItem) => { setEditId(s.id); setForm({ name: s.name, desc: s.desc }); };
    const save = () => {
        const n = form.name.trim(); if (!n) return;
        if (editId) {
            setSkills((xs) => xs.map((s) => s.id === editId ? { ...s, name: n, desc: form.desc.trim() } : s));
            setEditId(null);
        } else {
            setSkills((xs) => [...xs, { id: `s-${Date.now()}`, name: n, desc: form.desc.trim(), enabled: true }]);
        }
        setForm({ name: '', desc: '' });
    };
    const toggle = (id: string) => setSkills((xs) => xs.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s));
    const addRepo = () => {
        const r = newRepo.trim();
        if (!r) return;
        if (!repos.includes(r)) setRepos([...repos, r]);
        setNewRepo('');
    };

    const activeCount = skills.filter((s) => s.enabled).length;
    const sessions = stats.sessions;
    const voiceFile = PIPER_VOICES.find((v) => v.file === state.ttsVoiceId)?.file ?? state.ttsVoiceId;

    const previewTone = () => {
        const t = AGENT_TONES[tone];
        void speak(`${t.name}: ${t.prompt.slice(0, 90)}…`, voiceFile).catch(() => {});
    };

    return (
        <div className="flex flex-col gap-6">
            <Section title="Memoria y Personalidad" desc="Contadores reales de tu memoria local, skills y tono del agente. Todo vive solo en este equipo.">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <button type="button" onClick={() => dispatch({ type: 'set-tab', tab: 'vault' })} className="text-left">
                        <Metric label="Notas en bóveda" value={stats.notes} sub="archivos de conocimiento · abrir" />
                    </button>
                    <button type="button" onClick={() => setOpenPanel(openPanel === 'attachments' ? null : 'attachments')} className="text-left">
                        <Metric label="Adjuntos" value={stats.attachments.length} sub="PDF/imagen/texto · abrir" />
                    </button>
                    <button type="button" onClick={() => setOpenPanel(openPanel === 'sessions' ? null : 'sessions')} className="text-left">
                        <Metric label="Conversaciones" value={sessions.length} sub="chats archivados · abrir" />
                    </button>
                    <button type="button" onClick={() => setOpenPanel(openPanel === 'skills' ? null : 'skills')} className="text-left">
                        <Metric label="Skills activas" value={activeCount} sub={`de ${skills.length} · ver`} />
                    </button>
                    <button type="button" onClick={() => setOpenPanel(openPanel === 'repos' ? null : 'repos')} className="text-left">
                        <Metric label="Repositorios" value={repos.length} sub="tus proyectos · abrir" />
                    </button>
                    <button type="button" onClick={() => setOpenPanel(openPanel === 'files' ? null : 'files')} className="text-left">
                        <Metric label="Archivos" value={stats.files} sub="todo lo guardado · abrir" />
                    </button>
                </div>

                {/* Panel: adjuntos reales de la bóveda */}
                {openPanel === 'attachments' && (
                    <Card className="mt-3">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2 flex items-center gap-1.5"><Paperclip size={11} /> Archivos adjuntos en tu bóveda</p>
                        {stats.attachments.length === 0 ? (
                            <p className="text-[11px] text-neutral-600">Sin adjuntos todavía — se agregan desde el editor de notas en Bóveda.</p>
                        ) : (
                            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                                {stats.attachments.map(({ note, att }, i) => (
                                    <a key={i} href={`data:${att.mime};base64,${att.data}`} target="_blank" rel="noreferrer"
                                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/20 text-[11px] text-neutral-300">
                                        <Paperclip size={11} className="text-[rgb(var(--accent))] shrink-0" />
                                        <span className="truncate flex-1">{att.name}</span>
                                        <span className="text-neutral-600 shrink-0">{note}</span>
                                    </a>
                                ))}
                            </div>
                        )}
                    </Card>
                )}

                {/* Panel: conversaciones archivadas */}
                {openPanel === 'sessions' && (
                    <Card className="mt-3">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2 flex items-center gap-1.5"><MessagesSquare size={11} /> Conversaciones archivadas</p>
                        {sessions.length === 0 ? (
                            <p className="text-[11px] text-neutral-600">Sin conversaciones guardadas — se archivan desde el chat con «Guardar en bóveda».</p>
                        ) : (
                            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                                {sessions.slice(0, 20).map((s: ChatSession) => (
                                    <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
                                        <span className="text-[11px] text-neutral-300 truncate flex-1">{s.title}</span>
                                        <button type="button" onClick={() => { downloadText(`${s.title.replace(/[^\wáéíóúñ -]/gi, '_')}.md`, sessionToMarkdown(s)); }}
                                            className="text-[10px] text-neutral-500 hover:text-white shrink-0">Exportar</button>
                                        <button type="button" onClick={() => dispatch({ type: 'set-tab', tab: 'chat' })}
                                            className="text-[10px] text-[rgb(var(--accent))] hover:underline shrink-0">Abrir chat</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                )}

                {/* Panel: repositorios del usuario */}
                {openPanel === 'repos' && (
                    <Card className="mt-3">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2 flex items-center gap-1.5"><FolderOpen size={11} /> Repositorios y proyectos</p>
                        {repos.length === 0 ? (
                            <p className="text-[11px] text-neutral-600">Sin repos — añádelos en la sección Repositorios de abajo.</p>
                        ) : (
                            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                                {repos.map((r) => (
                                    <div key={r} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
                                        <Wrench size={11} className="text-[rgb(var(--accent))] shrink-0" />
                                        <span className="text-[11px] text-neutral-300 font-mono truncate flex-1">{r}</span>
                                        <button type="button" onClick={() => setRepos(repos.filter((x) => x !== r))} className="text-neutral-600 hover:text-rose-400 text-[10px] shrink-0">Quitar</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                )}

                {/* Panel: archivos generales (notas + adjuntos + chats) */}
                {openPanel === 'files' && (
                    <Card className="mt-3">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2 flex items-center gap-1.5"><Database size={11} /> Resumen de archivos locales</p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-white/[0.03] border border-white/5 py-2">
                                <p className="text-sm font-bold text-white">{stats.notes}</p>
                                <p className="text-[9px] text-neutral-500 uppercase">notas</p>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] border border-white/5 py-2">
                                <p className="text-sm font-bold text-white">{stats.attachments.length}</p>
                                <p className="text-[9px] text-neutral-500 uppercase">adjuntos</p>
                            </div>
                            <div className="rounded-lg bg-white/[0.03] border border-white/5 py-2">
                                <p className="text-sm font-bold text-white">{sessions.length}</p>
                                <p className="text-[9px] text-neutral-500 uppercase">conversaciones</p>
                            </div>
                        </div>
                        <button type="button" onClick={() => dispatch({ type: 'set-tab', tab: 'vault' })}
                            className="mt-2 text-[10px] text-[rgb(var(--accent))] hover:underline">Abrir bóveda →</button>
                    </Card>
                )}

                {/* Panel: skills (resumen; la edición está abajo) */}
                {openPanel === 'skills' && (
                    <Card className="mt-3">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2 flex items-center gap-1.5"><Database size={11} /> Skills ({activeCount} activas de {skills.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                            {skills.map((s) => (
                                <span key={s.id} className={`text-[10px] px-2 py-0.5 rounded-md border ${s.enabled ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' : 'text-neutral-500 border-white/10'}`}>{s.name}</span>
                            ))}
                        </div>
                    </Card>
                )}
            </Section>

            <Section title="Repositorios" desc="Tus repos/proyectos que el agente puede consultar. Se guardan solo aquí.">
                <div className="flex flex-wrap gap-2 mb-3">
                    {repos.map((r) => (
                        <span key={r} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-neutral-300">
                            <Wrench size={11} className="text-[rgb(var(--accent))]" /> {r}
                            <button type="button" onClick={() => setRepos(repos.filter((x) => x !== r))} className="text-neutral-600 hover:text-rose-400" aria-label={`Quitar ${r}`}><Trash2 size={11} /></button>
                        </span>
                    ))}
                    {repos.length === 0 && <p className="text-[11px] text-neutral-600">Sin repos registrados.</p>}
                </div>
                <div className="flex gap-2 max-w-md">
                    <input value={newRepo} onChange={(e) => setNewRepo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRepo()} placeholder="Nombre o ruta del repo (p. ej. mi-proyecto)" className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                    <button type="button" onClick={addRepo} className="px-3 py-2 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90">Añadir</button>
                </div>
            </Section>

            <Section title="Skills modulares" desc="Crea, edita, activa o borra skills. Persisten en este equipo por usuario.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {skills.map((s) => (
                        <Card key={s.id} className="flex items-start gap-3">
                            <Database size={18} className="text-[rgb(var(--accent))] mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-white truncate">{s.name}</p>
                                    <button type="button" onClick={() => toggle(s.id)} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.enabled ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' : 'text-neutral-500 border-white/10 bg-white/[0.03]'}`}>
                                        {s.enabled ? 'Activa' : 'Off'}
                                    </button>
                                </div>
                                <p className="text-[11px] text-neutral-500 mt-0.5">{s.desc || 'Sin descripción'}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                                <button type="button" onClick={() => startEdit(s)} aria-label="Editar" className="p-1.5 rounded-lg text-neutral-500 hover:text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent)/0.1)] transition-colors"><Pencil size={13} /></button>
                                <button type="button" onClick={() => setSkills((xs) => xs.filter((x) => x.id !== s.id))} aria-label="Borrar" className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"><Trash2 size={13} /></button>
                            </div>
                        </Card>
                    ))}
                </div>

                <Card className="mt-4 flex flex-col gap-3">
                    <p className="text-[11px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">{editId ? 'Editar skill' : 'Nueva skill'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre de la skill" className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                        <input value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} placeholder="Descripción" className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] sm:col-span-1" />
                        <div className="flex gap-2">
                            <button type="button" onClick={save} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity"><Plus size={13} /> {editId ? 'Guardar' : 'Añadir'}</button>
                            {editId && <button type="button" onClick={() => { setEditId(null); setForm({ name: '', desc: '' }); }} className="px-3 py-2 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors">Cancelar</button>}
                        </div>
                    </div>
                </Card>
            </Section>

            <Section title="Tono del agente" desc="Elige la personalidad de las respuestas (se inyecta al prompt del chat). «Escuchar» prueba la voz actual.">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {AGENT_TONES.map((t, i) => {
                        const Icon = TONE_ICONS[i] ?? Brain;
                        const active = tone === i;
                        const isLockedTone = i === UNLOCKED_TONE_INDEX;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                    // Candado del modo sin filtro: activarlo exige
                                    // aceptación explícita de responsabilidad; y una
                                    // vez activo, cambiar de tono exige desbloquear.
                                    if (isLockedTone && !active) {
                                        const ok = window.confirm(
                                            'MODO SIN FILTRO\n\nActivas el tono «Sin Filtros / Creativo Libre».\n\nAl aceptar declaras que es tu responsabilidad el uso que hagas de las respuestas y que ya aceptaste esta responsabilidad en el aviso de política de la app.\n\n¿Activar el candado?'
                                        );
                                        if (!ok) return;
                                        setTone(i); setToneLock(true); setToneLocked(true);
                                        return;
                                    }
                                    if (toneLock && tone === UNLOCKED_TONE_INDEX && !isLockedTone) {
                                        const ok = window.confirm(
                                            'El modo «Sin Filtros» está bloqueado.\n\n¿Desbloquear y cambiar de tono? Tendrás que reactivar el candado si quieres volver.'
                                        );
                                        if (!ok) return;
                                        setToneLock(false); setToneLocked(false);
                                    }
                                    setTone(i);
                                }}
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${active ? 'bg-[rgb(var(--accent)/0.14)] border-[rgb(var(--accent)/0.45)]' : 'bg-white/[0.02] border-white/5 hover:border-white/15'}`}
                            >
                                <Icon size={16} className={active ? 'text-[rgb(var(--accent))]' : 'text-neutral-500'} />
                                <span className="text-xs font-medium text-neutral-200 flex-1">{t.name}</span>
                                {isLockedTone && (toneLock || active) && <Lock size={12} className="text-[rgb(var(--accent))]" aria-label="Candado activo" />}
                            </button>
                        );
                    })}
                </div>
                <button type="button" onClick={previewTone}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 hover:text-white transition-colors">
                    <Volume2 size={12} /> Escuchar tono seleccionado
                </button>
            </Section>
        </div>
    );
};
