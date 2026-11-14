import React, { useEffect, useRef, useState } from 'react';
import { Copy, Terminal as TermIcon, Play, FolderCog, Route, Cpu, Trash2 } from 'lucide-react';
import { Section, Card } from '../../components/ui';
import { getSystemInfo, SystemInfo } from '../../system';

interface BridgeInfo { id: string; token: string; port: number | null; running: boolean }

/** Qué shell usa la consola interactiva según el SO del equipo. */
export function shellFor(platform?: string): string {
    switch (platform) {
        case 'win32': return 'cmd.exe (Windows)';
        case 'darwin': return 'zsh/sh (macOS)';
        case 'android': return 'Termux (shell Linux del usuario)';
        case 'ios': return 'sin shell local — usa SSH al equipo enlazado';
        default: return 'sh (POSIX)';
    }
}

interface Line { kind: 'in' | 'out' | 'err'; text: string }

const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {});

const HIST_KEY = 'caroai.termhist.v1';
const loadHist = (): string[] => { try { const v = localStorage.getItem(HIST_KEY); const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(-50) : []; } catch { return []; } };
const saveHist = (h: string[]) => { try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-50))); } catch { /* noop */ } };

export const TerminalModule: React.FC = () => {
    const [info, setInfo] = useState<SystemInfo | null>(null);
    const [bridge, setBridge] = useState<BridgeInfo | null>(null);
    const [cmd, setCmd] = useState('');
    const [hist, setHist] = useState<string[]>(loadHist);
    const [histIdx, setHistIdx] = useState(-1);
    const [lines, setLines] = useState<Line[]>([
        { kind: 'out', text: '[CaRo Ai] Consola lista. Escribe un comando y pulsa Enter (o Ejecutar).' },
        { kind: 'out', text: 'En la app de escritorio se ejecuta en TU shell real; en el navegador web esta consola es solo vista.' },
    ]);
    const [busy, setBusy] = useState(false);
    const [cmdOs, setCmdOs] = useState('windows');
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const isElectron = typeof window !== 'undefined' && !!window.joyai?.shellExec;

    useEffect(() => {
        let on = true;
        getSystemInfo().then((s) => { if (on) setInfo(s); }).catch(() => {});
        window.joyai?.bridgeInfo?.().then((b) => { if (on && b) setBridge(b); }).catch(() => {});
        return () => { on = false; };
    }, []);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [lines, busy]);

    const run = async () => {
        const c = cmd.trim();
        if (!c || busy) return;
        setHist((h) => { const n = [...h.filter((x) => x !== c), c]; saveHist(n); return n; });
        setHistIdx(-1);
        setCmd('');
        setLines((l) => [...l, { kind: 'in', text: `$ ${c}` }]);
        if (!isElectron) {
            setLines((l) => [...l, { kind: 'err', text: 'La ejecución real requiere la app de escritorio (Electron). En el navegador no hay acceso al shell por seguridad.' }]);
            return;
        }
        setBusy(true);
        const r = await window.joyai!.shellExec!(c).catch((e): { ok: boolean; output?: string; error?: string; code?: number } => ({ ok: false, error: String(e) }));
        setBusy(false);
        const out = (r.output ?? '').trim();
        if (out) {
            for (const ln of out.split('\n').slice(-60)) {
                setLines((l) => [...l, { kind: r.ok ? 'out' : 'err', text: ln || ' ' }]);
            }
        } else {
            setLines((l) => [...l, { kind: 'out', text: r.ok ? '(comando ejecutado, sin salida)' : `(código ${r.code ?? '?'})` }]);
        }
    };

    const PATHS = [
        { icon: FolderCog, k: 'Carpeta personal de CaRo Ai', v: 'Se crea al instalar (por usuario y SO)' },
        { icon: Route, k: 'Ruta de destino del CLI', v: info?.osName ? `Detectado: ${info.osName}` : 'Detecta el SO y usa la carpeta del usuario' },
        { icon: Cpu, k: 'CLI Path', v: info?.platform === 'win32' ? 'Windows: .\\caro.cmd' : '~/.local/bin/caro · Android: Termux' },
        { icon: Cpu, k: 'Auditoría de Hardware', v: 'Disponible tras permisos de diagnóstico' },
    ];

    return (
        <div className="flex flex-col gap-6">
            <Section title="Terminal interactiva" desc={`Shell real de este equipo: ${shellFor(info?.platform)}. Solo en la app de escritorio; en navegador es solo vista. No se usa Linux como objetivo (superficie de ataque).`}>
                <Card className="bg-black/50 border-white/10 font-mono text-[12px] leading-relaxed p-0 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                        <span className="text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
                            <TermIcon size={12} className="text-[rgb(var(--accent))]" />
                            {info?.osName ?? 'shell'} · {isElectron ? 'ejecución real' : 'solo vista (web)'}
                        </span>
                        <button type="button" onClick={() => setLines([])} className="text-neutral-500 hover:text-white transition-colors" aria-label="Limpiar">
                            <Trash2 size={13} />
                        </button>
                    </div>
                    <div ref={listRef} className="h-72 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">
                        {lines.map((l, i) => (
                            <p key={i} className={l.kind === 'in' ? 'text-[rgb(var(--accent))]' : l.kind === 'err' ? 'text-red-400/90' : 'text-neutral-400'}>
                                {l.kind === 'out' && <span className="text-neutral-600">  </span>}
                                {l.text}
                            </p>
                        ))}
                        {busy && <p className="text-neutral-500 animate-pulse">  …ejecutando</p>}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5 border-t border-white/5">
                        <span className="text-[rgb(var(--accent))] shrink-0">❯</span>
                        <input
                            ref={inputRef}
                            value={cmd}
                            onChange={(e) => setCmd(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { void run(); return; }
                                if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    if (hist.length === 0) return;
                                    const i = histIdx < 0 ? hist.length - 1 : Math.max(0, histIdx - 1);
                                    setHistIdx(i); setCmd(hist[i]);
                                } else if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    if (histIdx < 0) return;
                                    const i = histIdx + 1;
                                    if (i >= hist.length) { setHistIdx(-1); setCmd(''); }
                                    else { setHistIdx(i); setCmd(hist[i]); }
                                }
                            }}
                            placeholder={isElectron ? 'Escribe un comando…' : 'Disponible solo en la app de escritorio'}
                            disabled={!isElectron || busy}
                            className="flex-1 bg-transparent outline-none text-neutral-100 placeholder:text-neutral-600 disabled:opacity-50"
                            spellCheck={false}
                            autoComplete="off"
                        />
                        <button type="button" onClick={() => void run()} disabled={!isElectron || busy || !cmd.trim()} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-colors" aria-label="Ejecutar">
                            <Play size={14} />
                        </button>
                    </div>
                </Card>
            </Section>

            <Section title="Rutas y CLI por instalación" desc="Rutas y scripts se generan por instalación y dispositivo; no hay rutas universales ni carpetas de otros usuarios.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PATHS.map((p) => (
                        <Card key={p.k} className="flex items-start gap-3">
                            <p.icon size={16} className="text-[rgb(var(--accent))] mt-0.5 shrink-0" />
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-neutral-500">{p.k}</p>
                                <p className="text-xs text-neutral-300 mt-0.5 leading-relaxed">{p.v}</p>
                            </div>
                        </Card>
                    ))}
                </div>
            </Section>

            <Section title="Comandos del puente por SO" desc="Comandos reales generados con el ID y token de ESTA instalación. Enciende el puente en Agentes y Entornos para que el puerto sea válido.">
                {(() => {
                    const port = bridge?.port ?? 0;
                    const base = port ? `http://127.0.0.1:${port}` : 'http://127.0.0.1:<puerto>';
                    const tok = bridge?.token ?? '<token>';
                    const body = `'{"type":"search","target":"hola"}'`;
                    const SCRIPTS = [
                        { os: 'windows', label: 'Windows (PowerShell / cmd)', cmd: `curl -X POST ${base}/v1/action -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" -d ${body}` },
                        { os: 'macos', label: 'macOS (Terminal / zsh)', cmd: `curl -X POST ${base}/v1/action -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" -d ${body}` },
                        { os: 'android', label: 'Android (Termux)', cmd: `curl -X POST ${base}/v1/action -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" -d ${body}` },
                        { os: 'ios', label: 'iOS', cmd: 'Sin shell local en iOS. Usa SSH hacia tu equipo Windows/Mac enlazado (módulo Dispositivos) o la app CaRo Ai móvil.' },
                    ];
                    const active = SCRIPTS.find((s) => s.os === cmdOs) ?? SCRIPTS[0];
                    return (
                        <Card className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <select value={cmdOs} onChange={(e) => setCmdOs(e.target.value)}
                                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-neutral-300 outline-none">
                                    {SCRIPTS.map((s) => <option key={s.os} value={s.os} className="bg-neutral-900">{s.label}</option>)}
                                </select>
                                {active.os !== 'ios' && (
                                    <button type="button" onClick={() => copy(active.cmd)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 hover:text-white transition-colors">
                                        <Copy size={12} /> Copiar
                                    </button>
                                )}
                            </div>
                            <code className="text-[10px] font-mono text-neutral-400 bg-black/30 rounded-lg px-2.5 py-2 break-all">{active.cmd}</code>
                        </Card>
                    );
                })()}
                <p className="text-[11px] text-neutral-600 mt-3">
                    ID de esta instalación: <code className="font-mono text-neutral-400">{bridge?.id ?? 'disponible solo en la app de escritorio'}</code>
                    {bridge && !bridge.running && ' · el puente está apagado — enciéndelo en Agentes y Entornos'}
                </p>
            </Section>
        </div>
    );
};
