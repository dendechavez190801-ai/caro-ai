import React, { useEffect, useRef, useState } from 'react';
import { Menu, Bell, PictureInPicture2 } from 'lucide-react';
import { TABS } from '../navigation';
import { useApp } from '../store';
import { collectNotices, APP_VERSION, AppNotice } from '../updates';
import iconUrl from '../assets/icon.jpg';

/**
 * Cabecera superior: dock de pestañas (Chat/Llamada/Avatar/Vista Previa/Bóveda/
 * Terminal) como launcher de iconos + perfil del agente, modo y campana.
 */
export const Header: React.FC = () => {
    const { state, dispatch } = useApp();
    const [notices, setNotices] = useState<AppNotice[]>([]);
    const [bellOpen, setBellOpen] = useState(false);
    const [floatOn, setFloatOn] = useState(false);
    const bellRef = useRef<HTMLDivElement>(null);

    // Estado inicial del modo isla (ventana flotante siempre visible).
    useEffect(() => {
        window.joyai?.getFloatMode?.().then((r) => { if (r.ok) setFloatOn(r.on); }).catch(() => {});
    }, []);

    const toggleFloat = async () => {
        const next = !floatOn;
        const r = await window.joyai?.setFloatMode?.(next).catch(() => null);
        if (r?.ok) setFloatOn(r.on);
    };

    useEffect(() => {
        let on = true;
        collectNotices().then((n) => { if (on) setNotices(n); }).catch(() => {});
        return () => { on = false; };
    }, [state.tab]);

    // Cierra el dropdown al hacer clic fuera.
    useEffect(() => {
        if (!bellOpen) return;
        const onClick = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [bellOpen]);

    const alertCount = notices.filter((n) => n.kind !== 'info').length;

    // Motor activo para mostrar el modo real: local (localhost) o nube.
    const activeEngine = state.engines.find((e) => e.enabled) ?? state.engines[0];
    const isLocalEngine = !!activeEngine && /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(activeEngine.endpoint);
    const modeLabel = !activeEngine ? 'Sin motor' : isLocalEngine ? 'Modo local' : 'Modo nube';
    const modeColor = isLocalEngine ? 'text-emerald-500' : 'text-sky-400';

    // Inicial del avatar: perfil del usuario > nombre del agente.
    const avatarInitial = (state.userName || state.userEmail || state.agentName || 'C').trim().charAt(0).toUpperCase();

    return (
        <header className="shrink-0 h-16 glass-panel border-b border-white/5 px-4 sm:px-6 flex items-center gap-3 z-20 relative">
            <button
                onClick={() => dispatch({ type: 'toggle-sidebar' })}
                className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
                aria-label="Abrir menu"
            >
                <Menu size={18} />
            </button>

            {/* Marca: clic en el icono/nombre abre el menu lateral. */}
            <button
                onClick={() => dispatch({ type: 'toggle-sidebar' })}
                className="flex items-center gap-3 mr-4 rounded-xl px-1.5 py-1 -ml-1.5 hover:bg-white/5 transition"
                aria-label="Abrir menu lateral"
                title="Menú"
            >
                <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                    <img src={iconUrl} alt="CaRo Ai" className="w-7 h-7 rounded-lg object-cover" />
                </div>
                <div className="hidden sm:block leading-tight text-left">
                    <p className="text-sm font-bold tracking-tight text-white">CaRo Ai</p>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Asistente</p>
                </div>
            </button>

            {/* Dock de pestañas: iconos grandes, etiqueta solo en hover/activo —
                estilo launcher moderno en vez de barra saturada de texto. */}
            <nav className="flex-1 flex items-center justify-center">
                <div className="flex items-end gap-1 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md px-1.5 py-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.35)]">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = state.tab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => dispatch({ type: 'set-tab', tab: tab.id })}
                                title={tab.label}
                                aria-label={tab.label}
                                className={`group relative flex flex-col items-center gap-0.5 px-3.5 py-1.5 rounded-xl transition-all duration-200 border
                                    ${isActive
                                        ? 'bg-[rgb(var(--accent)/0.2)] border-[rgb(var(--accent)/0.5)] shadow-[0_0_18px_rgb(var(--accent)/0.25)]'
                                        : 'border-transparent hover:bg-white/5 hover:-translate-y-0.5'}`}
                            >
                                <Icon size={19} className={isActive ? 'text-[rgb(var(--accent))]' : 'text-neutral-400 group-hover:text-neutral-100'} />
                                <span className={`text-[9px] font-medium tracking-wide transition-opacity ${isActive ? 'text-white opacity-100' : 'text-neutral-500 opacity-0 group-hover:opacity-100'}`}>
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* Acciones */}
            <div className="flex items-center gap-2 shrink-0">
                {/* Isla dinámica: ventana flotante siempre visible encima de todo.
                    Se puede arrastrar a cualquier posición; las notificaciones de
                    la IA siguen llegando aunque minimices o cambies de app. */}
                <button
                    type="button"
                    onClick={() => void toggleFloat()}
                    aria-label="Modo isla flotante"
                    title={floatOn ? 'Isla activa: ventana siempre visible. Clic para desactivar.' : 'Activar isla flotante (siempre visible)'}
                    className={`p-2 rounded-lg transition-colors ${floatOn ? 'text-[rgb(var(--accent))] bg-[rgb(var(--accent)/0.15)]' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                >
                    <PictureInPicture2 size={16} />
                </button>
                {/* Campana de notificaciones/actualizaciones */}
                <div className="relative" ref={bellRef}>
                    <button
                        type="button"
                        onClick={() => setBellOpen((v) => !v)}
                        aria-label="Notificaciones"
                        className="relative p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        <Bell size={17} />
                        {alertCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] text-[9px] font-bold flex items-center justify-center">
                                {alertCount}
                            </span>
                        )}
                    </button>
                    {bellOpen && (
                        <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden">
                            <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-white/5">Notificaciones</p>
                            <div className="max-h-72 overflow-y-auto">
                                {notices.length === 0 && <p className="px-3 py-4 text-xs text-neutral-500">Sin notificaciones.</p>}
                                {notices.map((n) => (
                                    <div key={n.id} className="px-3 py-2.5 border-b border-white/5 last:border-0">
                                        <p className="text-xs font-semibold text-neutral-100 flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${n.kind === 'warning' ? 'bg-amber-400' : n.kind === 'update' ? 'bg-[rgb(var(--accent))]' : 'bg-neutral-500'}`} />
                                            {n.title}
                                        </p>
                                        <p className="text-[11px] text-neutral-500 mt-0.5 pl-3">{n.detail}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2.5 pl-2 border-l border-white/5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[rgb(var(--accent))] to-[rgb(var(--accent)/0.45)] flex items-center justify-center text-[rgb(var(--accent-contrast))] text-xs font-bold">
                        {avatarInitial}
                    </div>
                    <div className="hidden sm:block leading-tight">
                        <p className="text-[12px] font-semibold text-neutral-100">{state.userName || state.agentName}</p>
                        <p className={`text-[10px] ${modeColor}`}>{modeLabel}</p>
                    </div>
                </div>

                <span className="hidden md:inline-block text-[10px] px-2 py-1 rounded-md bg-white/5 border border-white/5 text-neutral-500 font-mono ml-1">
                    v{APP_VERSION}
                </span>
            </div>
        </header>
    );
};
