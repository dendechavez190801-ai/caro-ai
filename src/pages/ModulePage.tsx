import React from 'react';
import { Hammer } from 'lucide-react';
import { ModuleId, SIDEBAR_MODULES } from '../types';
import { useApp } from '../store';
import { AppearanceModule } from './modules/AppearanceModule';
import { ModelsModule } from './modules/ModelsModule';
import { AgentsModule } from './modules/AgentsModule';
import { AccountsModule } from './modules/AccountsModule';
import { MemoryModule } from './modules/MemoryModule';
import { PermissionsModule } from './modules/PermissionsModule';
import { LegalModule } from './modules/LegalModule';
import { TerminalModule } from './modules/TerminalModule';
import { ConnectorsModule } from './modules/ConnectorsModule';
import { DevicesModule } from './modules/DevicesModule';
import { HardwareModule } from './modules/HardwareModule';
import { VaultPage } from './tabs/VaultPage';
import { ScreenModule } from './modules/ScreenModule';
import { MediaModule } from './modules/MediaModule';
import { UpdatesModule } from './modules/UpdatesModule';

/**
 * Página de contenido del módulo activo del sidebar.
 * Cada módulo registra aquí su contenido real; los que aún no tienen se
 * muestran con el marco de "en construcción".
 */
const MODULE_CONTENT: Partial<Record<ModuleId, React.ComponentType>> = {
    appearance: AppearanceModule,
    models: ModelsModule,
    agents: AgentsModule,
    accounts: AccountsModule,
    memory: MemoryModule,
    permissions: PermissionsModule,
    legal: LegalModule,
    terminal: TerminalModule,
    connectors: ConnectorsModule,
    devices: DevicesModule,
    hardware: HardwareModule,
    vault: VaultPage,
    screen: ScreenModule,
    media: MediaModule,
    updates: UpdatesModule,
};

export const ModulePage: React.FC = () => {
    const { state } = useApp();
    const mod = SIDEBAR_MODULES.find((m) => m.id === state.module) ?? SIDEBAR_MODULES[0];
    const Content = MODULE_CONTENT[mod.id];

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 animate-fade-in">
            <div className="mb-6">
                <p className="text-[10px] uppercase tracking-widest text-[rgb(var(--accent))] font-semibold mb-1">
                    Modulo
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-white">{mod.label}</h1>
                <p className="text-sm text-neutral-500 mt-1">{mod.description}</p>
            </div>

            {Content ? (
                <Content />
            ) : (
                <div className="glass-panel rounded-2xl border border-white/5 p-6 flex flex-col items-center justify-center text-center gap-3 py-16">
                    <div className="w-12 h-12 rounded-2xl bg-[rgb(var(--accent)/0.12)] border border-[rgb(var(--accent)/0.2)] flex items-center justify-center">
                        <Hammer size={20} className="text-[rgb(var(--accent))]" />
                    </div>
                    <p className="text-sm font-medium text-neutral-300">Contenido en construcción</p>
                    <p className="text-xs text-neutral-600 max-w-sm">
                        Este módulo se implementa en la Fase 2. El shell, el tema y la navegación ya funcionan.
                    </p>
                </div>
            )}
        </div>
    );
};
