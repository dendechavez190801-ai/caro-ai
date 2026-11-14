import React, { useState } from 'react';
import { Mic, MousePointer, FolderOpen, Camera, Monitor, Globe, Download, ShieldCheck, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Section, Card, Pill } from '../../components/ui';
import { AppPermKey, PERM_BLOCKS, PERM_LABELS, loadPerms, permEnabled, savePerm } from '../../permissions';

/**
 * Permisos (punto 8 del feedback #3): dos capas honestas.
 *  - Permiso del SISTEMA: lo concede el SO; aquí se prueba en vivo.
 *  - Interruptor DE LA APP: el usuario enciende/apaga cada capacidad y las
 *    funciones la respetan (dictado, proyección, descargas…).
 */

type Status = 'real' | 'parcial' | 'no';

const PERMS: { icon: React.ComponentType<{ size?: number | string; className?: string }>; title: string; desc: string; status: Status; statusLabel: string; key: AppPermKey | null }[] = [
    { icon: Mic, title: 'Micrófono', desc: 'Dictado por voz, transcripción whisper y wake word.', status: 'real', statusLabel: 'Del sistema', key: 'mic' },
    { icon: Camera, title: 'Cámara', desc: 'Electron concede el permiso; funciones de cámara bajo tu interruptor.', status: 'parcial', statusLabel: 'Bajo demanda', key: 'camera' },
    { icon: Monitor, title: 'Pantalla', desc: 'Proyección LAN usa getDisplayMedia (el SO pide confirmación cada vez).', status: 'real', statusLabel: 'Del sistema', key: 'screen' },
    { icon: FolderOpen, title: 'Archivos y disco', desc: 'Diálogos nativos para adjuntar/editar; la bóveda escribe solo en localStorage.', status: 'real', statusLabel: 'Del sistema', key: 'files' },
    { icon: Globe, title: 'Red e internet', desc: 'Solo para lo que tú configuras: IA en nube, conectores y updates.', status: 'real', statusLabel: 'Del sistema', key: 'network' },
    { icon: Download, title: 'Descargas', desc: 'Modelos Ollama, actualizaciones y componentes bajo tu acción.', status: 'real', statusLabel: 'Del sistema', key: 'downloads' },
    { icon: MousePointer, title: 'Ratón y teclado (control)', desc: 'Control real del SO vía nut.js (Electron): mover cursor, clic y escribir. En móvil no aplica.', status: 'real', statusLabel: 'Del sistema', key: 'control' },
];

const STATUS_STYLE: Record<Status, string> = {
    real: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
    parcial: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
    no: 'text-neutral-500 border-white/10 bg-white/[0.03]',
};

export const PermissionsModule: React.FC = () => {
    const [test, setTest] = useState<'mic' | 'cam' | 'ctl' | null>(null);
    const [testMsg, setTestMsg] = useState('');
    const [perms, setPerms] = useState(loadPerms);

    const toggle = (key: AppPermKey) => {
        const next = !perms[key];
        savePerm(key, next);
        setPerms(loadPerms());
        setTestMsg(next ? `✓ ${PERM_LABELS[key]} activado en CaRo Ai.` : `⏻ ${PERM_LABELS[key]} desactivado — las funciones que lo usan quedan bloqueadas.`);
    };

    /** Prueba real del permiso del SO/navegador pidiendo el dispositivo y soltándolo. */
    const probar = async (kind: 'mic' | 'cam') => {
        setTest(kind);
        setTestMsg('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia(kind === 'mic' ? { audio: true } : { video: true });
            stream.getTracks().forEach((t) => t.stop());
            setTestMsg(kind === 'mic' ? '✓ Micrófono autorizado por el sistema.' : '✓ Cámara autorizada por el sistema.');
        } catch (e) {
            setTestMsg(`Permiso denegado o no disponible: ${e instanceof Error ? e.name : 'error'}`);
        } finally {
            setTest(null);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Section title="Permisos" desc="Dos capas: el permiso del SISTEMA (lo concede el SO, se prueba en vivo) y el interruptor de CA RO AI (tú decides qué funciones puede usar la app).">
                <Card className="flex items-start gap-3 border-emerald-400/20 bg-emerald-400/[0.06]">
                    <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-neutral-300 leading-relaxed">
                        Los webviews de cuentas y la Vista Previa <strong>no tienen permisos</strong> (el main process los niega).
                        Apagar un interruptor bloquea la función aunque el sistema lo permita — se guarda solo en este equipo.
                    </p>
                </Card>
            </Section>

            <Section title="Capacidades" desc="Interruptor de la app + estado del sistema. «Probar» pide el permiso al SO ahora mismo.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PERMS.map((p) => {
                        const on = p.key ? permEnabled(p.key) : false;
                        return (
                            <Card key={p.title} className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <p.icon size={18} className="text-[rgb(var(--accent))] mt-0.5 shrink-0" />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-white">{p.title}</p>
                                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLE[p.status]}`}>{p.statusLabel}</span>
                                        </div>
                                        <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{p.desc}</p>
                                        {p.key && (
                                            <p className="text-[10px] mt-1">
                                                <span className={on ? 'text-emerald-400' : 'text-neutral-600'}>App: {on ? 'permitido' : 'bloqueado'}</span>
                                                <span className="text-neutral-700"> · bloquea: {PERM_BLOCKS[p.key]}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {p.key ? (
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={on}
                                        onClick={() => toggle(p.key!)}
                                        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-1 ${on ? 'bg-emerald-500' : 'bg-white/15'}`}
                                    >
                                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                                    </button>
                                ) : (
                                    <Pill>—</Pill>
                                )}
                            </Card>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-4">
                    <button type="button" onClick={() => void probar('mic')} disabled={test !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-white/10 hover:border-white/25 disabled:opacity-50">
                        {test === 'mic' ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />} Probar micrófono
                    </button>
                    <button type="button" onClick={() => void probar('cam')} disabled={test !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-white/10 hover:border-white/25 disabled:opacity-50">
                        {test === 'cam' ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} Probar cámara
                    </button>
                    <button type="button" disabled={test !== null || !permEnabled('control')}
                        onClick={async () => {
                            setTest('ctl'); setTestMsg('');
                            const st = await window.joyai?.controlStatus?.().catch(() => null);
                            if (!st?.ok) { setTestMsg(`Control no disponible: ${st?.error ?? 'solo escritorio'}`); setTest(null); return; }
                            // Demostración real: mueve el cursor al centro de la pantalla y vuelve.
                            const cx = Math.round((st.w ?? 1920) / 2), cy = Math.round((st.h ?? 1080) / 2);
                            const ox = st.x ?? 0, oy = st.y ?? 0;
                            await window.joyai?.controlMouseMove?.({ x: cx, y: cy });
                            await new Promise((r) => setTimeout(r, 400));
                            await window.joyai?.controlMouseMove?.({ x: ox, y: oy });
                            setTestMsg(`✓ Control activo — cursor en (${st.x},${st.y}) de pantalla ${st.w}×${st.h}; lo moví al centro y regresé.`);
                            setTest(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-white/10 hover:border-white/25 disabled:opacity-50">
                        {test === 'ctl' ? <Loader2 size={12} className="animate-spin" /> : <MousePointer size={12} />} Probar control
                    </button>
                    {testMsg && (
                        <p className={`text-[11px] flex items-center gap-1 ${testMsg.startsWith('✓') ? 'text-emerald-400' : 'text-amber-300'}`}>
                            {testMsg.startsWith('✓') ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {testMsg}
                        </p>
                    )}
                </div>
                <p className="text-[11px] text-neutral-600 mt-3">
                    En Android e iOS los permisos del sistema los concede el SO al instalar (AndroidManifest / Info.plist) — los interruptores de arriba siguen aplicando dentro de la app.
                </p>
            </Section>
        </div>
    );
};
