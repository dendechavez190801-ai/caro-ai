import React from 'react';
import { MessageSquare, Phone, User, MonitorPlay, Library, SquareTerminal } from 'lucide-react';
import { AppTab } from './types';

export interface TabDef {
    id: AppTab;
    label: string;
    description: string;
    icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

/** Las 5 pestañas principales: Chat / Llamada / Avatar / Vista Previa / Bóveda.
 *  'system' sigue existiendo para los módulos del sidebar, pero ya no es tab visible. */
export const TABS: TabDef[] = [
    {
        id: 'chat',
        label: 'Chat',
        description: 'Conversación con el agente, contexto de memoria y adjuntos.',
        icon: MessageSquare,
    },
    {
        id: 'call',
        label: 'Llamada',
        description: 'Voz bidireccional, clonacion de voz y perfil de hablante.',
        icon: Phone,
    },
    {
        id: 'avatar',
        label: 'Avatar',
        description: 'Avatar 3D, habitaciones interactivas y acciones.',
        icon: User,
    },
    {
        id: 'preview',
        label: 'Vista Previa',
        description: 'El escenario del agente: lo que abre (web, apps) y comandos directos.',
        icon: MonitorPlay,
    },
    {
        id: 'vault',
        label: 'Bóveda',
        description: 'El cerebro: notas, archivos y conversaciones de CaRo Ai.',
        icon: Library,
    },
    {
        id: 'terminal',
        label: 'Terminal',
        description: 'Consola/IDE del equipo: shell real, sesiones, temas y agente.',
        icon: SquareTerminal,
    },
];

export function getTab(id: string): TabDef {
    return TABS.find((t) => t.id === id) ?? TABS[0];
}
