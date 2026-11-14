import React, { useRef, useState } from 'react';
import { Cast, Copy, Link2, MonitorSmartphone, Plus, RefreshCw, Trash2, Check, MonitorUp, MonitorPlay, Square } from 'lucide-react';
import { Section, Card, Pill } from '../../components/ui';
import {
    getLinkCode, regenerateLinkCode, loadLinkedDevices, saveLinkedDevices,
    normalizeCode, LinkedDevice,
} from '../../link';
import { startScreenShare, ShareSession, startViewer, ViewerHandle, listRemoteFiles, uploadRemoteFile, remoteFileUrl, fmtBytes, RemoteFile } from '../../screenshare';
import { pickFile } from '../../media';
import { permEnabled } from '../../permissions';

const inputCls =
    'w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors';

/**
 * Pantalla: proyección y control entre los dispositivos DEL MISMO USUARIO.
 * La vinculación es manual por código (sin servidor central): copias el código
 * de este equipo en tu otro dispositivo y lo agregas ahí. El canal de video/
 * control se establece por LAN/WebRTC directo una vez vinculados.
 */
export const ScreenModule: React.FC = () => {
    const [code, setCode] = useState(getLinkCode());
    const [copied, setCopied] = useState(false);
    const [devices, setDevices] = useState<LinkedDevice[]>(loadLinkedDevices);
    const [joinCode, setJoinCode] = useState('');
    const [joinName, setJoinName] = useState('');
    const [projecting, setProjecting] = useState<string | null>(null);
    const [note, setNote] = useState('');
    // Proyección real LAN
    const [sharing, setSharing] = useState(false);
    const [shareIps, setShareIps] = useState<string[]>([]);
    const shareRef = useRef<ShareSession | null>(null);
    const [viewHost, setViewHost] = useState('');
    const [viewCode, setViewCode] = useState('');
    const [viewing, setViewing] = useState(false);
    const [frameUrl, setFrameUrl] = useState<string | null>(null);
    const [viewStatus, setViewStatus] = useState('');
    const viewerRef = useRef<ViewerHandle | null>(null);
    const frameUrlRef = useRef<string | null>(null);
    const [remoteFiles, setRemoteFiles] = useState<RemoteFile[] | null>(null);
    const [filesMsg, setFilesMsg] = useState('');
    const [sending, setSending] = useState(false);

    const isElectron = typeof window !== 'undefined' && !!window.joyai?.linkShareStart;

    const stopShare = () => {
        shareRef.current?.stop();
        shareRef.current = null;
        setSharing(false);
        void window.joyai?.linkShareStop?.();
        setShareIps([]);
    };

    const startShare = async () => {
        if (!permEnabled('screen')) { setNote('Pantalla bloqueada: actívala en Sistema → Permisos.'); return; }
        if (!isElectron) { setNote('La proyección real requiere la app de escritorio (Electron).'); return; }
        try {
            const st = await window.joyai!.linkShareStatus!();
            const r = await window.joyai!.linkShareStart!({ code, name: 'Este equipo' });
            if (!r.ok) { setNote('No se pudo iniciar el servidor de proyección.'); return; }
            const session = await startScreenShare(r.port ?? 47823, (m) => setNote(m));
            shareRef.current = session;
            setSharing(true);
            setShareIps((r.ips ?? st.ips ?? []).map((i) => i.address));
            setNote('Transmitiendo tu pantalla. En tu otro dispositivo abre Pantalla → "Ver pantalla" con una de estas IPs y tu código de vínculo.');
        } catch (e) {
            setNote(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Cancelaste la selección de pantalla.' : `Error al compartir: ${String(e)}`);
        }
    };

    const stopView = () => {
        viewerRef.current?.stop();
        viewerRef.current = null;
        setViewing(false);
        if (frameUrlRef.current) { URL.revokeObjectURL(frameUrlRef.current); frameUrlRef.current = null; }
        setFrameUrl(null);
    };

    const startView = () => {
        const host = viewHost.trim();
        const c = normalizeCode(viewCode) ?? viewCode.trim().toUpperCase();
        if (!host || !c) { setViewStatus('Escribe la IP del otro equipo y su código CARO-XXXX-XXXX.'); return; }
        stopView();
        setViewing(true);
        setViewStatus('Conectando…');
        viewerRef.current = startViewer(host, 47823, c, (blob) => {
            if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
            const url = URL.createObjectURL(blob);
            frameUrlRef.current = url;
            setFrameUrl(url);
        }, (m) => setViewStatus(m));
    };

    const persist = (next: LinkedDevice[]) => { setDevices(next); saveLinkedDevices(next); };

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setNote('No se pudo copiar; selecciona el código manualmente.');
        }
    };

    const addDevice = () => {
        const normalized = normalizeCode(joinCode);
        if (!normalized) { setNote('Código inválido. Debe tener el formato CARO-XXXX-XXXX.'); return; }
        if (devices.some((d) => d.code === normalized)) { setNote('Ese dispositivo ya está vinculado.'); return; }
        persist([...devices, {
            id: `dev-${Date.now()}`,
            name: joinName.trim() || `Dispositivo ${devices.length + 1}`,
            code: normalized,
            addedAt: Date.now(),
        }]);
        setJoinCode(''); setJoinName('');
        setNote(`Dispositivo agregado. La proyección se activa cuando ambos equipos estén en la misma red o vía el canal seguro.`);
    };

    const removeDevice = (id: string) => persist(devices.filter((d) => d.id !== id));

    const startProjection = (d: LinkedDevice) => {
        // La conexión real es por IP + código en "Ver pantalla de otro equipo".
        // Aquí solo preparamos el formulario y avisamos — nada se simula.
        setJoinCode('');
        setNote(`Para ver "${d.name}": arriba en "Ver pantalla de otro equipo" escribe su IP y su código ${d.code}. Si aún no lo tienes, pídeselo en ese equipo.`);
    };

    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Pantalla de proyección"
                desc="Proyecta y controla la pantalla de tus otros dispositivos (Windows, Android, Mac, iOS) desde aquí o pídelo por voz al agente. Solo entre dispositivos tuyos: no hay servidores compartidos."
            >
                <Card className="flex items-start gap-3 border-[rgb(var(--accent)/0.2)] bg-[rgb(var(--accent)/0.04)]">
                    <MonitorSmartphone size={18} className="text-[rgb(var(--accent))] shrink-0 mt-0.5" />
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                        Ejemplos: "proyéctame la pantalla de mi Windows", "abre VS Code en mi laptop",
                        "muéstrame el escritorio del celular". La vinculación es manual por código — nada se conecta solo.
                    </p>
                </Card>
            </Section>

            {/* Proyección real por LAN */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Section title="Transmitir MI pantalla" desc="Comparte la pantalla de ESTE equipo con tus otros dispositivos por la red local (WiFi/LAN). Sin internet ni nube.">
                    {!sharing ? (
                        <button type="button" onClick={() => void startShare()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity">
                            <MonitorUp size={15} /> Transmitir pantalla
                        </button>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-emerald-400 text-xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Transmitiendo — los demás dispositivos pueden verte
                            </div>
                            {shareIps.length > 0 && (
                                <p className="text-[11px] text-neutral-400 font-mono">IP para conectar: {shareIps.join(' · ')}</p>
                            )}
                            <p className="text-[11px] text-neutral-500">Código que deben usar: <span className="font-mono text-[rgb(var(--accent))]">{code}</span></p>
                            <button type="button" onClick={stopShare} className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-rose-300 border border-rose-400/30 hover:bg-rose-400/10 transition-colors">
                                <Square size={12} /> Detener transmisión
                            </button>
                        </div>
                    )}
                </Section>

                <Section title="Ver pantalla de otro equipo" desc="Escribe la IP del equipo que está transmitiendo y el código de vínculo que él muestra.">
                    <div className="flex flex-col gap-2">
                        <input value={viewHost} onChange={(e) => setViewHost(e.target.value)} placeholder="IP del otro equipo (ej. 192.168.1.20)" className={`${inputCls} font-mono`} />
                        <div className="flex gap-2">
                            <input value={viewCode} onChange={(e) => setViewCode(e.target.value.toUpperCase())} placeholder="CARO-XXXX-XXXX" className={`${inputCls} font-mono tracking-wider`} />
                            {!viewing ? (
                                <button type="button" onClick={startView} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity shrink-0">
                                    <MonitorPlay size={14} /> Ver
                                </button>
                            ) : (
                                <button type="button" onClick={stopView} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-rose-300 border border-rose-400/30 hover:bg-rose-400/10 transition-colors shrink-0">
                                    <Square size={13} /> Detener
                                </button>
                            )}
                        </div>
                        {viewStatus && <p className="text-[11px] text-neutral-500">{viewStatus}</p>}
                    </div>
                    {frameUrl && (
                        <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black">
                            <img src={frameUrl} alt="Pantalla remota" className="w-full h-auto block" />
                        </div>
                    )}
                    {/* Archivos entre dispositivos */}
                    <div className="mt-4 border-t border-white/5 pt-3">
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={async () => {
                                const host = viewHost.trim(); const c = normalizeCode(viewCode) ?? viewCode.trim().toUpperCase();
                                if (!host || !c) { setFilesMsg('Escribe IP y código primero.'); return; }
                                const r = await listRemoteFiles(host, c);
                                if (r) { setRemoteFiles(r.files); setFilesMsg(r.dir ? `Carpeta remota: ${r.dir}` : ''); }
                                else setFilesMsg('No se pudo leer la carpeta remota (¿está transmitiendo o el código es correcto?).');
                            }} className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors">
                                Ver archivos del otro equipo
                            </button>
                            <button type="button" disabled={sending} onClick={async () => {
                                const host = viewHost.trim(); const c = normalizeCode(viewCode) ?? viewCode.trim().toUpperCase();
                                if (!host || !c) { setFilesMsg('Escribe IP y código primero.'); return; }
                                const f = (await pickFile('*/*')) as File | null;
                                if (!f) return;
                                setSending(true);
                                const ok = await uploadRemoteFile(host, c, f);
                                setSending(false);
                                setFilesMsg(ok ? `✓ ${f.name} enviado al otro equipo (Documentos/CaRoAi-Compartido)` : `Error al enviar ${f.name}`);
                            }} className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors disabled:opacity-50">
                                {sending ? 'Enviando…' : 'Enviar archivo'}
                            </button>
                        </div>
                        {isElectron && !sharing && (
                            <button type="button" onClick={async () => {
                                const r = await window.joyai!.linkShareStart!({ code, name: 'Este equipo' }).catch(() => null);
                                if (r?.ok) { setNote('Intercambio de archivos activo en este equipo (Documentos/CaRoAi-Compartido). Usa "Transmitir pantalla" si además quieres mostrar tu pantalla.'); }
                                else setNote('No se pudo activar el intercambio.');
                            }} className="mt-2 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-400 border border-dashed border-white/15 hover:border-white/30 hover:text-neutral-200 transition-colors">
                                Activar carpeta compartida en ESTE equipo
                            </button>
                        )}
                        {filesMsg && <p className="text-[11px] text-neutral-500 mt-2">{filesMsg}</p>}
                        {remoteFiles && remoteFiles.length > 0 && (
                            <div className="mt-2 flex flex-col gap-1">
                                {remoteFiles.map((f) => (
                                    <a
                                        key={f.name}
                                        href={remoteFileUrl(viewHost.trim(), normalizeCode(viewCode) ?? viewCode.trim().toUpperCase(), f.name)}
                                        download={f.name}
                                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-[11px] text-neutral-300 hover:border-white/20 hover:text-white transition-colors"
                                    >
                                        <span className="truncate">{f.name}</span>
                                        <span className="text-neutral-600 shrink-0 ml-2">{fmtBytes(f.size)}</span>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Tu código */}
                <Section title="Tu código de conexión" desc="Compártelo solo con tus propios dispositivos.">
                    <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm font-mono tracking-widest text-[rgb(var(--accent))] text-center">
                            {code}
                        </code>
                        <button type="button" onClick={() => void copyCode()} className="p-2.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white hover:border-white/25 transition-colors" aria-label="Copiar código">
                            {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setCode(regenerateLinkCode()); setNote('Código regenerado. El anterior ya no sirve.'); }}
                            className="p-2.5 rounded-lg border border-white/10 text-neutral-400 hover:text-white hover:border-white/25 transition-colors"
                            aria-label="Regenerar código"
                            title="Regenerar código"
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-2">
                        En tu otro dispositivo abre CaRo Ai → Pantalla → pega este código para agregarlo.
                    </p>
                </Section>

                {/* Agregar dispositivo */}
                <Section title="Agregar dispositivo" desc="Pega el código que muestra el otro equipo.">
                    <div className="flex flex-col gap-2">
                        <input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Nombre (ej. Mi Windows)" className={inputCls} />
                        <div className="flex gap-2">
                            <input
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                placeholder="CARO-XXXX-XXXX"
                                className={`${inputCls} font-mono tracking-wider`}
                            />
                            <button type="button" onClick={addDevice} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity shrink-0">
                                <Plus size={14} /> Agregar
                            </button>
                        </div>
                    </div>
                </Section>
            </div>

            {/* Dispositivos vinculados */}
            <Section title="Dispositivos vinculados" desc="Equipos que aceptaste conectar (solo los tuyos).">
                {devices.length === 0 ? (
                    <p className="text-xs text-neutral-500">Ningún dispositivo vinculado todavía.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {devices.map((d) => (
                            <Card key={d.id} className="flex items-center gap-3">
                                <Cast size={16} className="text-[rgb(var(--accent))] shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{d.name}</p>
                                    <p className="text-[10px] text-neutral-500 font-mono">{d.code}</p>
                                </div>
                                <Pill>{projecting === d.id ? 'Conectando…' : 'Vinculado'}</Pill>
                                <button
                                    type="button"
                                    onClick={() => startProjection(d)}
                                    disabled={projecting === d.id}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-[rgb(var(--accent)/0.4)] hover:bg-[rgb(var(--accent)/0.1)] transition-colors disabled:opacity-50"
                                >
                                    <Cast size={12} /> Proyectar
                                </button>
                                <button type="button" onClick={() => removeDevice(d.id)} aria-label={`Quitar ${d.name}`} className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 transition-colors">
                                    <Trash2 size={14} />
                                </button>
                            </Card>
                        ))}
                    </div>
                )}
                {note && <p className="text-[11px] text-[rgb(var(--accent))] mt-2 flex items-center gap-1.5"><Link2 size={11} />{note}</p>}
            </Section>
        </div>
    );
};
