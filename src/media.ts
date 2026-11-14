/**
 * Utilidades de medios para CaRo Ai: elegir imagenes del usuario, reducirlas
 * con canvas (para no reventar localStorage) y leer archivos como dataURL.
 */

/** Lee un archivo como dataURL. */
export function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/**
 * Carga una imagen del input y la devuelve como JPEG dataURL reducida a
 * `maxDim` px de lado mayor (calidad 0.82). Evita guardar originales de
 * varios MB en localStorage.
 */
export async function pickImageDataUrl(file: File, maxDim = 1600): Promise<string> {
    const dataUrl = await fileToDataUrl(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('No se pudo leer la imagen'));
        el.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale >= 1 && file.size < 400_000) return dataUrl;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
}

/** Dispara el selector de archivos del SO y devuelve el primer archivo. */
export function pickFile(accept: string, multiple = false): Promise<File | File[] | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        input.onchange = () => {
            const files = input.files ? Array.from(input.files) : [];
            resolve(multiple ? files : (files[0] ?? null));
        };
        // Si el usuario cancela no hay evento fiable; resolvemos null al cerrar.
        input.oncancel = () => resolve(null);
        input.click();
    });
}
