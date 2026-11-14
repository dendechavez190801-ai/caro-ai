/**
 * Conectores reales: GitHub, GitLab y Hugging Face.
 *
 * Tokens: en Electron se guardan cifrados con safeStorage (clave `conn-<svc>`
 * en caroai-secrets.json). En navegador caen a localStorage (fallback).
 * Las llamadas API salen por el proceso main (Electron) con allowlist de
 * hosts, o por fetch directo en web (esos hosts permiten CORS).
 */

export type ConnectorService = 'github' | 'gitlab' | 'hf' | 'telegram' | 'discord' | 'x';

const LS_PREFIX = 'caroai.conn-token.';

export async function saveConnectorToken(service: ConnectorService, token: string): Promise<void> {
    const key = `conn-${service}`;
    if (window.joyai?.secretsSave) {
        await window.joyai.secretsSave({ [key]: token }).catch(() => {});
    } else {
        try {
            if (token) localStorage.setItem(LS_PREFIX + service, token);
            else localStorage.removeItem(LS_PREFIX + service);
        } catch { /* noop */ }
    }
}

export async function loadConnectorToken(service: ConnectorService): Promise<string> {
    if (window.joyai?.secretsLoad) {
        const all = await window.joyai.secretsLoad().catch(() => ({} as Record<string, string>));
        const v = all[`conn-${service}`];
        if (v) return v;
    }
    try { return localStorage.getItem(LS_PREFIX + service) ?? ''; } catch { return ''; }
}

export async function clearConnectorToken(service: ConnectorService): Promise<void> {
    await saveConnectorToken(service, '');
}

const DIRECT_BASE: Record<ConnectorService, string> = {
    github: 'https://api.github.com',
    gitlab: 'https://gitlab.com/api/v4',
    hf: 'https://huggingface.co/api',
    telegram: 'https://api.telegram.org',
    discord: 'https://discord.com/api/v10',
    x: 'https://api.twitter.com',
};

export interface ApiResult {
    ok: boolean;
    status?: number;
    json?: unknown;
    error?: string;
}

/** GET a la API del conector. En Electron pasa por el main (allowlist). */
export async function connectorGet(service: ConnectorService, path: string, token: string): Promise<ApiResult> {
    if (window.joyai?.connectorApi) {
        const r = await window.joyai.connectorApi({ service, path, token }).catch((e): { ok: boolean; status?: number; json?: unknown; text?: string; error?: string } => ({ ok: false, error: String(e) }));
        return { ok: r.ok, status: r.status, json: r.json, error: r.error ?? r.text };
    }
    // Fallback web: fetch directo (GitHub/GitLab/HF permiten CORS).
    const headers: Record<string, string> = { accept: 'application/json' };
    if (service === 'gitlab') headers['private-token'] = token;
    else if (service === 'discord' && token) headers.authorization = `Bot ${token}`;
    else if (service !== 'telegram' && token) headers.authorization = `Bearer ${token}`;
    try {
        const res = await fetch(DIRECT_BASE[service] + path, { headers, signal: AbortSignal.timeout(10000) });
        const json = await res.json().catch(() => null);
        return { ok: res.ok, status: res.status, json };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'falló la conexión' };
    }
}

/** Datos del usuario autenticado (para "Probar conexión"). */
export async function whoami(service: ConnectorService, token: string): Promise<{ ok: boolean; login?: string; name?: string; error?: string }> {
    const path = service === 'github' ? '/user' : service === 'gitlab' ? '/user' : '/whoami-v2';
    const r = await connectorGet(service, path, token);
    if (!r.ok) return { ok: false, error: r.error ?? `HTTP ${r.status ?? '?'}` };
    const j = r.json as Record<string, unknown> | null;
    if (!j) return { ok: false, error: 'respuesta vacía' };
    if (service === 'hf') {
        const auth = j.auth as { accessToken?: { displayName?: string } } | undefined;
        return { ok: true, login: auth?.accessToken?.displayName ?? 'HF user' };
    }
    return { ok: true, login: String(j.login ?? j.username ?? 'usuario'), name: String(j.name ?? '') };
}
