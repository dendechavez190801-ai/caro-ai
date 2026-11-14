/**
 * Proyección de pantalla por LAN (solo Electron).
 *
 * HOST (quien comparte): getDisplayMedia → canvas → JPEG → POST /frame al
 * servidor local del proceso main (127.0.0.1). El servidor lo reenvía a los
 * clientes LAN que tengan el código de vínculo.
 *
 * VIEWER (quien mira): GET /frame?code=... en loop; cada frame es un JPEG
 * completo (no stream continuo), ~5 fps. Funciona también en el navegador
 * web contra un host Electron en la misma red.
 */

export interface ShareSession {
    stream: MediaStream;
    stop: () => void;
}

/** Inicia la captura y el envío de frames. Devuelve handle para detener. */
export async function startScreenShare(port: number, onError?: (msg: string) => void): Promise<ShareSession> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play().catch(() => {});

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const push = async () => {
        if (stopped || !ctx) return;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.6));
        if (!blob) return;
        await fetch(`http://127.0.0.1:${port}/frame`, { method: 'POST', body: blob }).catch(() => {});
    };

    timer = setInterval(() => { void push(); }, 200);

    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (timer) clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
    };
    stream.getVideoTracks()[0]?.addEventListener('ended', stop);

    return { stream, stop };
}

export interface ViewerHandle {
    stop: () => void;
    imgUrl: () => string | null;
}

/**
 * Conecta a un host: ip:puerto + código de vínculo.
 * `onFrame(blob)` recibe cada JPEG; devuelve handle para detener.
 */
export function startViewer(
    host: string,
    port: number,
    code: string,
    onFrame: (blob: Blob) => void,
    onStatus?: (msg: string) => void,
): ViewerHandle {
    let stopped = false;
    let busy = false;
    const base = `http://${host}:${port}`;

    const loop = async () => {
        while (!stopped) {
            if (busy) { await new Promise((r) => setTimeout(r, 120)); continue; }
            busy = true;
            try {
                const res = await fetch(`${base}/frame?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
                if (res.status === 200) {
                    const blob = await res.blob();
                    if (blob.size > 1000) onFrame(blob);
                } else if (res.status === 403) {
                    onStatus?.('Código de vínculo incorrecto o proyección detenida.');
                    stopped = true;
                    return;
                } else if (res.status === 204) {
                    onStatus?.('Esperando frames del otro equipo…');
                } else {
                    onStatus?.(`Host respondió ${res.status}.`);
                }
            } catch {
                onStatus?.('Sin conexión con el host. Verifica IP, puerto y que ambos estén en la misma red.');
                stopped = true;
                return;
            } finally {
                busy = false;
            }
            await new Promise((r) => setTimeout(r, 60));
        }
    };
    void loop();
    return { stop: () => { stopped = true; }, imgUrl: () => null };
}

/* ── Transferencia de archivos por LAN ────────────────────────────────── */

export interface RemoteFile { name: string; size: number; mtime: number }

export async function listRemoteFiles(host: string, code: string): Promise<{ dir?: string; files: RemoteFile[] } | null> {
    try {
        const res = await fetch(`http://${host}:47823/files?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return (await res.json()) as { dir?: string; files: RemoteFile[] };
    } catch { return null; }
}

export async function uploadRemoteFile(host: string, code: string, file: File): Promise<boolean> {
    try {
        const res = await fetch(`http://${host}:47823/file?code=${encodeURIComponent(code)}&name=${encodeURIComponent(file.name)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream' },
            body: file,
        });
        return res.status === 204;
    } catch { return false; }
}

export function remoteFileUrl(host: string, code: string, name: string): string {
    return `http://${host}:47823/file?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`;
}

export function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
