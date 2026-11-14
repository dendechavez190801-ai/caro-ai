import React, { useEffect, useState } from 'react';
import { Laptop, Wifi, Globe, ShieldCheck, Copy, Check, Link2, Terminal, Plus, Trash2, Play } from 'lucide-react';
import { Section, Card, Pill } from '../../components/ui';
import { getSystemInfo, SystemInfo } from '../../system';
import { getLinkCode, loadLinkedDevices, LinkedDevice } from '../../link';

/** Dispositivo SSH propio guardado localmente (sin contraseñas: usa llaves del sistema). */
interface SshDevice {
    id: string;
    name: string;
    user: string;
    host: string;
    port: number;
}

const SSH_KEY = 'caroai.ssh-devices.v1';

function loadSshDevices(): SshDevice[] {
    try {
        const raw = localStorage.getItem(SSH_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveSshDevices(devices: SshDevice[]): void {
    try { localStorage.setItem(SSH_KEY, JSON.stringify(devices)); } catch { /* noop */ }
}

export const DevicesModule: React.FC = () => {
    const [info, setInfo] = useState<SystemInfo | null>(null);
    const [code] = useState(getLinkCode);
    const [copied, setCopied] = useState(false);
    const [devices] = useState<LinkedDevice[]>(loadLinkedDevices);
    const [sshDevices, setSshDevices] = useState<SshDevice[]>(loadSshDevices);
    const [sshForm, setSshForm] = useState({ name: '', user: '', host: '', port: '22' });
    const [sshCmd, setSshCmd] = useState<Record<string, string>>({});
    const [sshOut, setSshOut] = useState<Record<string, { ok: boolean; text: string }>>({});
    const [sshBusy, setSshBusy] = useState<string | null>(null);
    const [sshMsg, setSshMsg] = useState<string | null>(null);

    useEffect(() => {
        let on = true;
        getSystemInfo().then((s) => { if (on) setInfo(s); }).catch(() => {});
        return () => { on = false; };
    }, []);

    const localIp = info?.networkIp ?? '—';
    const hostName = info?.hostname ? `${info.osName} (${info.hostname})` : (info?.osName ?? 'Este equipo');

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* selección manual */ }
    };

    const addSshDevice = () => {
        const host = sshForm.host.trim();
        const user = sshForm.user.trim();
        if (!host || !user) { setSshMsg('Falta usuario u host.'); return; }
        const port = Number(sshForm.port) || 22;
        const dev: SshDevice = {
            id: `ssh-${Date.now()}`,
            name: sshForm.name.trim() || `${user}@${host}`,
            user, host, port,
        };
        const next = [...sshDevices, dev];
        setSshDevices(next);
        saveSshDevices(next);
        setSshForm({ name: '', user: '', host: '', port: '22' });
        setSshMsg(null);
    };

    const removeSshDevice = (id: string) => {
        const next = sshDevices.filter((d) => d.id !== id);
        setSshDevices(next);
        saveSshDevices(next);
        setSshOut((o) => { const c = { ...o }; delete c[id]; return c; });
        setSshCmd((c) => { const n = { ...c }; delete n[id]; return n; });
    };

    const sshRun = async (dev: SshDevice, command?: string) => {
        const ssh = window.joyai?.deviceSsh;
        if (!ssh) { setSshMsg('SSH solo disponible en la app de escritorio.'); return; }
        const cmd = (command ?? sshCmd[dev.id] ?? '').trim();
        if (!cmd) { setSshMsg('Escribe un comando.'); return; }
        setSshBusy(dev.id);
        setSshMsg(null);
        const r: { ok: boolean; output?: string; error?: string } = await ssh({ host: dev.host, user: dev.user, port: dev.port, command: cmd })
            .catch((e): { ok: boolean; error?: string } => ({ ok: false, error: String(e) }));
        setSshOut((o) => ({ ...o, [dev.id]: { ok: r.ok, text: r.ok ? (r.output ?? '(sin salida)') : `Error: ${r.error ?? 'falló'}` } }));
        setSshBusy(null);
    };

    return (
        <div className="flex flex-col gap-6">
            <Section title="Dispositivos y Red" desc="IP local real del equipo; cada usuario tiene su propia clave de red cifrada.">
                <Card className="flex flex-wrap items-center justify-between gap-3 border-[rgb(var(--accent)/0.25)] bg-[rgb(var(--accent)/0.06)]">
                    <div className="flex items-center gap-3">
                        <Wifi size={18} className="text-[rgb(var(--accent))]" />
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Tu IP local (detectada)</p>
                            <code className="text-sm font-mono text-white">{localIp !== '—' ? localIp : 'No detectada en web'}</code>
                        </div>
                    </div>
                    <Pill active={localIp !== '—'}>{localIp !== '—' ? 'Detectada' : 'N/D'}</Pill>
                </Card>
                <p className="text-[11px] text-neutral-500 mt-3">En Electron se lee la IPv4 real de la tarjeta de red; en navegador la IP local no es accesible por seguridad.</p>
            </Section>

            <Section title="Conexión única" desc="Código para vincular TUS dispositivos entre sí (Windows ↔ Android ↔ Mac). Sin servidor central: la vinculación es manual.">
                <Card className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Link2 size={18} className="text-[rgb(var(--accent))]" />
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Tu código de conexión</p>
                            <code className="text-sm font-mono tracking-widest text-white">{code}</code>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void copyCode()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-white/10 hover:border-white/25 transition-colors"
                    >
                        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} {copied ? 'Copiado' : 'Copiar'}
                    </button>
                </Card>
                <p className="text-[11px] text-neutral-500 mt-3">
                    En tu otro dispositivo abre CaRo Ai → Pantalla o Dispositivos y pega este código. La proyección de pantalla y el control remoto se gestionan en el módulo <span className="text-neutral-300">Pantalla</span>.
                </p>
            </Section>

            <Section title="Dispositivos enlazados" desc="Este equipo y los que vinculaste con tu código.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Card className="flex items-center justify-between gap-3 border-[rgb(var(--accent)/0.3)]">
                        <div className="flex items-center gap-3 min-w-0">
                            <Laptop size={18} className="text-[rgb(var(--accent))] shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-white truncate">{hostName}</p>
                                <p className="text-[11px] text-neutral-500 font-mono">{localIp} · Host</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Pill>Este equipo</Pill>
                            <ShieldCheck size={14} className="text-emerald-400" />
                        </div>
                    </Card>
                    {devices.map((d) => (
                        <Card key={d.id} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <Laptop size={18} className="text-[rgb(var(--accent))] shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-white truncate">{d.name}</p>
                                    <p className="text-[11px] text-neutral-500 font-mono">{d.code}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Pill>Vinculado</Pill>
                                <ShieldCheck size={14} className="text-emerald-400" />
                            </div>
                        </Card>
                    ))}
                    {devices.length === 0 && (
                        <Card className="sm:col-span-2 flex items-center gap-3 text-neutral-500">
                            <Globe size={16} />
                            <p className="text-xs">Sin otros dispositivos vinculados. Usa tu código de conexión para agregar tu Windows, Android, Mac o iPhone.</p>
                        </Card>
                    )}
                </div>
            </Section>

            <Section title="Control por SSH" desc="Ejecuta comandos en tus otros equipos por SSH (OpenSSH del sistema). Usa llaves, nunca guarda contraseñas. En el otro equipo debes tener sshd activo y tu llave autorizada.">
                <Card className="flex flex-wrap items-end gap-2">
                    <input
                        type="text" placeholder="Nombre (ej. Laptop trabajo)" value={sshForm.name}
                        onChange={(e) => setSshForm({ ...sshForm, name: e.target.value })}
                        className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] w-44"
                    />
                    <input
                        type="text" placeholder="Usuario" value={sshForm.user}
                        onChange={(e) => setSshForm({ ...sshForm, user: e.target.value })}
                        className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] w-32"
                    />
                    <input
                        type="text" placeholder="IP o host" value={sshForm.host}
                        onChange={(e) => setSshForm({ ...sshForm, host: e.target.value })}
                        className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] w-40"
                    />
                    <input
                        type="text" placeholder="Puerto" value={sshForm.port}
                        onChange={(e) => setSshForm({ ...sshForm, port: e.target.value })}
                        className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] w-20"
                    />
                    <button
                        type="button" onClick={addSshDevice}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] hover:opacity-90 transition-opacity"
                    >
                        <Plus size={12} /> Agregar
                    </button>
                </Card>
                {sshMsg && <p className="text-[11px] text-amber-400 mt-2">{sshMsg}</p>}
                <p className="text-[11px] text-neutral-500 mt-3">
                    En el otro equipo: activar OpenSSH Server y autorizar tu llave (<code className="text-neutral-400">ssh-copy-id usuario@host</code> o manualmente en <code className="text-neutral-400">~/.ssh/authorized_keys</code>).
                </p>

                <div className="flex flex-col gap-3 mt-4">
                    {sshDevices.map((d) => (
                        <Card key={d.id} className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Terminal size={15} className="text-[rgb(var(--accent))] shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-white truncate">{d.name}</p>
                                        <p className="text-[11px] text-neutral-500 font-mono">{d.user}@{d.host}:{d.port}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                        type="button" onClick={() => void sshRun(d, 'echo CARO_SSH_OK && hostname')}
                                        disabled={sshBusy === d.id}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/25 transition-colors disabled:opacity-50"
                                    >
                                        <Play size={11} /> Probar
                                    </button>
                                    <button
                                        type="button" onClick={() => removeSshDevice(d.id)}
                                        className="p-1.5 rounded-lg text-red-300/70 hover:text-red-300 border border-white/5 hover:border-red-400/30 transition-colors"
                                        aria-label={`Eliminar ${d.name}`}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text" value={sshCmd[d.id] ?? ''} placeholder="comando remoto (ej. ls -la, df -h, systemctl status nginx)"
                                    onChange={(e) => setSshCmd({ ...sshCmd, [d.id]: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') void sshRun(d); }}
                                    className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]"
                                />
                                <button
                                    type="button" onClick={() => void sshRun(d)} disabled={sshBusy === d.id}
                                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/10 text-white hover:bg-white/15 transition-colors disabled:opacity-50"
                                >
                                    {sshBusy === d.id ? '…' : 'Ejecutar'}
                                </button>
                            </div>
                            {sshOut[d.id] && (
                                <pre className={`text-[11px] font-mono rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap ${sshOut[d.id].ok ? 'bg-emerald-500/5 text-emerald-200/90 border border-emerald-400/10' : 'bg-red-500/5 text-red-200/90 border border-red-400/10'}`}>
                                    {sshOut[d.id].text}
                                </pre>
                            )}
                        </Card>
                    ))}
                    {sshDevices.length === 0 && (
                        <p className="text-xs text-neutral-500 flex items-center gap-2"><Terminal size={14} /> Agrega un equipo para probar la conexión SSH.</p>
                    )}
                </div>
            </Section>
        </div>
    );
};
