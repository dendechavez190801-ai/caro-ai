import React, { useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { TermsGate } from './components/TermsGate';
import { ModulePage } from './pages/ModulePage';
import { TabPage } from './pages/TabPage';
import { CommandPalette } from './components/CommandPalette';
import { AppProvider, useApp } from './store';
import { useWakeWord } from './wakeword';
import { speak } from './speech';
import { detectActions, runAction, previewUrlForAction } from './agent';

/**
 * Shell de la app: sidebar de módulos + cabecera con pestañas + wake word.
 * Un único layout para Windows, macOS, Android e iOS (Capacitor/Electron).
 */
const Shell: React.FC = () => {
    const { state, dispatch } = useApp();

    const onWake = useCallback((transcript: string) => {
        // Comandos de control del propio wake word (siempre activos).
        const t = transcript.toLowerCase();
        if (/(deja de escuchar|deja de oir|apaga|silencio|duerme|stop listening|go to sleep)/.test(t)) {
            dispatch({ type: 'set-profile', patch: { wakeWordEnabled: false } });
            void speak('De acuerdo, dejaré de escuchar.', state.ttsVoiceId).catch(() => {});
            return;
        }
        if (/(sigue escuchando|escucha|despierta|wake up)/.test(t) && !state.wakeWordEnabled) {
            dispatch({ type: 'set-profile', patch: { wakeWordEnabled: true } });
            void speak('Escuchando.', state.ttsVoiceId).catch(() => {});
            return;
        }
        // Si el wake word trae un comando ("Caro, abre YouTube"), el agente de
        // segundo plano lo ejecuta sin que el usuario navegue a ninguna pantalla.
        const cmd = transcript.toLowerCase().replace(state.agentName.toLowerCase(), '').trim();
        const actions = cmd ? detectActions(cmd) : [];
        if (actions.length) {
            void (async () => {
                for (const action of actions) {
                    const prevUrl = action.inApp ? previewUrlForAction(action) : null;
                    if (prevUrl) {
                        dispatch({ type: 'set-preview-url', url: prevUrl });
                        dispatch({ type: 'set-tab', tab: 'preview' });
                        void speak(`Abriendo ${action.label}.`, state.ttsVoiceId).catch(() => {});
                        continue;
                    }
                    const r = await runAction(action).catch(() => ({ ok: false as const }));
                    void speak(r.ok ? `Listo, ejecuté ${action.label}.` : `No pude ${action.label}.`, state.ttsVoiceId).catch(() => {});
                }
            })();
            return;
        }
        dispatch({ type: 'set-tab', tab: 'chat' });
        void speak(`¿Sí, ${state.agentName}?`, state.ttsVoiceId).catch(() => {});
    }, [dispatch, state.agentName, state.ttsVoiceId]);

    useWakeWord(state.wakeWordEnabled, state.agentName, onWake);

    // Notificación global cuando una descarga de modelo termina — aunque el
    // usuario esté en otro módulo o la ventana minimizada.
    React.useEffect(() => {
        const off = window.joyai?.onEnginePullDone?.(({ model, ok }) => {
            if (ok) {
                // El modelo descargado queda activo en Chat aunque el usuario
                // haya salido del módulo Modelos durante la descarga.
                const ollama = state.engines.find((e) => e.providerType === 'ollama');
                if (ollama) dispatch({ type: 'update-engine', id: ollama.id, patch: { model, enabled: true } });
            }
            try {
                const n = new Notification(ok ? 'CaRo Ai — Modelo listo' : 'CaRo Ai — Descarga fallida', {
                    body: ok ? `El modelo ${model} se descargó. Ya puedes usarlo en Chat.` : `No se pudo descargar ${model}.`,
                });
                n.onclick = () => window.focus();
            } catch { /* notificaciones no soportadas */ }
            void speak(ok ? `Terminé de descargar ${model}. Ya puedes usarlo.` : `Falló la descarga de ${model}.`, state.ttsVoiceId).catch(() => {});
        });
        return () => off?.();
    }, [state.ttsVoiceId, state.engines, dispatch]);

    return (
        <div className="h-screen w-screen flex app-backdrop text-neutral-100 overflow-hidden">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0">
                <Header />
                <main className="flex-1 overflow-y-auto">
                    {state.tab === 'system' ? <ModulePage /> : <TabPage />}
                </main>
            </div>
            <TermsGate />
            <CommandPalette />
        </div>
    );
};

export default function App() {
    return (
        <AppProvider>
            <Shell />
        </AppProvider>
    );
}
