import React, { useEffect, useState } from 'react';
import { MessageCircle, Send, Hash, Server, KeyRound, Globe, ShieldCheck, GitBranch, Calendar, ShoppingBag, Plus, Trash2, Plug, CheckCircle2, Loader2, ExternalLink, Container, Copy } from 'lucide-react';
import { Section, Card, Pill, DemoBadge } from '../../components/ui';
import { ConnectorService, loadConnectorToken, saveConnectorToken, whoami, connectorGet } from '../../connectors';
import { useApp } from '../../store';
import { getSystemInfo, SystemInfo } from '../../system';
import { shellFor } from './TerminalModule';

/* ── Tarjeta genérica de conector por token (Telegram/Discord/X/GitHub…) ── */
interface TokenCfg {
    id: ConnectorService;
    name: string;
    desc: string;
    tokenHint: string;
    /** Dónde sacar el token. */
    tokenUrl: string;
    test: (token: string) => Promise<{ ok: boolean; info?: string; err?: string }>;
    siteUrl?: string;
}

const testGithubLike = (id: 'github' | 'gitlab' | 'hf', extra?: (t: string) => Promise<string>) => async (token: string) => {
    const w = await whoami(id, token);
    if (!w.ok) return { ok: false, err: w.error ?? 'Token rechazado' };
    let info = `Conectado como ${w.login}${w.name ? ` (${w.name})` : ''}`;
    if (extra) info += await extra(token);
    return { ok: true, info };
};

const MSG_CONNECTORS: TokenCfg[] = [
    {
        id: 'telegram', name: 'Telegram', desc: 'Bot de Telegram: pega el token de @BotFather y el agente puede leer/enviar mensajes por la API oficial.',
        tokenHint: 'Token del bot (@BotFather → /newbot)', tokenUrl: 'https://t.me/BotFather', siteUrl: 'https://web.telegram.org',
        test: async (t) => {
            const r = await connectorGet('telegram', `/bot${t}/getMe`, '');
            const j = r.json as { ok?: boolean; result?: { username?: string; first_name?: string } } | null;
            if (r.ok && j?.ok && j.result) return { ok: true, info: `Bot activo: @${j.result.username} (${j.result.first_name})` };
            return { ok: false, err: r.error ?? `HTTP ${r.status ?? '?'} — revisa el token` };
        },
    },
    {
        id: 'discord', name: 'Discord', desc: 'Bot de Discord: token del portal de desarrolladores; permite leer canales/mensajes autorizados por el bot.',
        tokenHint: 'discord.com/developers → Bot → Token', tokenUrl: 'https://discord.com/developers/applications', siteUrl: 'https://discord.com/app',
        test: async (t) => {
            const r = await connectorGet('discord', '/users/@me', t);
            const j = r.json as { username?: string } | null;
            if (r.ok && j?.username) return { ok: true, info: `Bot conectado: ${j.username}` };
            return { ok: false, err: r.error ?? `HTTP ${r.status ?? '?'} — revisa el token` };
        },
    },
    {
        id: 'x', name: 'X (Twitter)', desc: 'API oficial de X: requiere plan de desarrollador de pago para la mayoría de funciones; la prueba usa tu token Bearer.',
        tokenHint: 'developer.x.com → tu app → Bearer Token', tokenUrl: 'https://developer.x.com', siteUrl: 'https://x.com',
        test: async (t) => {
            const r = await connectorGet('x', '/2/users/me', t);
            const j = r.json as { data?: { username?: string } } | null;
            if (r.ok && j?.data?.username) return { ok: true, info: `Cuenta conectada: @${j.data.username}` };
            return { ok: false, err: r.error ?? `HTTP ${r.status ?? '?'} — la API de X exige plan de pago en la mayoría de casos` };
        },
    },
];

const CODE: TokenCfg[] = [
    {
        id: 'github', name: 'GitHub', desc: 'Repos, issues, PRs y Releases con tu token.',
        tokenHint: 'github.com/settings/tokens (scope repo)', tokenUrl: 'https://github.com/settings/tokens', siteUrl: 'https://github.com',
        test: testGithubLike('github', async (t) => {
            const repos = await connectorGet('github', '/user/repos?per_page=100&sort=updated', t);
            const arr = Array.isArray(repos.json) ? repos.json : [];
            return ` · ${arr.length} repo${arr.length === 1 ? '' : 's'}`;
        }),
    },
    {
        id: 'gitlab', name: 'GitLab', desc: 'Repos, pipelines y merges con tu token.',
        tokenHint: 'gitlab.com/-/user_settings/personal_access_tokens', tokenUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens', siteUrl: 'https://gitlab.com',
        test: testGithubLike('gitlab'),
    },
    {
        id: 'hf', name: 'Hugging Face', desc: 'Modelos, datasets y Spaces con tu token.',
        tokenHint: 'huggingface.co/settings/tokens', tokenUrl: 'https://huggingface.co/settings/tokens', siteUrl: 'https://huggingface.co',
        test: testGithubLike('hf'),
    },
];

const PRODUCTIVITY = [
    { icon: Calendar, name: 'Google Calendar', url: 'https://calendar.google.com' },
    { icon: Calendar, name: 'Google Maps', url: 'https://maps.google.com' },
    { icon: ShoppingBag, name: 'Google Drive', url: 'https://drive.google.com' },
    { icon: ShoppingBag, name: 'Google Meet', url: 'https://meet.google.com' },
    { icon: Calendar, name: 'Gmail', url: 'https://mail.google.com' },
    { icon: Calendar, name: 'Outlook', url: 'https://outlook.live.com' },
    { icon: ShoppingBag, name: 'OneDrive', url: 'https://onedrive.live.com' },
    { icon: ShoppingBag, name: 'Dropbox', url: 'https://www.dropbox.com' },
    { icon: ShoppingBag, name: 'Notion', url: 'https://www.notion.so' },
    { icon: ShoppingBag, name: 'Slack', url: 'https://app.slack.com' },
    { icon: Calendar, name: 'Trello', url: 'https://trello.com' },
    { icon: Calendar, name: 'Asana', url: 'https://app.asana.com' },
    { icon: ShoppingBag, name: 'Jira', url: 'https://id.atlassian.com' },
    { icon: Calendar, name: 'Zoom', url: 'https://zoom.us' },
    { icon: ShoppingBag, name: 'Microsoft Teams', url: 'https://teams.microsoft.com' },
    { icon: ShoppingBag, name: 'Figma', url: 'https://www.figma.com' },
    { icon: ShoppingBag, name: 'Airtable', url: 'https://airtable.com' },
    { icon: Calendar, name: 'Todoist', url: 'https://todoist.com' },
];

/** Tarjeta de conector por token: guarda cifrado + prueba real + abrir sitio. */
const TokenCard: React.FC<{ cfg: TokenCfg }> = ({ cfg }) => {
    const { dispatch } = useApp();
    const [token, setToken] = useState('');
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [info, setInfo] = useState('');
    const [err, setErr] = useState('');

    useEffect(() => {
        let on = true;
        loadConnectorToken(cfg.id).then((t) => { if (on && t) { setToken(t); setSaved(true); } });
        return () => { on = false; };
    }, [cfg.id]);

    const test = async () => {
        setBusy(true); setErr(''); setInfo('');
        const t = token.trim();
        if (!t) { setErr('Pega tu token primero.'); setBusy(false); return; }
        await saveConnectorToken(cfg.id, t);
        setSaved(true);
        const r = await cfg.test(t).catch((e) => ({ ok: false as const, err: String(e) }));
        setBusy(false);
        if (r.ok) setInfo(r.info ?? 'Conectado');
        else setErr(r.err ?? 'Falló la prueba');
    };

    const openSite = () => {
        if (!cfg.siteUrl) return;
        dispatch({ type: 'set-preview-url', url: cfg.siteUrl });
        dispatch({ type: 'set-tab', tab: 'preview' });
    };

    return (
        <Card className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <GitBranch size={16} className="text-[rgb(var(--accent))]" />
                <p className="text-sm font-semibold text-white">{cfg.name}</p>
                {saved && <CheckCircle2 size={13} className="text-emerald-400" />}
            </div>
            <p className="text-[11px] text-neutral-500">{cfg.desc}</p>
            <input
                type="password"
                value={token}
                onChange={(e) => { setToken(e.target.value); setSaved(false); }}
                placeholder={cfg.tokenHint}
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] text-neutral-200 placeholder:text-neutral-600 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]"
            />
            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => void test()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />} Probar y guardar
                </button>
                <button type="button" onClick={() => void navigator.clipboard?.writeText(token).catch(() => {})} disabled={!token} className="px-2.5 py-1.5 rounded-lg text-[11px] text-neutral-400 border border-white/10 hover:border-white/20 disabled:opacity-40" title="Copiar token">
                    <Copy size={11} />
                </button>
                {cfg.siteUrl && (
                    <button type="button" onClick={openSite} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-neutral-400 border border-white/10 hover:border-white/20 hover:text-white" title="Abrir en Vista Previa">
                        <ExternalLink size={11} /> Web
                    </button>
                )}
            </div>
            <p className="text-[10px] text-neutral-600">Token: <a href={cfg.tokenUrl} target="_blank" rel="noreferrer" className="text-[rgb(var(--accent))] hover:underline">{cfg.tokenUrl.replace('https://', '')}</a></p>
            {info && <p className="text-[11px] text-emerald-400">{info}</p>}
            {err && <p className="text-[11px] text-rose-400">{err}</p>}
        </Card>
    );
};

/** Contenedores Docker del equipo (solo lectura, Electron). */
const DockerSection: React.FC = () => {
    const [list, setList] = useState<{ name: string; status: string; ports: string }[] | null>(null);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const isElectron = !!window.joyai?.shellExec;

    /** ID único de esta instalación (persistente, no compartido entre usuarios). */
    const installUid = () => {
        let u = localStorage.getItem('caroai.install.uid');
        if (!u) { u = Math.random().toString(36).slice(2, 10); try { localStorage.setItem('caroai.install.uid', u); } catch { /* noop */ } }
        return u;
    };

    /** Crea un contenedor propio de esta instalación: nombre y volumen únicos. */
    const createOwn = async () => {
        const uid = installUid();
        const name = `caroai-${uid}`;
        setBusy(true); setMsg('');
        const r = await window.joyai!.shellExec!(
            `docker run -d --name ${name} -v ${name}-data:/data alpine sleep infinity`
        ).catch((e) => ({ ok: false as const, error: String(e) }));
        setBusy(false);
        setMsg(r.ok
            ? `✓ Contenedor propio "${name}" creado (volumen ${name}-data). Es exclusivo de esta instalación.`
            : `Error: ${r.error ?? 'docker no disponible — ¿está instalado y corriendo?'}`);
        if (r.ok) void detect();
    };

    const detect = async () => {
        setBusy(true); setErr('');
        const r = await window.joyai!.shellExec!('docker ps -a --format "{{.Names}}|{{.Status}}|{{.Ports}}"').catch((e) => ({ ok: false as const, error: String(e) }));
        setBusy(false);
        if (!r.ok) { setErr(r.error ?? 'docker no disponible en este equipo'); setList(null); return; }
        const rows = (r.output ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
            const [name = '', status = '', ports = ''] = l.split('|');
            return { name, status, ports };
        });
        setList(rows);
    };

    return (
        <Section title="Contenedores Docker" desc="Detección de solo lectura de tus contenedores (docker ps). Para ejecutar dentro de uno usa el módulo Dispositivos con SSH y consentimiento explícito.">
            {!isElectron ? (
                <p className="text-[11px] text-neutral-600">La detección de contenedores requiere la app de escritorio. <DemoBadge /></p>
            ) : (
                <>
                    <button type="button" onClick={() => void detect()} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 disabled:opacity-50">
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Container size={13} />} {busy ? 'Detectando…' : 'Detectar contenedores'}
                    </button>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <button type="button" onClick={() => void createOwn()} disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-neutral-200 border border-white/15 hover:border-white/30 disabled:opacity-50">
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <Container size={13} />} Crear mi contenedor
                        </button>
                        <p className="text-[10px] text-neutral-600">Nombre y volumen únicos por instalación (caroai-&lt;id&gt;). Requiere Docker instalado.</p>
                    </div>
                    {msg && <p className="text-[11px] text-[rgb(var(--accent))] mt-2">{msg}</p>}
                    {err && <p className="text-[11px] text-rose-400 mt-2">{err}</p>}
                    {list && list.length === 0 && <p className="text-[11px] text-neutral-500 mt-2">Docker responde pero no hay contenedores.</p>}
                    {list && list.length > 0 && (
                        <div className="mt-3 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                            {list.map((c) => (
                                <div key={c.name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                                    <Container size={13} className="text-[rgb(var(--accent))] shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-neutral-200 font-mono truncate">{c.name}</p>
                                        <p className="text-[10px] text-neutral-600 font-mono truncate">{c.status}{c.ports ? ` · ${c.ports}` : ''}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[11px] text-neutral-600 mt-3 flex items-center gap-1"><ShieldCheck size={12} /> Sin PC no hay Docker local: en celular la opción real es SSH al equipo que sí lo tiene (Dispositivos → SSH, con tu consentimiento).</p>
                </>
            )}
        </Section>
    );
};

const SYS = [
    { icon: Server, title: 'Manejo de Código', desc: 'Scripts y automatización de código en tu equipo.' },
    { icon: KeyRound, title: 'IP y Shell Activo', desc: 'Llaves SSH y shell reales de ESTE equipo (auto-detectados).' },
    { icon: Globe, title: 'Proxy / Red', desc: 'Configuración de red solo de esta instalación.' },
];

const STORE_KEY = 'caroai.connectors.v1';
const DATA_KEY = 'caroai.netdata.v1';

interface CustomConnector { id: string; name: string; url: string }

const load = <T,>(k: string, fallback: T): T => {
    try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};

export const ConnectorsModule: React.FC = () => {
    const { dispatch } = useApp();
    const [info, setInfo] = useState<SystemInfo | null>(null);
    const [custom, setCustom] = useState<CustomConnector[]>(() => load<CustomConnector[]>(STORE_KEY, []));
    const [cName, setCName] = useState('');
    const [cUrl, setCUrl] = useState('');
    const [net, setNet] = useState(() => load<{ ip: string; shell: string; proxy: string }>(DATA_KEY, { ip: '', shell: '', proxy: '' }));
    const [note, setNote] = useState('');

    useEffect(() => {
        let on = true;
        getSystemInfo().then((s) => { if (on) setInfo(s); }).catch(() => {});
        return () => { on = false; };
    }, []);
    useEffect(() => {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(custom)); } catch { /* noop */ }
    }, [custom]);
    useEffect(() => {
        try { localStorage.setItem(DATA_KEY, JSON.stringify(net)); } catch { /* noop */ }
    }, [net]);

    // IP/shell reales del equipo como valores por defecto.
    const realIp = info?.networkIp ?? '';
    const realShell = shellFor(info?.platform);

    const addCustom = () => {
        const name = cName.trim();
        const url = cUrl.trim();
        if (!name || !url) { setNote('Escribe nombre y URL del conector.'); return; }
        if (!/^https?:\/\//i.test(url)) { setNote('La URL debe empezar con http:// o https://'); return; }
        const item = { id: `c${Date.now()}`, name, url };
        setCustom((c) => [...c, item]);
        setCName(''); setCUrl(''); setNote(`"${name}" agregado — abriéndolo en Vista Previa para que inicies sesión.`);
        openUrl(url); // abre el navegador integrado: login → la sesión queda aislada
    };

    const openUrl = (url: string) => {
        dispatch({ type: 'set-preview-url', url });
        dispatch({ type: 'set-tab', tab: 'preview' });
    };

    return (
        <div className="flex flex-col gap-6">
            <Section title="Mensajería" desc="Tokens reales por servicio: se guardan cifrados en este equipo y se prueban contra la API oficial. WhatsApp usa su sesión web (no hay API gratuita oficial).">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Card className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <MessageCircle size={16} className="text-[rgb(var(--accent))]" />
                            <div>
                                <span className="text-sm text-white block">WhatsApp</span>
                                <span className="text-[10px] text-neutral-500">Sesión web aislada (QR en el navegador)</span>
                            </div>
                        </div>
                        <button type="button" onClick={() => openUrl('https://web.whatsapp.com')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-200 border border-[rgb(var(--accent)/0.4)] hover:bg-[rgb(var(--accent)/0.1)] transition-colors">
                            <ExternalLink size={11} /> Abrir
                        </button>
                    </Card>
                    {MSG_CONNECTORS.map((cfg) => <TokenCard key={cfg.id} cfg={cfg} />)}
                </div>
            </Section>

            <Section title="Código y Repositorios" desc="Conexión real con tu token personal. Se guarda cifrado en este equipo (safeStorage en Electron); nunca se comparte.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {CODE.map((cfg) => <TokenCard key={cfg.id} cfg={cfg} />)}
                </div>
            </Section>

            <Section title="Productividad" desc="Abre cada servicio en Vista Previa con su sesión aislada; inicia sesión ahí una vez.">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {PRODUCTIVITY.map((s) => (
                        <Card key={s.name} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <s.icon size={16} className="text-[rgb(var(--accent))] shrink-0" />
                                <span className="text-sm text-white truncate">{s.name}</span>
                            </div>
                            <button type="button" onClick={() => openUrl(s.url)} className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition-colors shrink-0" title="Abrir en Vista Previa">
                                <ExternalLink size={13} />
                            </button>
                        </Card>
                    ))}
                </div>
            </Section>

            <DockerSection />

            <Section title="Conectores del Sistema" desc="Datos reales de red/shell de ESTA instalación (auto-detectados). Nunca se comparten entre usuarios.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {SYS.map((s) => (
                        <Card key={s.title} className="flex flex-col gap-2">
                            <s.icon size={18} className="text-[rgb(var(--accent))]" />
                            <p className="text-sm font-semibold text-white">{s.title}</p>
                            <p className="text-[11px] text-neutral-500">{s.desc}</p>
                        </Card>
                    ))}
                </div>

                <Card className="mt-4 flex flex-col gap-3">
                    <p className="text-[11px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">Datos reales de esta instalación</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[11px] text-neutral-400">IP / Host {realIp && <span className="text-emerald-500">(detectada: {realIp})</span>}</span>
                            <input value={net.ip || realIp} onChange={(e) => setNet({ ...net, ip: e.target.value })} placeholder="192.168.x.x o dominio" className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[11px] text-neutral-400">Shell activo {realShell && <span className="text-emerald-500">({realShell})</span>}</span>
                            <input value={net.shell} onChange={(e) => setNet({ ...net, shell: e.target.value })} placeholder={realShell} className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[11px] text-neutral-400">Proxy / Datos</span>
                            <input value={net.proxy} onChange={(e) => setNet({ ...net, proxy: e.target.value })} placeholder="http://proxy:puerto (opcional)" className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                        </label>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] text-neutral-600 flex items-center gap-1.5"><ShieldCheck size={12} /> Las claves SSH y tokens se guardan cifrados solo en este equipo.</p>
                        <button type="button" onClick={() => setNote('Datos de red guardados en este equipo.')} className="px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity shrink-0">Guardar</button>
                    </div>
                    {note && <p className="text-[11px] text-[rgb(var(--accent))]">{note}</p>}
                </Card>
            </Section>

            <Section title="Conector personalizado" desc="Agrega cualquier servicio con URL propia; se abre en Vista Previa con sesión aislada.">
                <Card className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
                        <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Nombre (ej. Fiverr)" className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                        <input value={cUrl} onChange={(e) => setCUrl(e.target.value)} placeholder="https://api.ejemplo.com o https://sitio.com" className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 font-mono outline-none focus:border-[rgb(var(--accent)/0.5)]" />
                        <button type="button" onClick={addCustom} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity">
                            <Plus size={13} /> Agregar
                        </button>
                    </div>
                    {custom.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-1">
                            {custom.map((c) => (
                                <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Plug size={13} className="text-[rgb(var(--accent))] shrink-0" />
                                        <span className="text-xs text-white truncate">{c.name}</span>
                                        <span className="text-[10px] text-neutral-500 font-mono truncate">{c.url}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button type="button" onClick={() => openUrl(c.url)} className="p-1.5 text-neutral-500 hover:text-white transition-colors" title="Abrir en Vista Previa"><ExternalLink size={13} /></button>
                                        <button type="button" onClick={() => setCustom((l) => l.filter((x) => x.id !== c.id))} className="p-1.5 text-neutral-600 hover:text-red-400 transition-colors" aria-label="Eliminar"><Trash2 size={13} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {note && <p className="text-[11px] text-[rgb(var(--accent))]">{note}</p>}
                </Card>
            </Section>
        </div>
    );
};
