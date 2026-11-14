import React, { useEffect, useState } from 'react';
import { Copy, Plus, HelpCircle, Trash2, Play, Square, Terminal } from 'lucide-react';
import { Section, Card, Pill, DemoBadge } from '../../components/ui';

const KNOWN_ENVS = [
    'VS Code', 'Cursor IDE', 'Claude Code', 'Devin CLI', 'OpenCode', 'Hermes',
    'Android Studio', 'Antigravity', 'GitHub CLI', 'Blender',
];

interface RegisteredAgent { id: string; name: string; kind: string; endpoint: string }
interface BridgeInfo { id: string; token: string; port: number | null; running: boolean }

const AGENTS_KEY = 'caroai.agents.v1';

function loadAgents(): RegisteredAgent[] {
    try {
        const raw = localStorage.getItem(AGENTS_KEY);
        const p = raw ? JSON.parse(raw) : [];
        return Array.isArray(p) ? p : [];
    } catch { return []; }
}

/**
 * Agentes y Entornos: cada instalación tiene un ID + token únicos
 * (userData/install.json) y un puente HTTP local en 127.0.0.1 que acepta
 * solo 3 acciones seguras (url/search/app). El comando de conexión es
 * generado por esta instalación — nunca es universal ni compartido.
 */
export const AgentsModule: React.FC = () => {
    const [agents, setAgents] = useState<RegisteredAgent[]>(loadAgents);
    const [name, setName] = useState('');
    const [kind, setKind] = useState('CLI');
    const [endpoint, setEndpoint] = useState('');
    const [cmdOs, setCmdOs] = useState('windows');
    const [cmdsOpen, setCmdsOpen] = useState(false);
    const [note, setNote] = useState('');
    const [bridge, setBridge] = useState<BridgeInfo | null>(null);
    const [busy, setBusy] = useState(false);

    const isElectron = !!window.joyai?.bridgeInfo;

    useEffect(() => {
        let on = true;
        window.joyai?.bridgeInfo?.().then((b) => { if (on && b) setBridge(b); }).catch(() => {});
        return () => { on = false; };
    }, []);

    const persistAgents = (next: RegisteredAgent[]) => {
        setAgents(next);
        try { localStorage.setItem(AGENTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
    };

    const toggleBridge = async () => {
        setBusy(true);
        try {
            if (bridge?.running) {
                await window.joyai?.bridgeStop?.();
            } else {
                const r = await window.joyai?.bridgeStart?.();
                if (r?.ok) setNote('Puente iniciado. Ya puedes conectar tus agentes con el comando de abajo.');
                else setNote(`No se pudo iniciar el puente (${r?.error ?? 'error'}).`);
            }
            const b = await window.joyai?.bridgeInfo?.();
            if (b) setBridge(b);
        } finally {
            setBusy(false);
        }
    };

    const register = () => {
        const n = name.trim();
        if (!n) { setNote('Escribe un nombre para el agente.'); return; }
        // Si el puente está activo, el endpoint por defecto es SU puerto real de esta instalación.
        const ep = endpoint.trim() || (bridge?.running && bridge.port ? `http://127.0.0.1:${bridge.port}` : '');
        persistAgents([...agents, { id: `agent-${Date.now()}`, name: n, kind, endpoint: ep }]);
        setName('');
        setNote(`"${n}" registrado en esta instalación.`);
    };

    // Comandos reales generados con los datos de ESTA instalación (ID/token/puerto únicos).
    const port = bridge?.port ?? 0;
    const base = port ? `http://127.0.0.1:${port}` : 'http://127.0.0.1:<puerto>';
    const installId = bridge?.id ?? '<id-de-instalacion>';
    const token = bridge?.token ?? '<token>';
    const CMD_VARIANTS: { id: string; label: string; cmd: string }[] = [
        { id: 'windows', label: 'Windows (PowerShell/cmd)', cmd: `curl -X POST ${base}/v1/action -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d "{\\"type\\":\\"url\\",\\"target\\":\\"https://youtube.com\\"}"` },
        { id: 'macos', label: 'macOS (Terminal/zsh)', cmd: `curl -X POST ${base}/v1/action -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"type":"url","target":"https://youtube.com"}'` },
        { id: 'android', label: 'Android (Termux)', cmd: `curl -X POST ${base}/v1/action -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '{"type":"url","target":"https://youtube.com"}'` },
        { id: 'ios', label: 'iOS', cmd: 'Sin shell local en iOS: usa la app CaRo Ai móvil o SSH al equipo enlazado (Dispositivos).' },
    ];
    const activeCmd = CMD_VARIANTS.find((v) => v.id === cmdOs) ?? CMD_VARIANTS[0];

    return (
        <div className="flex flex-col gap-6">
            <Section title="Agentes y Entornos" desc="Cada instalación tiene su propio ID, token y puerto locales. Los agentes externos (tus CLIs, scripts) controlan CaRo Ai por el puente local — solo acciones permitidas, solo en tu equipo." demo={!isElectron}>
                <Card className="flex items-start gap-3 border-[rgb(var(--accent)/0.25)] bg-[rgb(var(--accent)/0.06)]">
                    <HelpCircle size={16} className="text-[rgb(var(--accent))] mt-0.5 shrink-0" />
                    <div className="text-[11px] text-neutral-300 leading-relaxed">
                        <p className="font-semibold text-white mb-1">¿Cómo conecto mi agente?</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-neutral-400">
                            <li>Enciende el <strong>Puente de agentes</strong> (botón abajo). Se genera un puerto aleatorio solo en 127.0.0.1.</li>
                            <li>Copia el comando curl generado — lleva tu ID y token únicos de esta instalación.</li>
                            <li>Tu agente/CLI lo ejecuta para abrir URLs, buscar o lanzar apps en este equipo.</li>
                        </ol>
                    </div>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                    {KNOWN_ENVS.map((e) => (
                        <Card key={e} className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-[rgb(var(--accent))]" />
                                <span className="text-sm text-white">{e}</span>
                            </div>
                            <Pill active>Compatible</Pill>
                        </Card>
                    ))}
                </div>

                {/* Puente de agentes real */}
                <Card className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Terminal size={15} className="text-[rgb(var(--accent))]" />
                            <div>
                                <p className="text-[11px] uppercase tracking-widest text-neutral-500">Puente de agentes local</p>
                                <p className="text-xs text-neutral-300 font-mono">
                                    {bridge
                                        ? <>ID: <span className="text-white">{bridge.id}</span> · {bridge.running ? <>puerto <span className="text-emerald-400">{bridge.port}</span> · activo</> : 'apagado'}</>
                                        : 'Solo disponible en la app de escritorio'}
                                    {!isElectron && <DemoBadge />}
                                </p>
                            </div>
                        </div>
                        {isElectron && (
                            <button
                                type="button"
                                onClick={() => void toggleBridge()}
                                disabled={busy}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${bridge?.running ? 'text-rose-300 border border-rose-400/40 bg-rose-400/10 hover:bg-rose-400/20' : 'text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90'}`}
                            >
                                {bridge?.running ? <><Square size={11} /> Detener puente</> : <><Play size={11} /> Encender puente</>}
                            </button>
                        )}
                    </div>
                    {bridge && (
                        <div className="rounded-lg bg-black/40 border border-white/10">
                            <button type="button" onClick={() => setCmdsOpen((o) => !o)}
                                className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-300 transition-colors">
                                <span>Comandos del puente · ID {installId.slice(0, 14)}…</span>
                                <span>{cmdsOpen ? '▲' : '▼'}</span>
                            </button>
                            {cmdsOpen && (
                                <div className="px-3 pb-3 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <select value={cmdOs} onChange={(e) => setCmdOs(e.target.value)}
                                            className="px-2 py-1 rounded-md bg-white/[0.04] border border-white/10 text-[11px] text-neutral-300 outline-none">
                                            {CMD_VARIANTS.map((v) => <option key={v.id} value={v.id} className="bg-neutral-900">{v.label}</option>)}
                                        </select>
                                        <button type="button" onClick={() => navigator.clipboard?.writeText(activeCmd.cmd).catch(() => {})} className="inline-flex items-center gap-1 text-[10px] text-neutral-400 hover:text-white">
                                            <Copy size={10} /> Copiar
                                        </button>
                                    </div>
                                    <pre className="text-[10px] font-mono text-[rgb(var(--accent))] whitespace-pre-wrap break-all bg-black/30 rounded-md p-2.5">{activeCmd.cmd}</pre>
                                    <p className="text-[10px] text-neutral-600">
                                        Acciones permitidas: <code>url</code>, <code>search</code>, <code>app</code>. Token y puerto únicos de esta instalación — nunca se comparten entre usuarios.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            </Section>

            <Section title="Registrar agente en esta instalación" desc="Anota qué agentes/entornos tienes; se guardan solo en este equipo.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (p. ej. Devin CLI)" className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                    <select value={kind} onChange={(e) => setKind(e.target.value)} className="px-3 py-2 rounded-lg bg-[#141414] border border-white/10 text-sm text-neutral-200 outline-none focus:border-[rgb(var(--accent)/0.5)]">
                        {['CLI', 'Editor', 'Agente', 'Otro'].map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={bridge?.running && bridge.port ? `http://127.0.0.1:${bridge.port} (puerto del puente)` : 'Endpoint (vacío = puente si está activo)'} className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] font-mono" />
                </div>
                <button type="button" onClick={register} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity">
                    <Plus size={14} /> Registrar agente
                </button>
                {note && <p className="text-[11px] text-[rgb(var(--accent))] mt-2">{note}</p>}

                {agents.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {agents.map((a) => (
                            <Card key={a.id} className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-white">{a.name}</p>
                                    <p className="text-[11px] text-neutral-500 font-mono">{a.kind} · {a.endpoint}</p>
                                </div>
                                <button type="button" onClick={() => persistAgents(agents.filter((g) => g.id !== a.id))} aria-label="Quitar" className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 transition-colors">
                                    <Trash2 size={14} />
                                </button>
                            </Card>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
};
