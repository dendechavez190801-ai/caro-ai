import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Image as ImageIcon, Music, FileText, Film, Link2 } from 'lucide-react';
import { pickFile, fileToDataUrl } from '../media';

/**
 * Menú de adjuntos compartido (puntos 7-8 de la lista): el mismo desplegable
 * del chat — imagen, audio, archivo, video y enlace, cada uno con su icono —
 * disponible en Chat, Llamada y Avatar.
 */
export interface Attachment {
    kind: 'image' | 'audio' | 'file' | 'video' | 'link';
    name: string;
    /** Preview local (imagen/audio) como dataURL. */
    dataUrl?: string;
}

const OPTIONS: { kind: Attachment['kind']; label: string; accept: string; Icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
    { kind: 'image', label: 'Imagen', accept: 'image/*', Icon: ImageIcon },
    { kind: 'audio', label: 'Audio', accept: 'audio/*', Icon: Music },
    { kind: 'file', label: 'Archivo', accept: '*/*', Icon: FileText },
    { kind: 'video', label: 'Video', accept: 'video/*', Icon: Film },
];

export const AttachMenu: React.FC<{
    onSelect: (att: Attachment) => void;
    /** Alineación del menú respecto al botón clip. */
    align?: 'left' | 'right';
}> = ({ onSelect, align = 'left' }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // Cierra el menú al hacer clic fuera.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const pick = async (opt: (typeof OPTIONS)[number]) => {
        setOpen(false);
        const file = (await pickFile(opt.accept)) as File | null;
        if (!file) return;
        let dataUrl: string | undefined;
        if (opt.kind === 'image' || opt.kind === 'audio') {
            dataUrl = await fileToDataUrl(file).catch(() => undefined);
        }
        onSelect({ kind: opt.kind, name: file.name, dataUrl });
    };

    const pickLink = () => {
        setOpen(false);
        const url = window.prompt('Pega la URL del enlace:');
        if (!url?.trim()) return;
        const u = url.trim();
        onSelect({ kind: 'link', name: u.replace(/^https?:\/\//, '').slice(0, 60) });
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="Adjuntar"
                aria-expanded={open}
                className="p-2.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
            >
                <Paperclip size={18} />
            </button>
            {open && (
                <div className={`absolute bottom-12 ${align === 'right' ? 'right-0' : 'left-0'} z-20 w-44 rounded-xl border border-white/10 bg-[#141414] shadow-xl overflow-hidden`}>
                    {OPTIONS.map((opt) => (
                        <button
                            key={opt.kind}
                            type="button"
                            onClick={() => void pick(opt)}
                            className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 text-xs text-neutral-300 hover:bg-white/5 hover:text-white transition-colors"
                        >
                            <opt.Icon size={14} className="text-[rgb(var(--accent))] shrink-0" />
                            {opt.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={pickLink}
                        className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 text-xs text-neutral-300 hover:bg-white/5 hover:text-white transition-colors border-t border-white/5"
                    >
                        <Link2 size={14} className="text-[rgb(var(--accent))] shrink-0" />
                        Enlace
                    </button>
                </div>
            )}
        </div>
    );
};
