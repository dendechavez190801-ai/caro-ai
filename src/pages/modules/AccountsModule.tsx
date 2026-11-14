import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Trash2, Globe, Plus, KeyRound, ShieldCheck, ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react';
import { Section, Card, Pill, DemoBadge } from '../../components/ui';
import { useApp } from '../../store';

const SERVICES = [
    { name: 'Spotify', url: 'https://open.spotify.com' },
    { name: 'YouTube & YouTube Music', url: 'https://music.youtube.com' },
    { name: 'TikTok', url: 'https://www.tiktok.com' },
    { name: 'Instagram', url: 'https://www.instagram.com' },
    { name: 'X (Twitter)', url: 'https://x.com' },
    { name: 'WhatsApp Web', url: 'https://web.whatsapp.com' },
    { name: 'GitHub', url: 'https://github.com' },
    { name: 'GitLab', url: 'https://gitlab.com' },
    { name: 'Hugging Face', url: 'https://huggingface.co' },
    { name: 'Fiverr', url: 'https://www.fiverr.com' },
    { name: 'MercadoLibre', url: 'https://www.mercadolibre.com' },
    { name: 'Binance', url: 'https://www.binance.com' },
];

interface CustomAccount { id: string; name: string; url: string }

interface OpenSession { id: string; name: string; partition: string; url: string }

const ACCOUNTS_KEY = 'caroai.accounts.v1';

function loadCustoms(): CustomAccount[] {
    try {
        const raw = localStorage.getItem(ACCOUNTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

const inputCls = 'px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]';

/** UA de Chrome de escritorio: algunos servicios (WhatsApp Web) rechazan el UA por defecto del webview. */
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const AccountsModule: React.FC = () => {
    const { state, dispatch } = useApp();
    const [customUrl, setCustomUrl] = useState('');
    const [customName, setCustomName] = useState('');
    const [customs, setCustoms] = useState<CustomAccount[]>(loadCustoms);
    const [note, setNote] = useState('');
    const [session, setSession] = useState<OpenSession | null>(null);
    const [urlBar, setUrlBar] = useState('');
    const webviewRef = useRef<HTMLElement | null>(null);
    const browserRef = useRef<HTMLDivElement>(null);

    const isElectron = typeof window !== 'undefined' && !!window.joyai;

    // Persiste las cuentas personalizadas del usuario.
    useEffect(() => {
        try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(customs)); } catch { /* noop */ }
    }, [customs]);

    const addCustom = () => {
        const url = customUrl.trim();
        if (!url) { setNote('Pega la URL del servicio.'); return }
        if (!/^https?:\/\//.test(url)) { setNote('La URL debe empezar con http:// o https://'); return; }
        const name = customName.trim() || url.replace(/^https?:\/\//, '').split('/')[0];
        const acc = { id: `custom-${Date.now()}`, name, url };
        setCustoms((c) => [...c, acc]);
        setCustomUrl(''); setCustomName('');
        openSession(acc);
    };

    /** Abre el servicio en el navegador integrado (Electron) o en el del sistema (web). */
    const openSession = (s: { id: string; name: string; url: string }) => {
        if (!isElectron) {
            window.open(s.url, '_blank', 'noopener');
            setNote(`Se abrió ${s.name} en el navegador del sistema (en la app de escritorio sera el navegador integrado).`);
            return;
        }
        setSession({ id: s.id, name: s.name, partition: `persist:caro-${s.id}`, url: s.url });
        setUrlBar(s.url);
        setNote(`Sesión aislada "${s.name}" (persist:caro-${s.id}). Inicia sesión una vez; queda guardada en este equipo.`);
        // Lleva la vista al navegador integrado para que el usuario lo vea.
        setTimeout(() => browserRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    };

    /** Botón "Agregar cuenta" DENTRO del navegador: guarda la URL actual como tarjeta. */
    const addCurrentAsAccount = () => {
        const raw = urlBar.trim();
        if (!/^https?:\/\//.test(raw)) { setNote('Escribe una URL válida primero (https://…).'); return; }
        const name = raw.replace(/^https?:\/\//, '').split('/')[0].split('.')[0] || 'Sitio';
        const pretty = name.charAt(0).toUpperCase() + name.slice(1);
        const acc = { id: `custom-${Date.now()}`, name: pretty, url: raw };
        setCustoms((c) => (c.some((x) => x.url === raw) ? c : [...c, acc]));
        setNote(`"${pretty}" agregado al listado de cuentas.`);
    };

    const closeSession = () => { setSession(null); setUrlBar(''); };

    const nav = (dir: 'back' | 'forward' | 'reload') => {
        const wv = webviewRef.current as unknown as Record<string, (() => void) | undefined> | null;
        wv?.[dir === 'back' ? 'goBack' : dir === 'forward' ? 'goForward' : 'reload']?.();
    };

    const goUrl = () => {
        const u = urlBar.trim();
        if (!u) return;
        const full = /^https?:\/\//.test(u) ? u : `https://${u}`;
        setUrlBar(full);
        // El webview de Electron NO recarga al cambiar el atributo src:
        // hay que llamar loadURL() sobre el elemento o remontarlo con key.
        const wv = webviewRef.current as unknown as { loadURL?: (url: string) => void } | null;
        if (wv?.loadURL) {
            try { wv.loadURL(full); } catch { /* webview aún no listo */ }
        } else {
            setSession((s) => (s ? { ...s, url: full } : s));
        }
    };

    /** Al montar el webview: sincroniza la barra y atrapa new-window. */
    const attachWebview = (el: HTMLElement | null) => {
        webviewRef.current = el;
        if (!el) return;
        el.addEventListener('did-navigate', (e) => {
            const ev = e as Event & { url?: string };
            if (ev.url) setUrlBar(ev.url);
        });
        el.addEventListener('did-navigate-in-page', (e) => {
            const ev = e as Event & { url?: string };
            if (ev.url) setUrlBar(ev.url);
        });
        el.addEventListener('new-window', (e) => {
            // Los popups navegan dentro del mismo webview, no en ventanas sueltas.
            const ev = e as Event & { url?: string; preventDefault?: () => void };
            ev.preventDefault?.();
            if (ev.url) {
                setUrlBar(ev.url);
                const wv = el as unknown as { loadURL?: (url: string) => void };
                try { wv.loadURL?.(ev.url); } catch { /* noop */ }
            }
        });
    };

    /** Guarda usuario/contraseña cifrado con safeStorage (solo Electron). */
    const saveCredentials = async (s: { id: string; name: string }) => {
        const saver = window.joyai?.secretsSave;
        if (!saver) { setNote('Guardado cifrado solo disponible en la app de escritorio.'); return; }
        const user = window.prompt(`Usuario para ${s.name}:`);
        if (!user) return;
        const pass = window.prompt('Contraseña (se guarda cifrada en este equipo):');
        if (!pass) return;
        const r = await saver({ [`cred:${s.id}`]: JSON.stringify({ u: user, p: pass }) });
        setNote(r.ok ? `Credenciales de "${s.name}" guardadas cifradas.` : `No se pudo guardar (${r.error ?? 'error'}).`);
    };

    const clearSessionData = async (id: string) => {
        const partition = `persist:caro-${id}`;
        const r = await window.joyai?.clearSession?.(partition);
        setNote(r?.ok ? `Sesión de "${id}" borrada (cookies y storage).` : `No se pudo borrar la sesión (${r?.error ?? 'sin Electron'}).`);
    };

    const all = [...SERVICES.map((s, i) => ({ ...s, id: `svc-${i}` })), ...customs];

    return (
        <div className="flex flex-col gap-6">
            <Section title="Cuentas y Navegador" desc="Cada usuario abre el navegador integrado, inicia sesión y guarda su sesión de forma aislada en su equipo (una partición por cuenta). No hay sesiones compartidas entre usuarios." demo={!isElectron}>
                <Card className="flex items-center gap-3 border-emerald-400/20 bg-emerald-400/[0.06]">
                    <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-white">Sesiones aisladas por usuario</p>
                        <p className="text-[11px] text-neutral-400">
                            {isElectron
                                ? 'Cookies y storage viven en particiones persist:caro-* del webview de Electron; CaRo Ai no accede a tus cuentas.'
                                : 'En el preview web se abre el navegador del sistema; en la app de escritorio sera el navegador integrado con sesiones aisladas.'}
                        </p>
                    </div>
                </Card>
            </Section>

            {/* Perfil local del usuario */}
            <Section title="Cuenta de CaRo Ai" desc="Tu perfil vive solo en este equipo. El registro con correo/teléfono y backend llega en una fase posterior; por ahora se guarda local.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] text-neutral-400">Nombre</span>
                        <input value={state.userName} onChange={(e) => dispatch({ type: 'set-profile', patch: { userName: e.target.value } })} placeholder="Tu nombre" className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] text-neutral-400">Correo</span>
                        <input type="email" value={state.userEmail} onChange={(e) => dispatch({ type: 'set-profile', patch: { userEmail: e.target.value } })} placeholder="tu@correo.com" className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] text-neutral-400">Teléfono (opcional)</span>
                        <input type="tel" value={state.userPhone} onChange={(e) => dispatch({ type: 'set-profile', patch: { userPhone: e.target.value } })} placeholder="+52 …" className={inputCls} />
                    </label>
                </div>
                <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={state.termsAccepted}
                        onChange={(e) => dispatch({ type: 'set-profile', patch: { termsAccepted: e.target.checked } })}
                        className="mt-0.5 accent-[rgb(var(--accent))]"
                    />
                    <span className="text-[11px] text-neutral-400 leading-relaxed">
                        Acepto los <span className="text-neutral-200">términos y la política de privacidad</span> (módulo Legal). Entiendo que CaRo Ai es una herramienta local: soy responsable del uso que haga de ella y de los servicios de terceros que conecte.
                    </span>
                </label>
                {state.termsAccepted && <p className="text-[11px] text-emerald-400 mt-2">✓ Perfil guardado localmente en este equipo.</p>}
            </Section>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {all.map((s) => (
                    <Card key={s.id} className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold text-white">{s.name}</p>
                                <p className="text-[11px] text-neutral-500 font-mono truncate">{s.url}</p>
                            </div>
                            <Globe size={16} className="text-neutral-500 shrink-0" />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Pill>Cuenta</Pill>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => openSession(s)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-[rgb(var(--accent)/0.4)] hover:bg-[rgb(var(--accent)/0.1)] transition-colors">
                                    <ExternalLink size={12} /> {isElectron ? 'Abrir' : 'Abrir'}
                                </button>
                                <button type="button" aria-label="Guardar credenciales" title="Guardar usuario/contraseña cifrado" onClick={() => void saveCredentials(s)} className="p-1.5 rounded-lg text-neutral-500 hover:text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent)/0.1)] transition-colors">
                                    <KeyRound size={14} />
                                </button>
                                <button type="button" aria-label="Eliminar sesión" title="Borrar cookies y storage de esta cuenta" onClick={() => void clearSessionData(s.id)} className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 transition-colors">
                                    <Trash2 size={14} />
                                </button>
                                {s.id.startsWith('custom-') && (
                                    <button type="button" aria-label="Quitar cuenta" title="Quitar esta cuenta de la lista"
                                        onClick={() => setCustoms((c) => c.filter((x) => x.id !== s.id))}
                                        className="p-1.5 rounded-lg text-neutral-600 hover:text-rose-400 hover:bg-rose-400/10 transition-colors">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Navegador integrado (solo Electron) */}
            {session && isElectron && (
                <div ref={browserRef}>
                <Section
                    title={`Navegador — ${session.name}`}
                    desc={`Sesión aislada ${session.partition}`}
                    right={
                        <button type="button" onClick={closeSession} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-neutral-400 hover:text-white border border-white/10 transition-colors">
                            <X size={12} /> Cerrar
                        </button>
                    }
                >
                    <div className="flex items-center gap-1.5 mb-3">
                        <button type="button" onClick={() => nav('back')} aria-label="Atrás" className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5"><ArrowLeft size={15} /></button>
                        <button type="button" onClick={() => nav('forward')} aria-label="Adelante" className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5"><ArrowRight size={15} /></button>
                        <button type="button" onClick={() => nav('reload')} aria-label="Recargar" className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5"><RotateCw size={15} /></button>
                        <input
                            value={urlBar}
                            onChange={(e) => setUrlBar(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && goUrl()}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-xs text-neutral-200 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]"
                            placeholder="https://…"
                        />
                        <button type="button" onClick={goUrl} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90">Ir</button>
                        <button
                            type="button"
                            onClick={addCurrentAsAccount}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-neutral-200 border border-white/20 hover:bg-white/10 transition-colors"
                            title="Agrega la URL actual como cuenta en el listado"
                        >
                            <Plus size={12} /> Cuenta
                        </button>
                        <button
                            type="button"
                            onClick={() => void saveCredentials(session)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-emerald-300 border border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20 transition-colors"
                            title="Guarda usuario/contraseña cifrado tras iniciar sesión"
                        >
                            <KeyRound size={12} /> Guardar usuario
                        </button>
                    </div>
                    <webview
                        ref={attachWebview}
                        src={session.url}
                        partition={session.partition}
                        allowpopups
                        useragent={CHROME_UA}
                        className="w-full h-[440px] rounded-xl border border-white/10 bg-white"
                    />
                    <p className="text-[10px] text-neutral-600 mt-2">
                        Las cookies de esta sesión no se comparten con otras cuentas ni con el navegador del sistema.
                        {session.url.includes('whatsapp') && ' WhatsApp Web genera su QR en vivo y único por instalación (partición persistente): cada usuario escanea el suyo.'}
                    </p>
                </Section>
                </div>
            )}

            <Section title="Agregar cuenta o sitio" desc="Escribe cualquier URL → se crea la tarjeta y se abre el navegador integrado aquí abajo → navega a donde quieras, inicia sesión → pulsa «Guardar usuario» y las credenciales quedan cifradas solo en este equipo. También puedes borrar la tarjeta si era solo una prueba.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Nombre (opcional)" className={`${inputCls} sm:col-span-1`} />
                    <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://cualquier-sitio.com" className={`${inputCls} font-mono`} />
                    <button type="button" onClick={addCustom} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity">
                        <Plus size={14} /> Agregar y abrir
                    </button>
                </div>
                <p className="text-[11px] text-neutral-600 mt-3">Flujo: pegas la URL → <strong>Agregar y abrir</strong> crea la tarjeta y carga el navegador con sesión aislada → navegas a cualquier página → inicias sesión → <span className="text-emerald-400">Guardar usuario</span> cifra tus credenciales en este equipo (safeStorage/DPAPI). Nada se registra en un servidor central ni se comparten sesiones entre usuarios. {!isElectron && <DemoBadge />}</p>
                {note && <p className="text-[11px] text-[rgb(var(--accent))] mt-2">{note}</p>}
            </Section>
        </div>
    );
};
