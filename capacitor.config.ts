import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 6 — mismo build de `dist/` para Android y iOS.
 * appId y appName son los que usaran los instaladores nativos.
 */
const config: CapacitorConfig = {
    appId: 'com.caroai.app',
    appName: 'CaRo Ai',
    webDir: 'dist',
    android: {
        buildOptions: {
            // Se genera en android/app/build.gradle al ejecutar `npx cap add android`.
            keystorePath: undefined,
            keystoreAlias: undefined,
        },
    },
    ios: {
        contentInset: 'automatic',
        scheme: 'CaRo Ai',
    },
    server: {
        androidScheme: 'https',
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 600,
            backgroundColor: '#0a0a0a',
            spinnerColor: '#076eff',
        },
        StatusBar: {
            style: 'DARK',
            backgroundColor: '#0a0a0a',
        },
    },
};

export default config;
