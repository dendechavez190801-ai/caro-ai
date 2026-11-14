/**
 * Permisos a nivel de aplicación (punto 8 del feedback #3).
 *
 * A diferencia del permiso del SO (que concede el sistema), estos son
 * interruptores del USUARIO dentro de CaRo Ai: se guardan en localStorage
 * y las funciones consultan permEnabled() antes de actuar. Si el usuario
 * apaga "micrófono", el dictado y la grabación se niegan aunque el SO
 * lo haya autorizado.
 */

export type AppPermKey = 'mic' | 'camera' | 'screen' | 'files' | 'network' | 'downloads' | 'control';

const KEY = 'caroai.perms.v1';

const DEFAULTS: Record<AppPermKey, boolean> = {
    mic: true,
    camera: true,
    screen: true,
    files: true,
    network: true,
    downloads: true,
    control: true,
};

export const PERM_LABELS: Record<AppPermKey, string> = {
    mic: 'Micrófono',
    camera: 'Cámara',
    screen: 'Pantalla',
    files: 'Archivos',
    network: 'Red',
    downloads: 'Descargas',
    control: 'Control',
};

/** Qué función bloquea cada permiso (para mostrarlo en la UI). */
export const PERM_BLOCKS: Record<AppPermKey, string> = {
    mic: 'Dictado, grabación y wake word',
    camera: 'Funciones de cámara (pruebas)',
    screen: 'Proyección y captura de pantalla',
    files: 'Diálogos de archivos y adjuntos',
    network: 'Conectores y proveedores en la nube',
    downloads: 'Descarga de modelos y actualizaciones',
    control: 'Mover el ratón, hacer clic y escribir con el teclado',
};

function load(): Record<AppPermKey, boolean> {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw) as Partial<Record<AppPermKey, boolean>>;
        return { ...DEFAULTS, ...parsed };
    } catch {
        return { ...DEFAULTS };
    }
}

let cache: Record<AppPermKey, boolean> | null = null;

export function loadPerms(): Record<AppPermKey, boolean> {
    if (!cache) cache = load();
    return { ...cache };
}

export function savePerm(key: AppPermKey, value: boolean): void {
    const next = { ...loadPerms(), [key]: value };
    cache = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
}

/** ¿Está permitida la capacidad? (interruptor del usuario, no del SO) */
export function permEnabled(key: AppPermKey): boolean {
    return loadPerms()[key];
}
