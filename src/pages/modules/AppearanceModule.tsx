import React, { useEffect, useState } from 'react';
import {
    AudioLines,
    Check,
    Image as ImageIcon,
    MessageSquare,
    Mic,
    Monitor,
    Palette,
    Phone,
    Play,
    Plus,
    RotateCcw,
    Trash2,
    Type,
    Upload,
    User,
} from 'lucide-react';
import { ACCENTS, DEFAULT_ACCENT, DEFAULT_FONT, FONTS, accentFromHex, getAccent, getFont } from '../../theme';
import { useApp } from '../../store';
import { PIPER_VOICES, KOKORO_VOICES, speakLocal, startMicRecording, stopMicRecording } from '../../speech';
import { pickFile, pickImageDataUrl, fileToDataUrl } from '../../media';
import type { CallStyleId } from '../../store';
import { AVATAR_SCENES, isDaytime, sceneSvg } from '../../avatarScenes';

const BG_PRESETS: { id: 'void' | 'graphite' | 'midnight' | 'wine' | 'custom'; name: string; color: string }[] = [
    { id: 'void', name: 'Negro puro', color: '#050505' },
    { id: 'graphite', name: 'Grafito', color: '#0a0a0a' },
    { id: 'midnight', name: 'Medianoche', color: '#0b1020' },
    { id: 'wine', name: 'Vino', color: '#140a0f' },
];

/** Paleta de fondos: tonos oscuros curados + opción de color libre. */
const BG_PALETTE: string[] = [
    '#050505', '#0a0a0a', '#111111', '#1a1a1a',
    '#0b1020', '#0d1b2a', '#101d24', '#0f1f1a',
    '#1a0f1e', '#140a0f', '#1c1408', '#0d1117',
    '#16121f', '#0a1420', '#1f130f', '#0c0c14',
];

const CALL_STYLES: { id: CallStyleId; name: string; desc: string }[] = [
    { id: 'orb', name: 'Orbe', desc: 'Esfera de vidrio con anillo de energía' },
    { id: 'bars', name: 'Barras', desc: 'Ecualizador minimalista con brillo' },
    { id: 'wave', name: 'Onda', desc: 'Cintas de audio con degradado' },
    { id: 'lines', name: 'Átomos', desc: 'Partículas en órbitas concéntricas' },
    { id: 'holo', name: 'Nebulosa', desc: 'Nubes de color reactivas al audio' },
];

const inputCls =
    'w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors';

const Section: React.FC<{ icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }> = ({ icon, title, desc, children }) => (
    <section className="glass-panel border border-white/5 p-5">
        <header className="flex items-center gap-2 mb-4">
            <span className="text-[rgb(var(--accent))]">{icon}</span>
            <div>
                <h2 className="text-sm font-semibold text-white">{title}</h2>
                {desc && <p className="text-xs text-neutral-500 mt-0.5">{desc}</p>}
            </div>
        </header>
        {children}
    </section>
);

/**
 * Modulo "Apariencia y Temas": nombre del agente (con boton aplicar), acento,
 * fondo global, tipografia, estilo de llamada, biblioteca de avatares, voz TTS,
 * clonacion de voz y fondo del chat. Todo se aplica al instante y se guarda.
 */
export const AppearanceModule: React.FC = () => {
    const { state, dispatch } = useApp();
    const accent = state.accentId === 'custom'
        ? accentFromHex(state.accentCustom ?? '#ffffff')
        : getAccent(state.accentId);
    const font = getFont(state.fontId);

    // Nombre del agente: se edita en borrador y se aplica con el boton.
    const [nameDraft, setNameDraft] = useState(state.agentName);
    const nameDirty = nameDraft.trim() !== state.agentName;

    const [avatarName, setAvatarName] = useState('');
    const [recording, setRecording] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [autostart, setAutostart] = useState(false);

    useEffect(() => {
        let on = true;
        window.joyai?.appAutostartStatus?.().then((r) => { if (on) setAutostart(!!r.enabled); }).catch(() => {});
        return () => { on = false; };
    }, []);

    const toggleAutostart = async (enabled: boolean) => {
        const r = await window.joyai?.appAutostart?.(enabled).catch(() => null);
        if (r?.ok) setAutostart(!!r.enabled);
    };

    const applyAgentName = () => {
        const v = nameDraft.trim();
        if (v) dispatch({ type: 'set-agent-name', name: v.slice(0, 24) });
    };

    const uploadImage = async (setter: (d: string | null) => void) => {
        const file = (await pickFile('image/*')) as File | null;
        if (!file) return;
        setter(await pickImageDataUrl(file));
    };

    const addAvatar = async () => {
        const file = (await pickFile('image/*')) as File | null;
        if (!file) return;
        const dataUrl = await pickImageDataUrl(file, 800);
        const name = avatarName.trim() || `Avatar ${state.avatars.length + 1}`;
        dispatch({ type: 'add-avatar', avatar: { id: `av-${Date.now()}`, name, dataUrl } });
        setAvatarName('');
    };

    const previewVoice = async (file: string) => {
        setSpeaking(true);
        await speakLocal(`Hola, soy ${state.agentName}, tu agente de IA.`, file).catch(() => {});
        setSpeaking(false);
    };

    /** Guarda la muestra también en disco local (userData) para el motor de clonación. */
    const persistCloneSample = async (dataUrl: string, ext: string, sample: { name: string; kind: 'record' | 'file'; dataUrl: string }) => {
        const save = window.joyai?.speechCloneSampleSave;
        if (!save) return;
        const b64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
        const r = await save({ ext, dataBase64: b64 }).catch(() => null);
        if (r?.ok && r.path) {
            dispatch({ type: 'set-clone-sample', sample: { ...sample, path: r.path } });
        }
    };

    const recordCloneSample = async () => {
        if (recording) {
            setRecording(false);
            const blob = await stopMicRecording().catch(() => null);
            if (blob && blob.size > 0) {
                const ext = blob.type.includes('ogg') ? '.ogg' : '.webm';
                const dataUrl = await fileToDataUrl(new File([blob], `muestra${ext}`, { type: blob.type }));
                const sample = { name: 'Muestra grabada', kind: 'record' as const, dataUrl };
                dispatch({ type: 'set-clone-sample', sample });
                void persistCloneSample(dataUrl, ext, sample);
            }
        } else {
            setRecording(true);
            await startMicRecording().catch(() => setRecording(false));
        }
    };

    const uploadCloneSample = async () => {
        const file = (await pickFile('audio/*')) as File | null;
        if (!file) return;
        const dataUrl = await fileToDataUrl(file);
        const sample = { name: file.name, kind: 'file' as const, dataUrl };
        dispatch({ type: 'set-clone-sample', sample });
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase() || '.wav';
        void persistCloneSample(dataUrl, ext, sample);
    };

    const resetAll = () => {
        dispatch({ type: 'set-accent', accentId: DEFAULT_ACCENT });
        dispatch({ type: 'set-accent-custom', hex: null });
        dispatch({ type: 'set-font', fontId: DEFAULT_FONT });
        dispatch({ type: 'set-bg-preset', preset: 'graphite' });
        dispatch({ type: 'set-bg-custom', hex: null });
        dispatch({ type: 'set-bg-image', dataUrl: null });
        dispatch({ type: 'set-chat-bg-image', dataUrl: null });
        dispatch({ type: 'set-call-style', style: 'orb' });
    };

    return (
        <div className="flex flex-col gap-6 max-w-3xl">
            {/* ── Nombre del agente ─────────────────────────────────────── */}
            <Section icon={<User size={15} />} title="Nombre del agente"
                desc="Es el nombre con el que te saluda y firma en chat, llamada y avatar.">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={nameDraft}
                        maxLength={24}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyAgentName(); }}
                        placeholder="CaRo"
                        className={`${inputCls} max-w-xs`}
                    />
                    <button
                        type="button"
                        onClick={applyAgentName}
                        disabled={!nameDirty || !nameDraft.trim()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Check size={13} />
                        Aplicar
                    </button>
                </div>
            </Section>

            {/* ── Color de acento ───────────────────────────────────────── */}
            <Section icon={<Palette size={15} />} title="Color de acento"
                desc="Se aplica a toda la interfaz: botones, iconos, bordes y detalles.">
                <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="color"
                            value={accent.hex}
                            onChange={(e) => dispatch({ type: 'set-accent-custom', hex: e.target.value })}
                            className="w-12 h-12 rounded-xl cursor-pointer bg-transparent border border-white/15 p-1"
                            aria-label="Elegir color de acento"
                        />
                        <span className="text-xs text-neutral-400">Color libre</span>
                    </label>
                    <div className="h-8 w-px bg-white/10 hidden sm:block" />
                    <div className="flex flex-wrap gap-2">
                        {ACCENTS.map((c) => {
                            const active = state.accentId === c.id;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => dispatch({ type: 'set-accent', accentId: c.id })}
                                    aria-pressed={active}
                                    title={c.name}
                                    className={`w-8 h-8 rounded-full border transition-transform duration-200 hover:scale-110 ${
                                        active ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#0a0a0a] scale-110' : 'border-white/15'
                                    }`}
                                    style={{ backgroundColor: c.hex }}
                                />
                            );
                        })}
                    </div>
                </div>
            </Section>

            {/* ── Fondo del tema ────────────────────────────────────────── */}
            <Section icon={<ImageIcon size={15} />} title="Fondo del tema"
                desc="Color o imagen de fondo de toda la aplicación.">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    {BG_PRESETS.map((p) => {
                        const active = state.bgPreset === p.id;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => dispatch({ type: 'set-bg-preset', preset: p.id })}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition ${
                                    active ? 'border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.12)] text-white' : 'border-white/10 text-neutral-400 hover:text-neutral-200'
                                }`}
                            >
                                <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: p.color }} />
                                {p.name}
                            </button>
                        );
                    })}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="color"
                            value={state.bgCustom ?? '#0a0a0a'}
                            onChange={(e) => { dispatch({ type: 'set-bg-preset', preset: 'custom' }); dispatch({ type: 'set-bg-custom', hex: e.target.value }); }}
                            className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-white/15 p-0.5"
                            aria-label="Color de fondo personalizado"
                        />
                        <span className="text-xs text-neutral-400">Color libre</span>
                    </label>
                </div>
                {/* Paleta de colores de fondo */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {BG_PALETTE.map((hex) => {
                        const active = state.bgPreset === 'custom' && state.bgCustom?.toLowerCase() === hex;
                        return (
                            <button
                                key={hex}
                                type="button"
                                title={hex}
                                onClick={() => { dispatch({ type: 'set-bg-preset', preset: 'custom' }); dispatch({ type: 'set-bg-custom', hex }); }}
                                className={`w-8 h-8 rounded-lg border transition-transform hover:scale-110 ${
                                    active ? 'border-[rgb(var(--accent))] ring-2 ring-[rgb(var(--accent)/0.4)]' : 'border-white/15'
                                }`}
                                style={{ backgroundColor: hex }}
                                aria-label={`Fondo ${hex}`}
                            />
                        );
                    })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void uploadImage((d) => dispatch({ type: 'set-bg-image', dataUrl: d }))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 hover:text-white transition-colors"
                    >
                        <Upload size={12} />
                        {state.bgImage ? 'Cambiar imagen de fondo' : 'Subir imagen de fondo'}
                    </button>
                    {state.bgImage && (
                        <button
                            type="button"
                            onClick={() => dispatch({ type: 'set-bg-image', dataUrl: null })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-300/80 border border-red-400/20 hover:border-red-400/40 transition-colors"
                        >
                            <Trash2 size={12} />
                            Quitar imagen
                        </button>
                    )}
                </div>
            </Section>

            {/* ── Tipografía ────────────────────────────────────────────── */}
            <Section icon={<Type size={15} />} title="Tipografía"
                desc="Fuente de toda la interfaz. El cambio es inmediato.">
                <select
                    value={state.fontId}
                    onChange={(e) => dispatch({ type: 'set-font', fontId: e.target.value })}
                    className={`${inputCls} max-w-md`}
                >
                    {FONTS.map((f) => (
                        <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
                            {f.name}{f.hint ? ` — ${f.hint}` : ''}
                        </option>
                    ))}
                </select>
                <div className="mt-4 rounded-xl border border-white/5 bg-[#0f0f0f]/80 p-4">
                    <p className="text-2xl text-white leading-tight" style={{ fontFamily: font.family }}>
                        Hola, soy {state.agentName}, tu agente de IA.
                    </p>
                    <p className="text-sm text-neutral-400 mt-1" style={{ fontFamily: font.family }}>
                        {font.name} · 0123456789 · ¡Hola CaRo!
                    </p>
                </div>
            </Section>

            {/* ── Estilo de llamada ─────────────────────────────────────── */}
            <Section icon={<Phone size={15} />} title="Visualizador de llamada"
                desc="Elige cómo se ve la pantalla de Llamada a pantalla completa.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CALL_STYLES.map((s) => {
                        const active = state.callStyle === s.id;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => dispatch({ type: 'set-call-style', style: s.id })}
                                className={`text-left px-3.5 py-2.5 rounded-xl border transition ${
                                    active
                                        ? 'border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.12)]'
                                        : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                                }`}
                            >
                                <p className="text-xs font-semibold text-white">{s.name}</p>
                                <p className="text-[11px] text-neutral-500 mt-0.5">{s.desc}</p>
                            </button>
                        );
                    })}
                </div>
            </Section>

            {/* ── Avatar ────────────────────────────────────────────────── */}
            <Section icon={<User size={15} />} title="Avatares"
                desc="Sube imágenes para usarlas como avatar en la pantalla Avatar.">
                <div className="flex items-center gap-2 mb-3">
                    <input
                        type="text"
                        value={avatarName}
                        onChange={(e) => setAvatarName(e.target.value)}
                        placeholder="Nombre del avatar (ej. CaRo niño)"
                        maxLength={30}
                        className={`${inputCls} max-w-xs`}
                    />
                    <button
                        type="button"
                        onClick={() => void addAvatar()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] hover:opacity-90 transition-opacity"
                    >
                        <Plus size={13} />
                        Agregar avatar
                    </button>
                </div>
                {state.avatars.length === 0 ? (
                    <p className="text-xs text-neutral-500">Aún no hay avatares. Agrega imágenes con nombre para elegirlas en Avatar.</p>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {state.avatars.map((a) => {
                            const active = state.avatarId === a.id;
                            return (
                                <div
                                    key={a.id}
                                    className={`relative rounded-xl border overflow-hidden group ${
                                        active ? 'border-[rgb(var(--accent)/0.7)] ring-1 ring-[rgb(var(--accent)/0.4)]' : 'border-white/10'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => dispatch({ type: 'select-avatar', id: a.id })}
                                        className="block w-full"
                                        title={a.name}
                                    >
                                        <img src={a.dataUrl} alt={a.name} className="w-full aspect-square object-cover" />
                                    </button>
                                    <p className="px-2 py-1 text-[10px] text-neutral-400 truncate bg-black/60">{a.name}</p>
                                    <button
                                        type="button"
                                        onClick={() => dispatch({ type: 'remove-avatar', id: a.id })}
                                        className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                        aria-label={`Eliminar ${a.name}`}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Fondo del avatar: color o imagen */}
                <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="text-[11px] font-semibold text-neutral-400 mb-2">Fondo del avatar</p>
                    <div className="flex items-center gap-2 flex-wrap">
                        {BG_PALETTE.slice(0, 8).map((c) => (
                            <button key={c} type="button" title={c}
                                onClick={() => dispatch({ type: 'set-avatar-bg', bg: c })}
                                className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 ${state.avatarBg === c ? 'border-white scale-110' : 'border-white/10'}`}
                                style={{ background: c }} />
                        ))}
                        <label className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/25 cursor-pointer">
                            Imagen…
                            <input type="file" accept="image/*" className="hidden"
                                onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    const d = await fileToDataUrl(f).catch(() => null);
                                    if (d) dispatch({ type: 'set-avatar-bg', bg: d });
                                    e.target.value = '';
                                }} />
                        </label>
                        {state.avatarBg && !state.avatarBg.startsWith('scene:') && (
                            <button type="button" onClick={() => dispatch({ type: 'set-avatar-bg', bg: null })}
                                className="px-3 py-1.5 rounded-lg text-[11px] text-neutral-400 border border-white/10 hover:text-white">Quitar</button>
                        )}
                    </div>

                    {/* Escenas precargadas con variante día/noche automática */}
                    <div className="mt-3 flex flex-col gap-2">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold">Escenas (día/noche automático)</p>
                        <div className="grid grid-cols-3 gap-2">
                            {AVATAR_SCENES.map((s) => {
                                const active = state.avatarBg?.startsWith(`scene:${s.id}:`);
                                const preview = sceneSvg(s.id, isDaytime() ? 'day' : 'night');
                                return (
                                    <button key={s.id} type="button" title={s.desc}
                                        onClick={() => dispatch({ type: 'set-avatar-bg', bg: `scene:${s.id}:auto` })}
                                        className={`rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.03] ${active ? 'border-white scale-[1.03]' : 'border-white/10'}`}>
                                        <img src={preview} alt={s.label} className="w-full h-16 object-cover" />
                                        <p className="text-[10px] text-neutral-300 py-1 bg-black/40">{s.label}</p>
                                    </button>
                                );
                            })}
                        </div>
                        {state.avatarBg?.startsWith('scene:') && (
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] text-neutral-500">Modo:</p>
                                {(['auto', 'day', 'night'] as const).map((m) => {
                                    const [, sid] = (state.avatarBg ?? '').split(':');
                                    const active = state.avatarBg === `scene:${sid}:${m}`;
                                    return (
                                        <button key={m} type="button"
                                            onClick={() => dispatch({ type: 'set-avatar-bg', bg: `scene:${sid}:${m}` })}
                                            className={`px-2.5 py-1 rounded-md text-[10px] font-medium border transition-colors ${active ? 'border-white/40 text-white bg-white/10' : 'border-white/10 text-neutral-400 hover:text-white'}`}>
                                            {m === 'auto' ? 'Auto (según hora)' : m === 'day' ? 'Siempre día' : 'Siempre noche'}
                                        </button>
                                    );
                                })}
                                <button type="button" onClick={() => dispatch({ type: 'set-avatar-bg', bg: null })}
                                    className="px-2.5 py-1 rounded-md text-[10px] text-neutral-500 hover:text-white">Quitar</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Voz propia del avatar (opcional; vacío = voz general) */}
                <div className="mt-3">
                    <p className="text-[11px] font-semibold text-neutral-400 mb-2">Voz del avatar</p>
                    <select
                        value={state.avatarVoiceId}
                        onChange={(e) => dispatch({ type: 'set-avatar-voice', id: e.target.value })}
                        className={`${inputCls} max-w-xs`}
                    >
                        <option value="">Igual que la voz del agente</option>
                        {[...KOKORO_VOICES, ...PIPER_VOICES].map((v) => (
                            <option key={`av-${v.file}#p${v.pitch ?? ''}`} value={v.pitch ? `${v.file}#p${v.pitch}` : v.file}>
                                {v.name} · {v.locale}
                            </option>
                        ))}
                        {state.cloneSample && <option value="clone:">Mi voz (clonada)</option>}
                    </select>
                </div>
            </Section>

            {/* ── Voz ───────────────────────────────────────────────────── */}
            <Section icon={<AudioLines size={15} />} title="Voz del agente"
                desc="Voz local (Piper) para que el agente hable. También puedes registrar una muestra para clonar tu voz.">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <select
                        value={state.ttsVoiceId}
                        onChange={(e) => dispatch({ type: 'set-tts-voice', id: e.target.value })}
                        className={`${inputCls} max-w-xs`}
                    >
                        {[...KOKORO_VOICES, ...PIPER_VOICES].map((v) => (
                            <option key={`${v.file}#p${v.pitch ?? ''}`} value={v.pitch ? `${v.file}#p${v.pitch}` : v.file}>
                                {v.name} · {v.locale} · {v.gender === 'female' ? 'Mujer' : v.gender === 'male' ? 'Hombre' : v.gender === 'child' ? 'Niño' : 'Niña'}{v.pitch ? ' · aguda' : ''}
                            </option>
                        ))}
                        {state.cloneSample && (
                            <option value="clone:">Mi voz (clonada) · local · OpenVoice</option>
                        )}
                    </select>
                    <button
                        type="button"
                        onClick={() => void previewVoice(state.ttsVoiceId)}
                        disabled={speaking}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-neutral-300 border border-white/10 hover:border-white/20 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <Play size={12} />
                        {speaking ? 'Hablando…' : 'Escuchar'}
                    </button>
                </div>

                <div className="border-t border-white/5 pt-4">
                    <p className="text-xs font-semibold text-neutral-200 mb-1">Clonación de voz</p>
                    <p className="text-[11px] text-neutral-500 mb-3">
                        Graba o sube una muestra de audio (3–10 s de voz clara). El motor de clonación (OpenVoice V2,
                        licencia MIT) corre 100% en este equipo; la muestra nunca sale de tu PC.
                        <strong className="text-neutral-400"> Solo usa voces de personas que te hayan dado su consentimiento</strong>{' '}
                        y declara que el audio es generado por IA cuando lo compartas.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void recordCloneSample()}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                                recording
                                    ? 'border-red-400/50 bg-red-500/10 text-red-300'
                                    : 'border-white/10 text-neutral-300 hover:border-white/20 hover:text-white'
                            }`}
                        >
                            <Mic size={12} />
                            {recording ? 'Detener grabación' : 'Grabar muestra'}
                        </button>
                        <button
                            type="button"
                            onClick={() => void uploadCloneSample()}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-neutral-300 border border-white/10 hover:border-white/20 hover:text-white transition-colors"
                        >
                            <Upload size={12} />
                            Subir archivo de audio
                        </button>
                        {state.cloneSample && (
                            <span className="text-[11px] text-emerald-400">
                                ✓ {state.cloneSample.name}
                            </span>
                        )}
                    </div>
                    {state.cloneSample && (
                        <audio controls src={state.cloneSample.dataUrl} className="mt-3 h-8 w-full max-w-sm" />
                    )}
                </div>

                <div className="border-t border-white/5 pt-4 mt-4">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={state.wakeWordEnabled}
                            onChange={(e) => dispatch({ type: 'set-profile', patch: { wakeWordEnabled: e.target.checked } })}
                            className="w-4 h-4 rounded accent-[rgb(var(--accent))]"
                        />
                        <div>
                            <p className="text-xs font-semibold text-neutral-200">Escucha de activación (wake word)</p>
                            <p className="text-[11px] text-neutral-500">
                                El agente responde cuando escucha su nombre ({state.agentName}) mientras la app está abierta o en la bandeja.
                                Requiere permiso de micrófono y conexión a internet para el reconocimiento.
                            </p>
                        </div>
                    </label>
                    {typeof window !== 'undefined' && window.joyai?.appAutostart && (
                        <label className="flex items-center gap-3 cursor-pointer select-none mt-3">
                            <input
                                type="checkbox"
                                checked={autostart}
                                onChange={(e) => void toggleAutostart(e.target.checked)}
                                className="w-4 h-4 rounded accent-[rgb(var(--accent))]"
                            />
                            <div>
                                <p className="text-xs font-semibold text-neutral-200">Iniciar con el sistema</p>
                                <p className="text-[11px] text-neutral-500">
                                    CaRo Ai arranca con tu sesión de Windows. Al cerrar la ventana queda en la bandeja
                                    y el wake word sigue escuchando; sal desde el menú de la bandeja para salir del todo.
                                </p>
                            </div>
                        </label>
                    )}
                </div>
            </Section>

            {/* ── Fondo del chat ────────────────────────────────────────── */}
            <Section icon={<MessageSquare size={15} />} title="Fondo del chat"
                desc="Imagen de fondo solo para la pantalla de Chat.">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void uploadImage((d) => dispatch({ type: 'set-chat-bg-image', dataUrl: d }))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-300 border border-white/10 hover:border-white/20 hover:text-white transition-colors"
                    >
                        <Upload size={12} />
                        {state.chatBgImage ? 'Cambiar fondo del chat' : 'Subir fondo del chat'}
                    </button>
                    {state.chatBgImage && (
                        <>
                            <img src={state.chatBgImage} alt="Fondo del chat" className="h-10 w-16 rounded-lg object-cover border border-white/10" />
                            <button
                                type="button"
                                onClick={() => dispatch({ type: 'set-chat-bg-image', dataUrl: null })}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-300/80 border border-red-400/20 hover:border-red-400/40 transition-colors"
                            >
                                <Trash2 size={12} />
                                Quitar
                            </button>
                        </>
                    )}
                </div>
            </Section>

        </div>
    );
};
