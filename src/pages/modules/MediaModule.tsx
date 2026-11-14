import React, { useEffect, useState } from 'react';
import { Clapperboard, FileVideo, Music, Image as ImageIcon, RefreshCw, FolderOpen, Loader2 } from 'lucide-react';
import { Section, Card, Pill } from '../../components/ui';

interface MediaInfo {
    duration: number;
    size: number;
    format: string;
    video: { codec: string; width: number; height: number } | null;
    audio: { codec: string; sampleRate: string; channels: number } | null;
}

const PRESETS = [
    { id: 'mp3', label: 'Extraer audio MP3', desc: 'Quita el video, MP3 alta calidad', icon: Music },
    { id: 'm4a', label: 'Audio M4A', desc: 'AAC 192k, compatible iPhone/Mac', icon: Music },
    { id: 'wav', label: 'Audio WAV', desc: 'Sin pérdida, archivo grande', icon: Music },
    { id: 'mp4', label: 'Video MP4', desc: 'H.264 + AAC, compatible todo', icon: FileVideo },
    { id: 'compress', label: 'Comprimir video', desc: 'MP4 más liviano (CRF 32)', icon: FileVideo },
] as const;

/** Presets de imagen/foto (ffmpeg -vf). Se muestran cuando el archivo es imagen. */
const IMAGE_PRESETS = [
    { id: 'resize1080', label: 'Redimensionar 1920px', desc: 'JPG calidad alta', icon: ImageIcon },
    { id: 'resize720', label: 'Redimensionar 1280px', desc: 'Para compartir/web', icon: ImageIcon },
    { id: 'png', label: 'Convertir a PNG', desc: 'Sin pérdida', icon: ImageIcon },
    { id: 'webp', label: 'Convertir a WebP', desc: 'Liviano, calidad 85', icon: ImageIcon },
    { id: 'grayscale', label: 'Escala de grises', desc: 'Blanco y negro', icon: ImageIcon },
    { id: 'sepia', label: 'Sepia', desc: 'Filtro vintage', icon: ImageIcon },
    { id: 'blur', label: 'Desenfoque', desc: 'Box blur suave', icon: ImageIcon },
    { id: 'sharpen', label: 'Enfocar', desc: 'Nitidez', icon: ImageIcon },
    { id: 'rotate90', label: 'Girar 90°', desc: 'Horario', icon: ImageIcon },
    { id: 'rotate270', label: 'Girar 270°', desc: 'Antihorario', icon: ImageIcon },
] as const;

const IMAGE_EXTS = /\.(jpe?g|png|webp|bmp|gif|tiff?)$/i;

function fmtDur(s: number): string {
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
}
function fmtSize(b: number): string {
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Media Studio: edición real de video/audio con FFmpeg local.
 * Elegir archivo → ver info (ffprobe) → aplicar preset → resultado en
 * Documentos/CaRoAi-Salidas. Todo en el equipo; nada se sube.
 */
export const MediaModule: React.FC = () => {
    const isElectron = typeof window !== 'undefined' && !!window.joyai?.mediaPick;
    const [status, setStatus] = useState<{ ffmpeg: boolean; ffprobe: boolean } | null>(null);
    const [file, setFile] = useState<{ path: string; name: string } | null>(null);
    const [info, setInfo] = useState<MediaInfo | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!isElectron) return;
        window.joyai!.mediaStatus!().then(setStatus).catch(() => setStatus(null));
    }, [isElectron]);

    const pick = async () => {
        setMsg(''); setInfo(null);
        const r = await window.joyai!.mediaPick!().catch(() => ({ ok: false, path: null }));
        if (!r.ok || !r.path) return;
        setFile({ path: r.path, name: r.path.split(/[\\/]/).pop() ?? r.path });
        const p = await window.joyai!.mediaProbe!({ path: r.path }).catch(() => ({ ok: false as const }));
        if (p.ok && p.info) setInfo(p.info);
        else setMsg('Archivo elegido (sin info de ffprobe).');
    };

    const convert = async (preset: string) => {
        if (!file) return;
        setBusy(preset); setMsg('');
        const r = await window.joyai!.mediaConvert!({ path: file.path, preset }).catch((e) => ({ ok: false as const, error: String(e) }));
        setBusy(null);
        setMsg(r.ok ? `✓ Listo: ${r.outputPath}` : `Error: ${r.error ?? 'falló la conversión'}`);
    };

    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Media Studio"
                desc="Convierte y comprime video/audio localmente con FFmpeg. El resultado cae en Documentos/CaRoAi-Salidas."
                right={status && <Pill active={status.ffmpeg}>{status.ffmpeg ? 'FFmpeg listo' : 'FFmpeg no encontrado'}</Pill>}
            >
                {!isElectron ? (
                    <Card className="text-center py-10">
                        <Clapperboard size={22} className="text-neutral-600 mx-auto mb-3" />
                        <p className="text-sm text-neutral-400">La edición de media requiere la app de escritorio (Electron con FFmpeg local).</p>
                    </Card>
                ) : (
                    <div className="flex flex-col gap-5">
                        {/* Selector */}
                        <Card className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <button type="button" onClick={() => void pick()} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity shrink-0">
                                <FolderOpen size={15} /> Elegir archivo
                            </button>
                            {file ? (
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white font-mono truncate">{file.name}</p>
                                    {info && (
                                        <p className="text-[11px] text-neutral-500 mt-0.5">
                                            {info.video ? `${info.video.width}×${info.video.height} · ${info.video.codec} · ` : ''}
                                            {info.audio ? `${info.audio.codec} · ` : ''}
                                            {fmtDur(info.duration)} · {fmtSize(info.size)}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-neutral-500">MP4, MKV, MOV, MP3, WAV, M4A, FLAC, imágenes…</p>
                            )}
                        </Card>

                        {/* Presets: imagen o A/V según el archivo */}
                        {file && (() => {
                            const isImage = IMAGE_EXTS.test(file.name);
                            const list = isImage ? IMAGE_PRESETS : PRESETS;
                            return (
                                <>
                                    <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold">
                                        {isImage ? 'Edición de imagen' : 'Conversiones de audio/video'}
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                        {list.map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => void convert(p.id)}
                                                disabled={!!busy}
                                                className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[rgb(var(--accent)/0.5)] hover:bg-[rgb(var(--accent)/0.06)] transition-colors text-left disabled:opacity-50"
                                            >
                                                <p.icon size={16} className="text-[rgb(var(--accent))]" />
                                                <p className="text-xs font-semibold text-white">{p.label}</p>
                                                <p className="text-[10px] text-neutral-500">{p.desc}</p>
                                                {busy === p.id && <Loader2 size={12} className="animate-spin text-[rgb(var(--accent))]" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            );
                        })()}

                        {msg && <p className="text-[11px] text-[rgb(var(--accent))] font-mono break-all">{msg}</p>}

                        <p className="text-[11px] text-neutral-600 flex items-center gap-1.5">
                            <ImageIcon size={11} /> Imágenes: redimensionar, formatos, filtros y rotación vía FFmpeg. Efectos avanzados (recorte, texto, collage) en fase posterior.
                        </p>
                    </div>
                )}
            </Section>
        </div>
    );
};
