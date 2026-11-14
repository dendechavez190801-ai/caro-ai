import React, { useEffect, useRef, useState } from 'react';
import {
    Terminal as TermIcon, Play, Trash2, Plus, X, FileText, Palette,
    Bot, Send, ChevronDown, FolderOpen, Download, Upload, Camera,
} from 'lucide-react';
import { permEnabled } from '../../permissions';
import { useApp } from '../../store';
import { getSystemInfo, SystemInfo } from '../../system';
import { chatCompletion } from '../../ai';
import { AGENT_TONES, loadToneIndex } from '../../agentTone';
import { searchNotes, loadNotes } from '../../vault';

/**
 * Terminal/IDE (puntos 20 y 22): pestaña principal junto a la Bóveda.
 *
 * - Shell real por SO (cmd.exe/PowerShell en Windows, zsh en macOS,
 *   Termux en Android, honesto en iOS) vía shellExec de Electron.
 * - Sesiones con nombre, historial persistente, ↑/↓ para recuperar comandos.
 * - Skins integrados + "extensiones" de tema importables (JSON).
 * - Abrir archivo del equipo y volcar su contenido en la terminal.
 * - Panel de agente: chatea con el modelo configurado; comandos con «!»
 *   se ejecutan directo en el shell.
 */

interface Line { kind: 'in' | 'out' | 'err' | 'sys'; text: string }
interface Session { id: string; name: string; lines: Line[]; hist: string[]; histIdx: number }
interface TermTheme { id: string; name: string; bg: string; fg: string; prompt: string; accent: string; panel: string }
interface CommandPack { id: string; name: string; commands: { label: string; cmd: string }[] }

const PACKS_KEY = 'caroai.term.packs.v1';

function loadPacks(): CommandPack[] {
    const v = loadJSON<unknown>(PACKS_KEY, []);
    return Array.isArray(v)
        ? v.filter((p): p is CommandPack => !!p && typeof (p as CommandPack).name === 'string' && Array.isArray((p as CommandPack).commands))
        : [];
}

const BUILTIN_THEMES: TermTheme[] = [
    { id: 'midnight', name: 'Midnight', bg: '#0a0a0f', fg: '#d4d4d8', prompt: '#22d3ee', accent: '#a78bfa', panel: '#111116' },
    { id: 'light', name: 'Light', bg: '#fafafa', fg: '#27272a', prompt: '#2563eb', accent: '#7c3aed', panel: '#f0f0f2' },
    { id: 'amber', name: 'Amber', bg: '#120d05', fg: '#e8d5b0', prompt: '#f59e0b', accent: '#f97316', panel: '#1a1409' },
];

const THEMES_KEY = 'caroai.term.themes.v1';
const THEME_KEY = 'caroai.term.theme.v1';
const SESS_KEY = 'caroai.term.sessions.v1';

function loadJSON<T>(key: string, fb: T): T {
    try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : fb; } catch { return fb; }
}
function saveJSON(key: string, v: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* noop */ }
}

function loadCustomThemes(): TermTheme[] {
    const v = loadJSON<unknown>(THEMES_KEY, []);
    return Array.isArray(v) ? v.filter((t): t is TermTheme => !!t && typeof (t as TermTheme).id === 'string' && typeof (t as TermTheme).bg === 'string') : [];
}

function shellFor(platform?: string): { label: string; prompt: string } {
    switch (platform) {
        case 'win32': return { label: 'cmd.exe (Windows)', prompt: 'C:\\>' };
        case 'darwin': return { label: 'zsh (macOS)', prompt: '❯' };
        case 'android': return { label: 'Termux', prompt: '$' };
        case 'ios': return { label: 'sin shell local (usa SSH)', prompt: '❯' };
        default: return { label: 'sh (POSIX)', prompt: '$' };
    }
}

const inputCls = 'px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]';

export const TerminalPage: React.FC = () => {
    const { state } = useApp();
    const [info, setInfo] = useState<SystemInfo | null>(null);
    const [sessions, setSessions] = useState<Session[]>(() => {
        const saved = loadJSON<Session[]>(SESS_KEY, []);
        return saved.length ? saved : [{ id: 's1', name: 'shell-1', lines: [], hist: [], histIdx: -1 }];
    });
    const [activeId, setActiveId] = useState(sessions[0]?.id ?? 's1');
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [agentOpen, setAgentOpen] = useState(false);
    const [agentInput, setAgentInput] = useState('');
    const [agentMsgs, setAgentMsgs] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
    const [agentBusy, setAgentBusy] = useState(false);
    const [themes, setThemes] = useState<TermTheme[]>(() => [...BUILTIN_THEMES, ...loadCustomThemes()]);
    const [themeId, setThemeId] = useState(() => loadJSON<string>(THEME_KEY, 'midnight'));
    const [themeMenu, setThemeMenu] = useState(false);
    const themeMenuRef = useRef<HTMLDivElement>(null);
    const [packs, setPacks] = useState<CommandPack[]>(loadPacks);
    const [packsOpen, setPacksOpen] = useState(false);
    const packsRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const isElectron = typeof window !== 'undefined' && !!window.joyai?.shellExec;
    const shell = shellFor(info?.platform);
    const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
    const theme = themes.find((t) => t.id === themeId) ?? BUILTIN_THEMES[0];

    useEffect(() => { getSystemInfo().then(setInfo).catch(() => {}); }, []);
    useEffect(() => { saveJSON(SESS_KEY, sessions.map((s) => ({ ...s, lines: s.lines.slice(-300) }))); }, [sessions]);
    useEffect(() => { saveJSON(THEME_KEY, themeId); }, [themeId]);
    useEffect(() => { saveJSON(THEMES_KEY, themes.filter((t) => !BUILTIN_THEMES.some((b) => b.id === t.id))); }, [themes]);
    useEffect(() => { saveJSON(PACKS_KEY, packs); }, [packs]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [active?.lines.length]);

    useEffect(() => {
        if (!themeMenu) return;
        const onDown = (e: MouseEvent) => { if (!themeMenuRef.current?.contains(e.target as Node)) setThemeMenu(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [themeMenu]);

    useEffect(() => {
        if (!packsOpen) return;
        const onDown = (e: MouseEvent) => { if (!packsRef.current?.contains(e.target as Node)) setPacksOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [packsOpen]);

    /** Importa un paquete de comandos (extensión JSON tipo IDE). */
    const importPack = () => {
        const inputEl = document.createElement('input');
        inputEl.type = 'file';
        inputEl.accept = '.json,application/json';
        inputEl.onchange = async () => {
            const f = inputEl.files?.[0];
            if (!f) return;
            try {
                const j = JSON.parse(await f.text()) as Partial<CommandPack>;
                if (!j.name || !Array.isArray(j.commands) || !j.commands.length) throw new Error('formato');
                const cmds = j.commands
                    .filter((c) => c && typeof c.label === 'string' && typeof c.cmd === 'string')
                    .slice(0, 50)
                    .map((c) => ({ label: c.label.slice(0, 40), cmd: c.cmd.slice(0, 500) }));
                if (!cmds.length) throw new Error('sin comandos válidos');
                setPacks((ps) => [...ps.filter((p) => p.name !== j.name), { id: `pk-${Date.now()}`, name: String(j.name).slice(0, 40), commands: cmds }]);
            } catch {
                pushLine(active.id, { kind: 'err', text: 'Extensión inválida: se esperaba {"name":"...","commands":[{"label":"...","cmd":"..."}]}' });
            }
        };
        inputEl.click();
    };

    const patchSession = (id: string, fn: (s: Session) => Session) =>
        setSessions((ss) => ss.map((s) => (s.id === id ? fn(s) : s)));

    const pushLine = (id: string, line: Line) =>
        patchSession(id, (s) => ({ ...s, lines: [...s.lines, line] }));

    const newSession = () => {
        const n = sessions.length + 1;
        const s: Session = { id: `s${Date.now()}`, name: `shell-${n}`, lines: [], hist: [], histIdx: -1 };
        setSessions((ss) => [...ss, s]);
        setActiveId(s.id);
    };

    const closeSession = (id: string) => {
        setSessions((ss) => {
            const next = ss.filter((s) => s.id !== id);
            if (next.length === 0) return [{ id: 's1', name: 'shell-1', lines: [], hist: [], histIdx: -1 }];
            if (!next.some((s) => s.id === activeId)) setActiveId(next[0].id);
            return next;
        });
    };

    const runCmd = async (raw: string) => {
        const cmd = raw.trim();
        if (!cmd || busy || !active) return;
        pushLine(active.id, { kind: 'in', text: `${shell.prompt} ${cmd}` });
        patchSession(active.id, (s) => ({ ...s, hist: [...s.hist, cmd].slice(-80), histIdx: -1 }));
        setInput('');
        if (!isElectron) {
            pushLine(active.id, { kind: 'sys', text: 'La ejecución real requiere la app de escritorio (Electron). En el navegador esta consola es solo vista.' });
            return;
        }
        setBusy(true);
        const r = await window.joyai!.shellExec!(cmd).catch((e): { ok: boolean; output?: string; error?: string; code?: number } => ({ ok: false, error: String(e) }));
        setBusy(false);
        const out = (r.output ?? '').trim();
        if (out) out.split('\n').slice(0, 200).forEach((l) => pushLine(active.id, { kind: 'out', text: l }));
        if (r.error) pushLine(active.id, { kind: 'err', text: r.error });
        if (!out && !r.error) pushLine(active.id, { kind: 'out', text: '(sin salida)' });
    };

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { void runCmd(input); return; }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!active || !active.hist.length) return;
            const idx = active.histIdx === -1 ? active.hist.length - 1 : Math.max(0, active.histIdx - 1);
            patchSession(active.id, (s) => ({ ...s, histIdx: idx }));
            setInput(active.hist[idx] ?? '');
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!active || active.histIdx === -1) return;
            const idx = active.histIdx + 1;
            if (idx >= active.hist.length) { patchSession(active.id, (s) => ({ ...s, histIdx: -1 })); setInput(''); }
            else { patchSession(active.id, (s) => ({ ...s, histIdx: idx })); setInput(active.hist[idx] ?? ''); }
        }
        if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); patchSession(active.id, (s) => ({ ...s, lines: [] })); }
        if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); pushLine(active.id, { kind: 'in', text: '^C' }); setInput(''); }
    };

    /** Abre un archivo del equipo y muestra su contenido (type/cat). */
    const openFile = async () => {
        if (!isElectron) { pushLine(active.id, { kind: 'sys', text: 'Abrir archivos requiere Electron.' }); return; }
        const r = await window.joyai!.mediaPick?.().catch(() => null);
        if (!r?.ok || !r.path) return;
        const cmd = info?.platform === 'win32' ? `type "${r.path}"` : `cat "${r.path}"`;
        await runCmd(cmd);
    };

    const importTheme = async () => {
        const inputEl = document.createElement('input');
        inputEl.type = 'file';
        inputEl.accept = '.json,application/json';
        inputEl.onchange = async () => {
            const f = inputEl.files?.[0];
            if (!f) return;
            try {
                const j = JSON.parse(await f.text()) as Partial<TermTheme> & { name?: string };
                if (!j.bg || !j.fg) throw new Error('faltan bg/fg');
                const t: TermTheme = {
                    id: `ext-${Date.now()}`, name: j.name ?? f.name.replace(/\.json$/i, ''),
                    bg: j.bg, fg: j.fg, prompt: j.prompt ?? '#22d3ee', accent: j.accent ?? '#a78bfa', panel: j.panel ?? j.bg,
                };
                setThemes((ts) => [...ts, t]);
                setThemeId(t.id);
            } catch { pushLine(active.id, { kind: 'err', text: 'Tema inválido: se esperaba JSON {name,bg,fg,prompt?,accent?,panel?}' }); }
        };
        inputEl.click();
    };

    const exportTheme = () => {
        const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `caroai-theme-${theme.id}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    /** Captura la ventana de la app (visión) → PNG en Documentos/CaRoAi-Capturas. */
    const captureScreen = async () => {
        if (!permEnabled('screen')) { pushLine(active.id, { kind: 'err', text: 'Pantalla bloqueada en Permisos de CaRo Ai.' }); return; }
        const shot = window.joyai?.screenShot;
        if (!shot) { pushLine(active.id, { kind: 'sys', text: 'Captura disponible solo en la app de escritorio.' }); return; }
        const r = await shot().catch((e) => ({ ok: false as const, error: String(e) }));
        if (r.ok && r.path) {
            pushLine(active.id, { kind: 'sys', text: `Captura guardada: ${r.path}` });
            pushLine(active.id, { kind: 'out', text: 'Puedes adjuntarla a un modelo multimodal o abrirla desde Documentos/CaRoAi-Capturas.' });
        } else {
            pushLine(active.id, { kind: 'err', text: `Captura falló: ${r.error ?? 'error'}` });
        }
    };

    /** Panel de agente: «!» ejecuta en el shell; el resto va al modelo. */
    const sendAgent = async () => {
        const t = agentInput.trim();
        if (!t || agentBusy) return;
        setAgentInput('');
        if (t.startsWith('!')) {
            setAgentMsgs((m) => [...m, { role: 'user', text: t }]);
            await runCmd(t.slice(1));
            return;
        }
        const next = [...agentMsgs, { role: 'user' as const, text: t }];
        setAgentMsgs(next);
        setAgentBusy(true);
        try {
            const engine = state.engines.find((e) => e.enabled) ?? state.engines[0];
            if (!engine) throw new Error('sin motor');
            const rel = searchNotes(loadNotes(), t, 3);
            const ctx = rel.length ? `\nNotas de la bóveda:\n${rel.map((n) => `- ${n.title}: ${n.content.slice(0, 200)}`).join('\n')}` : '';
            const tone = AGENT_TONES[loadToneIndex()]?.prompt ?? '';
            const reply = await chatCompletion(engine, [
                { role: 'system', content: `Eres ${state.agentName}, asistente dentro de la terminal de CaRo Ai. ${tone}${ctx}` },
                ...next.map((m) => ({ role: m.role, content: m.text })),
            ]);
            setAgentMsgs((m) => [...m, { role: 'assistant', text: reply }]);
        } catch (e) {
            setAgentMsgs((m) => [...m, { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'sin respuesta'}` }]);
        } finally {
            setAgentBusy(false);
        }
    };

    const lineColor = (k: Line['kind']) =>
        k === 'err' ? '#f87171' : k === 'sys' ? '#71717a' : k === 'in' ? theme.prompt : theme.fg;

    return (
        <div className="h-full flex flex-col min-h-0" style={{ background: theme.bg, color: theme.fg }}>
            {/* Barra superior */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/10" style={{ background: theme.panel }}>
                <TermIcon size={15} style={{ color: theme.prompt }} />
                {/* Sesiones */}
                <div className="flex items-center gap-1 overflow-x-auto">
                    {sessions.map((s) => (
                        <div key={s.id} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono border ${s.id === activeId ? 'border-white/25 text-white' : 'border-white/10 text-neutral-400 hover:text-white'}`}>
                            <button type="button" onClick={() => setActiveId(s.id)}>{s.name}</button>
                            {sessions.length > 1 && (
                                <button type="button" onClick={() => closeSession(s.id)} className="text-neutral-600 hover:text-rose-400"><X size={10} /></button>
                            )}
                        </div>
                    ))}
                    <button type="button" onClick={newSession} className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/5" title="Nueva sesión"><Plus size={13} /></button>
                </div>
                <div className="flex-1" />
                {/* Herramientas */}
                <button type="button" onClick={() => void captureScreen()} className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/5" title="Capturar pantalla de la app"><Camera size={14} /></button>
                <button type="button" onClick={() => void openFile()} className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/5" title="Abrir archivo del equipo"><FolderOpen size={14} /></button>
                <button type="button" onClick={() => patchSession(active.id, (s) => ({ ...s, lines: [] }))} className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/5" title="Limpiar"><Trash2 size={14} /></button>
                <button type="button" onClick={() => setAgentOpen((o) => !o)} className={`p-1.5 rounded-md transition-colors ${agentOpen ? '' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`} style={agentOpen ? { color: theme.prompt } : undefined} title="Agente"><Bot size={14} /></button>
                {/* Extensiones (paquetes de comandos) */}
                <div className="relative" ref={packsRef}>
                    <button type="button" onClick={() => setPacksOpen((o) => !o)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] text-neutral-300 border border-white/10 hover:border-white/25">
                        <FileText size={12} /> Extensiones <ChevronDown size={11} />
                    </button>
                    {packsOpen && (
                        <div className="absolute right-0 top-9 z-30 w-64 rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden max-h-80 overflow-y-auto">
                            <button type="button" onClick={() => { importPack(); setPacksOpen(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[rgb(var(--accent))] hover:bg-white/5 border-b border-white/5">
                                <Plus size={11} /> Instalar extensión (.json)
                            </button>
                            {packs.length === 0 && (
                                <p className="px-3 py-3 text-[11px] text-neutral-500">Sin extensiones. Formato: {"{\"name\":\"git-tools\",\"commands\":[{\"label\":\"git status\",\"cmd\":\"git status\"}]}"}</p>
                            )}
                            {packs.map((p) => (
                                <div key={p.id} className="border-b border-white/5 last:border-0">
                                    <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02]">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{p.name}</span>
                                        <button type="button" onClick={() => setPacks((ps) => ps.filter((x) => x.id !== p.id))} className="text-neutral-600 hover:text-rose-400" title="Desinstalar"><X size={10} /></button>
                                    </div>
                                    {p.commands.map((c, i) => (
                                        <button key={i} type="button"
                                            onClick={() => { void runCmd(c.cmd); setPacksOpen(false); }}
                                            className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-neutral-300 hover:bg-white/5 truncate">
                                            ▸ {c.label}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {/* Skin selector */}
                <div className="relative" ref={themeMenuRef}>
                    <button type="button" onClick={() => setThemeMenu((o) => !o)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] text-neutral-300 border border-white/10 hover:border-white/25">
                        <Palette size={12} /> {theme.name} <ChevronDown size={11} />
                    </button>
                    {themeMenu && (
                        <div className="absolute right-0 top-9 z-30 w-52 rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden">
                            {[...BUILTIN_THEMES, ...themes.filter((t) => !BUILTIN_THEMES.some((b) => b.id === t.id))].map((t) => (
                                <button key={t.id} type="button" onClick={() => { setThemeId(t.id); setThemeMenu(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5">
                                    <span className="w-3 h-3 rounded-sm border border-white/20" style={{ background: t.bg }} />
                                    {t.name}{!BUILTIN_THEMES.some((b) => b.id === t.id) && <span className="text-[9px] text-neutral-600">(extensión)</span>}
                                </button>
                            ))}
                            <div className="border-t border-white/5 p-1.5 flex gap-1">
                                <button type="button" onClick={() => void importTheme()} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] text-neutral-300 hover:bg-white/5"><Upload size={10} /> Importar tema</button>
                                <button type="button" onClick={exportTheme} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] text-neutral-300 hover:bg-white/5"><Download size={10} /> Exportar</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Cuerpo: terminal + panel agente */}
            <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0 flex flex-col">
                    {/* Salida */}
                    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed">
                        {active.lines.length === 0 && (
                            <p style={{ color: '#71717a' }}>
                                {shell.label} — {isElectron ? 'escribe un comando y pulsa Enter' : 'modo solo vista (navegador web)'}
                                {'\n'}Atajos: ↑/↓ historial · Ctrl+L limpiar · Ctrl+C interrumpir línea.
                                {'\n'}Panel 🤖: chatea con el agente; comandos con «!» van al shell.
                            </p>
                        )}
                        {active.lines.map((l, i) => (
                            <p key={i} style={{ color: lineColor(l.kind), whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{l.text}</p>
                        ))}
                        {busy && <p style={{ color: '#71717a' }}>…ejecutando</p>}
                    </div>
                    {/* Input */}
                    <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-t border-white/10" style={{ background: theme.panel }}>
                        <span className="font-mono text-sm font-bold" style={{ color: theme.prompt }}>{shell.prompt}</span>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onKey}
                            placeholder={isElectron ? 'comando…' : 'disponible solo en la app de escritorio'}
                            disabled={!isElectron}
                            className="flex-1 bg-transparent outline-none font-mono text-[13px] placeholder:text-neutral-600"
                            style={{ color: theme.fg }}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Panel agente */}
                {agentOpen && (
                    <div className="w-80 shrink-0 border-l border-white/10 flex flex-col" style={{ background: theme.panel }}>
                        <p className="px-3 py-2 text-[10px] uppercase tracking-widest border-b border-white/5 flex items-center gap-1.5" style={{ color: theme.prompt }}>
                            <Bot size={11} /> Agente en terminal
                        </p>
                        <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
                            {agentMsgs.length === 0 && (
                                <p className="text-[11px] text-neutral-500">Pregunta lo que sea. Prefija con <code>!</code> para ejecutar en el shell (ej. <code>!dir</code>).</p>
                            )}
                            {agentMsgs.map((m, i) => (
                                <div key={i} className={`text-[12px] rounded-lg px-2.5 py-1.5 ${m.role === 'user' ? 'self-end bg-white/10 text-white' : 'self-start bg-white/[0.04] text-neutral-300'}`}>
                                    {m.text}
                                </div>
                            ))}
                            {agentBusy && <p className="text-[11px] text-neutral-500">pensando…</p>}
                        </div>
                        <div className="p-2 border-t border-white/5 flex gap-1.5">
                            <input value={agentInput} onChange={(e) => setAgentInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && void sendAgent()}
                                placeholder="pregunta o !comando"
                                className={`${inputCls} flex-1 !py-1.5 !text-xs`} />
                            <button type="button" onClick={() => void sendAgent()} disabled={agentBusy || !agentInput.trim()}
                                className="p-1.5 rounded-lg text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 disabled:opacity-40"><Send size={13} /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
