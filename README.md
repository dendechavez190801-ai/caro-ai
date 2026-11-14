# CaRo Ai

Asistente personal multiplataforma **local-first**: privado por diseño, con memoria persistente, voz, avatar, control del equipo y soporte multi-IA (local con Ollama/LM Studio/vLLM y nube con tu propia API key — nunca keys incluidas en la app).

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind
- **Desktop**: Electron (Windows/macOS/Linux)
- **Móvil**: Capacitor (Android/iOS)
- **IA local**: Ollama (`ollama pull`), endpoints OpenAI-compatible
- **Voz**: Whisper (STT), Piper/Kokoro (TTS) — todo local
- **Control del SO**: nut.js (mouse/teclado), shell, capturas de pantalla

## Desarrollo

```bash
npm install
npm run dev      # Vite en http://localhost:3000
npm start        # Electron (requiere el dev server corriendo)
npm run build    # build de producción
npm run lint     # typecheck (tsc --noEmit)
```

## Estructura

- `src/` — UI (pestañas: Chat, Llamada, Avatar, Vista Previa, Bóveda, Terminal) y módulos de Sistema
- `electron/` — proceso principal: IPC, descargas de modelos, control del SO, actualizaciones
- `android/` — proyecto Capacitor para Android
- `.github/workflows/release.yml` — build y release del instalador

## Privacidad

Cada instalación genera sus propias credenciales, ID, puerto y particiones de sesión. Los datos viven en `userData` del sistema, aislados por usuario. Sin telemetría ni servidores del desarrollador.

## Licencia

Pendiente de definir.
