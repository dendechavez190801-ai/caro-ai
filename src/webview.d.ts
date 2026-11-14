/**
 * Tipos para el tag <webview> de Electron (navegador integrado de Cuentas).
 * Solo existe cuando webviewTag esta activo; en web se usa como fallback.
 */
import 'react';

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            webview: React.DetailedHTMLProps<
                React.HTMLAttributes<HTMLElement> & {
                    src?: string;
                    partition?: string;
                    allowpopups?: boolean | string;
                },
                HTMLElement
            > & {
                // Metodos del webview de Electron
                goBack?: () => void;
                goForward?: () => void;
                reload?: () => void;
                loadURL?: (url: string) => void;
                getURL?: () => string;
            };
        }
    }
}
