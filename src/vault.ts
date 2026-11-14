/**
 * Bóveda local de CaRo Ai (estilo Obsidian): notas y memorias guardadas en
 * este equipo. Nada sale del dispositivo; import/export en .md y .json.
 */

export interface VaultAttachment {
    name: string;
    /** MIME del archivo (application/pdf, image/png…). */
    mime: string;
    /** Contenido en base64 (data URL sin el prefijo). */
    data: string;
    size: number;
}

/** Tipos sugeridos; el campo `type` de la nota es texto libre definido por el usuario. */
export type VaultNoteType = 'nota' | 'idea' | 'referencia' | 'documento' | (string & {});

export interface VaultNote {
    id: string;
    title: string;
    content: string;
    tags: string[];
    /** Carpeta dentro de la bóveda ('' = raíz). */
    folder?: string;
    /** Tipo de nota para el "cerebro" y filtros. */
    type?: VaultNoteType;
    /** Archivos adjuntos (PDF, imágenes) guardados en base64 local. */
    attachments?: VaultAttachment[];
    /** 'user' manual, 'chat' guardada desde una conversación, 'import' archivo. */
    source: 'user' | 'chat' | 'import';
    createdAt: number;
    updatedAt: number;
}

const VAULT_KEY = 'caroai.vault.v1';
const VAULT_FOLDERS_KEY = 'caroai.vault.folders.v1';

/** Carpetas explícitas de la bóveda (pueden existir vacías). */
export function loadFolders(): string[] {
    try {
        const raw = localStorage.getItem(VAULT_FOLDERS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((f) => typeof f === 'string') : [];
    } catch {
        return [];
    }
}

export function saveFolders(folders: string[]): void {
    try {
        localStorage.setItem(VAULT_FOLDERS_KEY, JSON.stringify(folders));
    } catch { /* cuota llena */ }
}
/** Retención sugerida: 6 meses en milisegundos. */
export const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export function loadNotes(): VaultNote[] {
    try {
        const raw = localStorage.getItem(VAULT_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveNotes(notes: VaultNote[]): void {
    try {
        localStorage.setItem(VAULT_KEY, JSON.stringify(notes));
    } catch {
        /* cuota llena: se conserva lo que quepa */
    }
}

export function createNote(
    title = 'Nota sin título',
    content = '',
    extra: Partial<Pick<VaultNote, 'folder' | 'type' | 'tags' | 'attachments'>> = {},
): VaultNote {
    const now = Date.now();
    return {
        id: `note-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        content,
        tags: extra.tags ?? [],
        folder: extra.folder,
        type: extra.type,
        attachments: extra.attachments,
        source: 'user',
        createdAt: now,
        updatedAt: now,
    };
}

/** Notas que superan el lapso de retención (6 meses). */
export function expiredNotes(notes: VaultNote[], now = Date.now()): VaultNote[] {
    return notes.filter((n) => now - n.updatedAt > RETENTION_MS);
}

/** Convierte una nota a Markdown descargable. */
export function noteToMarkdown(n: VaultNote): string {
    const tags = n.tags.length ? `\n> tags: ${n.tags.map((t) => `#${t}`).join(' ')}\n` : '';
    return `# ${n.title}\n> actualizada: ${new Date(n.updatedAt).toISOString()} · origen: ${n.source}${tags}\n\n${n.content}\n`;
}

/** Parsea un .md básico: título de la primera línea y tags de la cita. */
export function markdownToNote(filename: string, md: string): VaultNote {
    const lines = md.split(/\r?\n/);
    const title = (lines.find((l) => l.startsWith('# ')) ?? `# ${filename.replace(/\.md$/i, '')}`).replace(/^#\s*/, '').trim();
    const tagLine = lines.find((l) => l.includes('tags:'));
    const tags = tagLine
        ? (tagLine.match(/#[\wáéíóúñ-]+/gi) ?? []).map((t) => t.replace(/^#/, '').toLowerCase())
        : [];
    const content = lines.filter((l) => !l.startsWith('# ') && !l.startsWith('> ')).join('\n').trim();
    const now = Date.now();
    return {
        id: `note-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        content,
        tags,
        source: 'import',
        createdAt: now,
        updatedAt: now,
    };
}

/** Descarga un archivo de texto en el navegador. */
export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Busca notas relevantes para una consulta (punto 5: la bóveda alimenta a la IA).
 * Puntaje simple: coincidencias en título > tags > contenido. Devuelve máx. `limit`.
 */
export function searchNotes(notes: VaultNote[], query: string, limit = 4): VaultNote[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter((t) => t.length > 2);
    if (!terms.length) return [];
    return notes
        .map((n) => {
            const title = n.title.toLowerCase();
            const tags = n.tags.map((t) => t.toLowerCase());
            const content = n.content.toLowerCase();
            let score = 0;
            for (const t of terms) {
                if (title.includes(t)) score += 5;
                if (tags.some((tag) => tag.includes(t))) score += 3;
                if (content.includes(t)) score += 1;
            }
            return { n, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((r) => r.n);
}
