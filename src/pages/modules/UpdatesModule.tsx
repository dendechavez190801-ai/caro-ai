import React, { useEffect, useState } from 'react';
import { RefreshCw, FolderOpen, Rocket, Undo2, Download, Loader2, ShieldCheck, AlertTriangle, FolderSearch, FileCode2, X } from 'lucide-react';
import { Section, Card, Pill } from '../../components/ui';
import type { UpdateRecord } from '../../system';

interface UpdateStatus {
    projectDir: string | null;
    isGit: boolean;
    versions: UpdateRecord[];
}

/**
 * Actualizaciones (A18): self-update seguro del código fuente.
 * El agente propone archivos completos → el main valida rutas (sin .git,
 * node_modules, secretos), topes de tamaño y sintaxis JS → staging →
 * apply copia con backup + commit git → rollback restaura.
 * Nunca toca el paquete instalado (app.asar): solo la carpeta del proyecto
 * que el usuario elige. Pensado para desarrollo/mejora del propio CaRo Ai.
 */
export const UpdatesModule: React.FC = () => {
    const joyai = window.joyai;
    const isElectron = !!joyai?.updateStatus;
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [patchJson, setPatchJson] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState('');
    const [staged, setStaged] = useState<{ id: string; files: string[] } | null>(null);
    const [view, setView] = useState<{ id: string; description?: string; files: { path: string; size: number; truncated: boolean; content: string | null }[] } | null>(null);
    const [viewFile, setViewFile] = useState<string | null>(null);
    const [appInfo, setAppInfo] = useState<{ version: string; packaged: boolean } | null>(null);
    const [updateEvent, setUpdateEvent] = useState<string>('');

    useEffect(() => {
        joyai?.appVersion?.().then(setAppInfo).catch(() => {});
        return joyai?.onUpdateEvent?.((d) => {
            if (d.type === 'available') setUpdateEvent(`Nueva versión ${d.version} — descargando automáticamente…`);
            else if (d.type === 'none') setUpdateEvent('La app está actualizada.');
            else if (d.type === 'downloaded') setUpdateEvent(`v${d.version} descargada — pulsa "Instalar y reiniciar"`);
            else if (d.type === 'progress') setUpdateEvent(`Descargando… ${d.percent ?? 0}%`);
            else if (d.type === 'error') setUpdateEvent(`Error de actualización: ${d.message ?? ''}`);
            else if (d.type === 'checking') setUpdateEvent('Buscando actualizaciones…');
        });
    }, [joyai]);

    const refresh = async () => {
        if (!isElectron) return;
        const s = await joyai!.updateStatus!().catch(() => null);
        setStatus(s);
    };

    useEffect(() => { void refresh(); }, [isElectron]); // eslint-disable-line react-hooks/exhaustive-deps

    const pickProject = async () => {
        setMsg('');
        const r = await joyai!.updatePickProject!().catch(() => ({ ok: false, path: null }));
        if (r.ok) { setMsg(`Proyecto: ${r.path}`); void refresh(); }
    };

    const submit = async () => {
        setBusy('submit'); setMsg(''); setStaged(null);
        let parsed: { description?: string; files?: { path: string; content: string }[] };
        try {
            parsed = JSON.parse(patchJson);
        } catch {
            setBusy(null);
            setMsg('El parche no es JSON válido. Formato: {"description":"...","files":[{"path":"src/x.ts","content":"..."}]}');
            return;
        }
        const r = await joyai!.updateSubmit!({ description: parsed.description, files: parsed.files ?? [] }).catch((e) => ({ ok: false as const, error: String(e) }));
        setBusy(null);
        if (r.ok && r.id) {
            setStaged({ id: r.id, files: r.files ?? [] });
            setMsg(`✓ Parche validado y en staging (${r.files?.length ?? 0} archivos). Revisa y aplica.`);
        } else {
            setMsg(`Error de validación: ${r.error ?? 'desconocido'}`);
        }
    };

    const apply = async () => {
        if (!staged) return;
        setBusy('apply'); setMsg('');
        const r = await joyai!.updateApply!({ id: staged.id }).catch((e) => ({ ok: false as const, error: String(e) }));
        setBusy(null);
        setMsg(r.ok ? `✓ Aplicado${r.record?.commit ? ` (commit ${String(r.record.commit).slice(0, 8)})` : ' (sin git)'}. Rollback disponible.` : `Error: ${r.error ?? 'falló'}`);
        setStaged(null);
        void refresh();
    };

    const rollback = async (id?: string) => {
        setBusy('rollback'); setMsg('');
        const r = await joyai!.updateRollback!({ id }).catch((e) => ({ ok: false as const, error: String(e) }));
        setBusy(null);
        setMsg(r.ok ? `✓ Revertido: ${r.rolledBack}` : `Error: ${r.error ?? 'falló'}`);
        void refresh();
    };

    const exportRec = async (id?: string) => {
        const r = await joyai!.updateExport!({ id }).catch(() => ({ ok: false as const }));
        if (r.ok) setMsg(`✓ Exportado: ${r.path}`);
    };

    const openUpdateDir = async (id: string) => {
        await joyai!.updateOpenDir!({ id }).catch(() => {});
    };

    const viewUpdate = async (id: string) => {
        const r = await joyai!.updateView!({ id }).catch(() => null);
        if (r?.ok && r.files) {
            setView({ id, description: r.description, files: r.files });
            setViewFile(r.files[0]?.path ?? null);
        } else {
            setMsg('No se pudo abrir el visor: el staging de esa actualización ya no existe.');
        }
    };

    const checkAppUpdate = async () => {
        setUpdateEvent('Buscando…');
        const r = await joyai!.appUpdateCheck!().catch((e) => ({ ok: false as const, error: String(e) }));
        if (!r.ok) setUpdateEvent(`No se pudo verificar: ${r.error ?? 'sin feed de releases configurado (pendiente B6)'}`);
    };
    const downloadAppUpdate = async () => {
        setUpdateEvent('Descargando…');
        const r = await joyai!.appUpdateDownload!().catch((e) => ({ ok: false as const, error: String(e) }));
        if (!r.ok) setUpdateEvent(`Error: ${r.error ?? ''}`);
    };
    const installAppUpdate = async () => {
        await joyai!.appUpdateInstall!().catch(() => {});
    };

    if (!isElectron) {
        return (
            <Section title="Actualizaciones" desc="Self-update del código fuente">
                <Card className="text-center py-10">
                    <RefreshCw size={22} className="text-neutral-600 mx-auto mb-3" />
                    <p className="text-sm text-neutral-400">Requiere la app de escritorio (Electron).</p>
                </Card>
            </Section>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Versión de la app"
                desc="Actualizaciones del programa instalado (electron-updater). Solo funciona en el instalador; el feed se configura al publicar releases (B6)."
                right={appInfo && <Pill active>{`v${appInfo.version}${appInfo.packaged ? '' : ' · dev'}`}</Pill>}
            >
                <Card className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex gap-2 shrink-0">
                        <button type="button" onClick={() => void checkAppUpdate()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-neutral-200 bg-white/10 hover:bg-white/15 transition-colors">
                            <RefreshCw size={12} /> Verificar
                        </button>
                        <button type="button" onClick={() => void downloadAppUpdate()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-neutral-200 bg-white/10 hover:bg-white/15 transition-colors">
                            <Download size={12} /> Descargar
                        </button>
                        <button type="button" onClick={() => void installAppUpdate()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-black bg-emerald-400 hover:bg-emerald-300 transition-colors">
                            <Rocket size={12} /> Instalar y reiniciar
                        </button>
                    </div>
                    <p className="flex-1 text-[11px] text-neutral-500 min-w-0">{updateEvent || 'Sin verificaciones aún. La app instalada revisa sola cada arranque.'}</p>
                </Card>
            </Section>

            <Section
                title="Actualizaciones seguras"
                desc="El agente propone cambios como archivos completos. Se validan (rutas, secretos, tamaño, sintaxis), se aplican con backup y commit git, y se pueden revertir. Nunca modifica el paquete instalado."
                right={status && <Pill active={!!status.projectDir}>{status.projectDir ? (status.isGit ? 'Git ✓' : 'Carpeta') : 'Sin proyecto'}</Pill>}
            >
                {/* Proyecto */}
                <Card className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <button type="button" onClick={() => void pickProject()} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity shrink-0">
                        <FolderOpen size={15} /> Elegir carpeta del proyecto
                    </button>
                    <div className="flex-1 min-w-0">
                        {status?.projectDir ? (
                            <p className="text-sm text-white font-mono truncate">{status.projectDir}</p>
                        ) : (
                            <p className="text-xs text-neutral-500">Apunta a la carpeta con el código fuente de CaRo Ai (la que tiene package.json).</p>
                        )}
                    </div>
                </Card>

                {/* Nuevo parche */}
                <Card className="flex flex-col gap-3">
                    <p className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-[rgb(var(--accent))]" /> Proponer parche (JSON)
                    </p>
                    <textarea
                        value={patchJson}
                        onChange={(e) => setPatchJson(e.target.value)}
                        placeholder={'{\n  "description": "qué cambia y por qué",\n  "files": [\n    { "path": "src/archivo.ts", "content": "...contenido completo..." }\n  ]\n}'}
                        rows={8}
                        spellCheck={false}
                        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[11px] font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-[rgb(var(--accent)/0.5)] resize-y"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => void submit()} disabled={!!busy || !patchJson.trim()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 disabled:opacity-40 transition-opacity">
                            {busy === 'submit' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Validar parche
                        </button>
                        {staged && (
                            <button type="button" onClick={() => void apply()} disabled={!!busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-black bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 transition-colors">
                                {busy === 'apply' ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />} Aplicar {staged.files.length} archivo(s)
                            </button>
                        )}
                    </div>
                    {staged && (
                        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2">
                            <p className="text-[11px] text-emerald-300 font-mono mb-1">Staging {staged.id} — archivos:</p>
                            {staged.files.map((f) => <p key={f} className="text-[10px] text-neutral-400 font-mono truncate">· {f}</p>)}
                        </div>
                    )}
                </Card>

                {/* Historial */}
                <Card className="flex flex-col gap-3">
                    <p className="text-xs font-semibold text-neutral-300">Historial de actualizaciones</p>
                    {status && status.versions.length === 0 && (
                        <p className="text-[11px] text-neutral-600">Aún no hay actualizaciones aplicadas.</p>
                    )}
                    <div className="flex flex-col gap-2">
                        {status?.versions.map((v) => (
                            <div key={v.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white font-mono">{v.id} {v.rolledBackAt && <span className="text-amber-400">(revertida)</span>}</p>
                                    <p className="text-[10px] text-neutral-500 truncate">{v.description || 'sin descripción'} · {v.appliedAt?.slice(0, 16).replace('T', ' ')} · {v.files.length} archivos {v.commit ? `· ${String(v.commit).slice(0, 8)}` : ''}</p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button type="button" onClick={() => void viewUpdate(v.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold text-neutral-300 bg-white/5 hover:bg-white/10 transition-colors" title="Ver archivos del parche">
                                        <FileCode2 size={11} /> Ver
                                    </button>
                                    <button type="button" onClick={() => void openUpdateDir(v.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold text-neutral-300 bg-white/5 hover:bg-white/10 transition-colors" title="Abrir carpeta de la actualización">
                                        <FolderSearch size={11} /> Carpeta
                                    </button>
                                    <button type="button" onClick={() => void exportRec(v.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold text-neutral-300 bg-white/5 hover:bg-white/10 transition-colors" title="Exportar registro JSON">
                                        <Download size={11} /> Exportar
                                    </button>
                                    {!v.rolledBackAt && (
                                        <button type="button" onClick={() => void rollback(v.id)} disabled={!!busy} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 disabled:opacity-40 transition-colors" title="Revertir esta actualización">
                                            <Undo2 size={11} /> Revertir
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    {status && status.versions.length > 0 && (
                        <button type="button" onClick={() => void rollback()} disabled={!!busy} className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-semibold text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 disabled:opacity-40 transition-colors">
                            <Undo2 size={11} /> Revertir la más reciente
                        </button>
                    )}
                </Card>

                {/* Visor de archivos de la actualización */}
                {view && (
                    <Card className="flex flex-col gap-2 border-[rgb(var(--accent)/0.25)]">
                        <div className="flex items-center gap-2">
                            <FileCode2 size={14} className="text-[rgb(var(--accent))]" />
                            <p className="flex-1 text-xs font-semibold text-white font-mono truncate">{view.id}{view.description ? ` — ${view.description}` : ''}</p>
                            <button type="button" onClick={() => setView(null)} className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/5"><X size={13} /></button>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {view.files.map((f) => (
                                <button key={f.path} type="button" onClick={() => setViewFile(f.path)}
                                    className={`px-2 py-1 rounded-md text-[10px] font-mono border transition-colors ${viewFile === f.path ? 'border-[rgb(var(--accent)/0.5)] text-white bg-[rgb(var(--accent)/0.08)]' : 'border-white/10 text-neutral-400 hover:text-white'}`}>
                                    {f.path} <span className="text-neutral-600">({Math.round(f.size / 1024)}KB)</span>
                                </button>
                            ))}
                        </div>
                        {(() => {
                            const f = view.files.find((x) => x.path === viewFile);
                            if (!f) return null;
                            return f.content === null ? (
                                <p className="text-[11px] text-neutral-500 font-mono">{f.truncated ? 'Archivo grande: contenido no cargado (>64KB). Ábrelo desde "Carpeta".' : 'Sin contenido disponible.'}</p>
                            ) : (
                                <pre className="max-h-72 overflow-auto rounded-lg bg-black/40 border border-white/5 p-3 text-[10.5px] font-mono text-neutral-300 whitespace-pre-wrap break-all">{f.content}</pre>
                            );
                        })()}
                    </Card>
                )}

                {msg && <p className="text-[11px] text-[rgb(var(--accent))] font-mono break-all flex items-start gap-1.5"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{msg}</p>}

                <p className="text-[11px] text-neutral-600 flex items-center gap-1.5">
                    <ShieldCheck size={11} /> Límites: rutas solo dentro del proyecto, sin .git/node_modules/secretos, máx. 50 archivos / 256KB c/u / 1MB total, sintaxis JS verificada. En la app empaquetada sin carpeta de proyecto, los parches se exportan para aplicarlos al código fuente.
                </p>
            </Section>
        </div>
    );
};
