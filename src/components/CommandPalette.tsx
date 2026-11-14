import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { TABS } from '../navigation';
import { SIDEBAR_MODULES } from '../types';
import { useApp } from '../store';

interface Item { id: string; label: string; hint: string; run: () => void }

/**
 * Paleta de comandos (Ctrl+K / Cmd+K) — patrón 2026: acceso directo a
 * cualquier pestaña o módulo del sistema sin usar el ratón.
 */
export const CommandPalette: React.FC = () => {
    const { state, dispatch } = useApp();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((o) => !o);
            } else if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

    const items = useMemo<Item[]>(() => [
        ...TABS.map((t) => ({
            id: `tab-${t.id}`, label: t.label, hint: 'Pantalla',
            run: () => { dispatch({ type: 'set-tab', tab: t.id }); setOpen(false); },
        })),
        ...SIDEBAR_MODULES.map((m) => ({
            id: `mod-${m.id}`, label: m.label, hint: 'Módulo',
            run: () => { dispatch({ type: 'set-module', module: m.id }); dispatch({ type: 'set-tab', tab: 'system' }); setOpen(false); },
        })),
    ], [dispatch]);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return items;
        return items.filter((i) => i.label.toLowerCase().includes(s) || i.hint.toLowerCase().includes(s));
    }, [items, q]);

    useEffect(() => { setSel(0); }, [q]);

    if (!open) return null;

    const pick = (i: number) => { const it = filtered[i]; if (it) it.run(); };

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
            <div className="w-[min(92vw,560px)] rounded-2xl border border-white/10 bg-[#141414]/95 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/5">
                    <Search size={15} className="text-neutral-500" />
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                            if (e.key === 'Enter') pick(sel);
                        }}
                        placeholder="Ir a… (pestaña o módulo)"
                        className="flex-1 bg-transparent outline-none text-sm text-neutral-100 placeholder:text-neutral-600"
                    />
                    <kbd className="text-[9px] px-1.5 py-0.5 rounded border border-white/10 text-neutral-500 font-mono">ESC</kbd>
                </div>
                <div className="max-h-80 overflow-y-auto p-1.5">
                    {filtered.length === 0 && <p className="px-3 py-4 text-xs text-neutral-500 text-center">Sin resultados.</p>}
                    {filtered.map((it, i) => (
                        <button
                            key={it.id}
                            type="button"
                            onMouseEnter={() => setSel(i)}
                            onClick={() => it.run()}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${i === sel ? 'bg-[rgb(var(--accent)/0.15)]' : 'hover:bg-white/5'}`}
                        >
                            <span className="flex-1 text-sm text-neutral-200">{it.label}</span>
                            <span className="text-[9px] uppercase tracking-widest text-neutral-600">{it.hint}</span>
                            {i === sel && <CornerDownLeft size={12} className="text-[rgb(var(--accent))]" />}
                        </button>
                    ))}
                </div>
                <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 text-[9px] text-neutral-600">
                    <span>↑↓ navegar</span><span>Enter abrir</span><span>Ctrl+K cerrar</span>
                </div>
            </div>
        </div>
    );
};
