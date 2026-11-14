import React from 'react';
import {
    Activity,
    Brain,
    Database,
    Globe,
    Palette,
    Plug,
    Scale,
    Shield,
    Terminal,
    Users,
    Wifi,
    X,
    Vault,
    MonitorPlay,
    Clapperboard,
    RefreshCw,
} from 'lucide-react';
import { SIDEBAR_MODULES, ModuleId } from '../types';
import { useApp } from '../store';
import iconUrl from '../assets/icon.jpg';

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
    palette: Palette,
    brain: Brain,
    users: Users,
    globe: Globe,
    database: Database,
    shield: Shield,
    scale: Scale,
    terminal: Terminal,
    plug: Plug,
    wifi: Wifi,
    activity: Activity,
    vault: Vault,
    screen: MonitorPlay,
    media: Clapperboard,
    updates: RefreshCw,
};

interface SidebarProps {
    onNavigate?: () => void;
}

/**
 * Sidebar con los 11 modulos de la app.
 * En movil se comporta como panel deslizante sobre el contenido.
 */
export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
    const { state, dispatch } = useApp();
    const open = state.sidebarOpen;

    return (
        <>
            {/* Fondo oscuro para cerrar el panel (todas las plataformas). */}
            {open && (
                <button
                    aria-label="Cerrar menu"
                    onClick={() => dispatch({ type: 'toggle-sidebar' })}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-40 w-72 flex flex-col glass-panel border-r border-white/5
                    transition-transform duration-300 ease-out
                    ${open ? 'translate-x-0' : '-translate-x-full'}
                    overflow-hidden`}
            >
                {/* Marca */}
                <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-white/5">
                    <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                        <img src={iconUrl} alt="CaRo Ai" className="w-7 h-7 rounded-lg object-cover" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold tracking-tight text-white leading-tight">CaRo Ai</p>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Asistente</p>
                    </div>
                    <button
                        onClick={() => dispatch({ type: 'toggle-sidebar' })}
                        className="ml-auto text-neutral-500 hover:text-white transition"
                        aria-label="Cerrar menu"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Modulos */}
                <nav className="flex-1 overflow-y-auto py-3 space-y-1 px-3">
                    {SIDEBAR_MODULES.map((mod) => {
                        const Icon = ICONS[mod.icon] ?? Activity;
                        const isActive = state.tab === 'system' && state.module === mod.id;
                        return (
                            <button
                                key={mod.id}
                                onClick={() => {
                                    dispatch({ type: 'set-module', module: mod.id as ModuleId });
                                    // Cierra/colapsa el menu al elegir un modulo.
                                    if (state.sidebarOpen) dispatch({ type: 'toggle-sidebar' });
                                    onNavigate?.();
                                }}
                                title={mod.label}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group
                                    ${isActive
                                        ? 'bg-[rgb(var(--accent)/0.18)] text-white border border-[rgb(var(--accent)/0.45)] shadow-[0_0_22px_rgb(var(--accent)/0.2)]'
                                        : 'text-neutral-400 hover:text-neutral-100 hover:bg-white/5 border border-transparent'}`}
                            >
                                <Icon
                                    size={17}
                                    className={`shrink-0 ${isActive ? 'text-[rgb(var(--accent))]' : 'text-neutral-500 group-hover:text-neutral-300'}`}
                                />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-medium truncate">{mod.label}</span>
                                    <span className="block text-[10px] text-neutral-600 truncate">{mod.description}</span>
                                </span>
                                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--accent))] shrink-0" />}
                            </button>
                        );
                    })}
                </nav>

                {/* Estado del agente */}
                <div className="shrink-0 px-4 py-3 border-t border-white/5">
                    <div className="flex items-center gap-2.5">
                        <span className="relative flex w-2.5 h-2.5">
                            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        </span>
                        <span className="text-[11px] text-neutral-400">
                            <span className="text-neutral-200 font-medium">{state.agentName}</span> · en línea
                        </span>
                    </div>
                </div>
            </aside>
        </>
    );
};
