/**
 * Cliente de IA para CaRo Ai.
 *
 * Soporta tres familias de API:
 * - OpenAI-compatible (`/chat/completions`): OpenAI, Groq, DeepSeek,
 *   OpenRouter, Nvidia NIM, Ollama, LM Studio, vLLM y "personalizado".
 * - Anthropic (`/v1/messages`).
 * - Google Gemini (`/v1beta/models/{model}:generateContent`).
 *
 * Nota: en el navegador el fetch esta sujeto a CORS; los proveedores que no
 * envian cabeceras CORS (p. ej. Anthropic) necesitaran un proxy via Electron
 * en una iteracion posterior.
 */
import { AIEngineConfig } from './types';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface EngineHealth {
    ok: boolean;
    latencyMs: number;
    /** Nombres/ids de modelos que reporta el servidor (si los expone). */
    models: string[];
    error?: string;
}

/** Separa los mensajes `system` del resto, que es lo que piden Anthropic/Gemini. */
function splitSystem(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n').trim();
    return { system, rest: messages.filter((m) => m.role !== 'system') };
}

/** OpenAI-compatible: OpenAI, Groq, DeepSeek, OpenRouter, Nvidia, Ollama, LM Studio, vLLM, custom. */
async function openAiChat(engine: AIEngineConfig, messages: ChatMessage[], temperature?: number, signal?: AbortSignal): Promise<string> {
    const base = engine.endpoint.replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (engine.apiKey) headers.Authorization = `Bearer ${engine.apiKey}`;

    const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: engine.model, messages, temperature: temperature ?? 0.7 }),
        signal,
    });

    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${t ? `: ${t.slice(0, 180)}` : ''}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content : '(sin respuesta)';
}

/** Anthropic Messages API: el sistema va en `system`, no dentro de `messages`. */
async function anthropicChat(engine: AIEngineConfig, messages: ChatMessage[], temperature?: number, signal?: AbortSignal): Promise<string> {
    const base = engine.endpoint.replace(/\/+$/, '');
    const { system, rest } = splitSystem(messages);
    // Anthropic exige que el primer mensaje sea `user`; se descartan assistants iniciales.
    const chat = rest.filter((m, i) => !(i === 0 && m.role === 'assistant'));

    const res = await fetch(`${base}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': engine.apiKey ?? '',
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: engine.model,
            max_tokens: 1024,
            ...(system ? { system } : {}),
            ...(temperature !== undefined ? { temperature } : {}),
            messages: chat.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal,
    });

    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${t ? `: ${t.slice(0, 180)}` : ''}`);
    }
    const data = await res.json();
    const text = (data?.content ?? []).filter((b: { type?: string }) => b.type === 'text').map((b: { text?: string }) => b.text ?? '').join('');
    return text.trim() || '(sin respuesta)';
}

/** Google Gemini generateContent: roles `user`/`model`, texto en `parts`. */
async function geminiChat(engine: AIEngineConfig, messages: ChatMessage[], _temperature?: number, signal?: AbortSignal): Promise<string> {
    const base = engine.endpoint.replace(/\/+$/, '');
    const { system, rest } = splitSystem(messages);

    const res = await fetch(`${base}/models/${encodeURIComponent(engine.model)}:generateContent`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(engine.apiKey ? { 'x-goog-api-key': engine.apiKey } : {}),
        },
        body: JSON.stringify({
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents: rest.map((m) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            })),
        }),
        signal,
    });

    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${t ? `: ${t.slice(0, 180)}` : ''}`);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p.text ?? '').join('');
    return text.trim() || '(sin respuesta)';
}

/** Punto unico de entrada: elige el adaptador segun `providerType`. */
export async function chatCompletion(
    engine: AIEngineConfig,
    messages: ChatMessage[],
    opts?: { signal?: AbortSignal; temperature?: number },
): Promise<string> {
    // En Electron se usa el proxy IPC (sin CORS, keys en el proceso principal).
    const ipc = window.joyai?.aiRequest;
    if (ipc) {
        const r = await ipc({
            endpoint: engine.endpoint,
            apiKey: engine.apiKey,
            providerType: engine.providerType,
            model: engine.model,
            messages,
            temperature: opts?.temperature,
        });
        if (!r.ok) throw new Error(r.error ?? 'error del proveedor');
        return r.text ?? '(sin respuesta)';
    }

    switch (engine.providerType) {
        case 'anthropic':
            return anthropicChat(engine, messages, opts?.temperature, opts?.signal);
        case 'gemini':
            return geminiChat(engine, messages, opts?.temperature, opts?.signal);
        default:
            return openAiChat(engine, messages, opts?.temperature, opts?.signal);
    }
}

/**
 * Comprueba si un servidor de IA responde y que modelos tiene instalados.
 * Usa `GET {endpoint}/models`, que exponen Ollama, LM Studio, vLLM y la mayoria
 * de APIs OpenAI-compatible. Timeout de 4 s para no colgar la UI.
 */
export async function checkEngineHealth(engine: AIEngineConfig): Promise<EngineHealth> {
    const ipc = window.joyai?.aiRequest;
    if (ipc) {
        const r = await ipc({
            endpoint: engine.endpoint,
            apiKey: engine.apiKey,
            providerType: engine.providerType,
            model: engine.model,
            health: true,
        });
        return { ok: r.ok, latencyMs: r.latencyMs ?? 0, models: r.models ?? [], error: r.error };
    }

    const base = engine.endpoint.replace(/\/+$/, '');
    if (!base) return { ok: false, latencyMs: 0, models: [], error: 'sin endpoint' };

    const headers: Record<string, string> = {};
    if (engine.apiKey) headers.Authorization = `Bearer ${engine.apiKey}`;

    const t0 = performance.now();
    try {
        const res = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(4000) });
        const latencyMs = Math.round(performance.now() - t0);
        if (!res.ok) return { ok: false, latencyMs, models: [], error: `HTTP ${res.status}` };
        const data = await res.json();
        const list: unknown[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        const models = list
            .map((m) => (m as { id?: string; name?: string }).id ?? (m as { name?: string }).name ?? '')
            .filter((s): s is string => typeof s === 'string' && s.length > 0);
        return { ok: true, latencyMs, models };
    } catch (err) {
        return {
            ok: false,
            latencyMs: Math.round(performance.now() - t0),
            models: [],
            error: err instanceof Error ? err.message : 'sin conexion',
        };
    }
}
