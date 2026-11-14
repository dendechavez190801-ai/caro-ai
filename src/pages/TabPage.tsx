import React from 'react';
import { useApp } from '../store';
import { ChatPage } from './tabs/ChatPage';
import { CallPage } from './tabs/CallPage';
import { AvatarPage } from './tabs/AvatarPage';
import { PreviewPage } from './tabs/PreviewPage';
import { VaultPage } from './tabs/VaultPage';
import { TerminalPage } from './tabs/TerminalPage';

/** Despacha la pestaña superior activa (Chat / Llamada / Avatar / Vista Previa / Bóveda / Terminal). */
export const TabPage: React.FC = () => {
    const { state } = useApp();
    if (state.tab === 'chat') return <ChatPage />;
    if (state.tab === 'call') return <CallPage />;
    if (state.tab === 'preview') return <PreviewPage />;
    if (state.tab === 'vault') return <VaultPage />;
    if (state.tab === 'terminal') return <TerminalPage />;
    return <AvatarPage />;
};
