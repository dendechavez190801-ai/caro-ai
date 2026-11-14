import React, { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Battery, Monitor, RefreshCw } from 'lucide-react';
import { Section, Card, Metric, Bar } from '../../components/ui';
import { getSystemInfo, SystemInfo } from '../../system';

function fmtGB(n: number): string {
    return n > 0 ? `${n} GB` : '—';
}

export const HardwareModule: React.FC = () => {
    const [info, setInfo] = useState<SystemInfo | null>(null);

    useEffect(() => {
        let on = true;
        const load = () => getSystemInfo().then((s) => { if (on) setInfo(s); }).catch(() => {});
        void load();
        // Telemetría en vivo cada 4 s (RAM/disco/cpu de la app cambian).
        const t = setInterval(load, 4000);
        return () => { on = false; clearInterval(t); };
    }, []);

    const ramPct = info && info.ramTotalGB > 0 ? Math.round((info.ramUsedGB / info.ramTotalGB) * 100) : 0;
    const diskPct = info && info.diskTotalGB > 0 ? Math.round(((info.diskTotalGB - info.diskFreeGB) / info.diskTotalGB) * 100) : 0;
    const cpuShort = info?.cpuModel ? info.cpuModel.split(' ').slice(0, 4).join(' ') : '—';
    const gpuShort = info?.gpuRenderer ? info.gpuRenderer.slice(0, 42) : '—';
    const batt = info?.batteryLevel != null ? `${Math.round(info.batteryLevel * 100)}%` : (info?.isOnBattery != null ? (info.isOnBattery ? 'En batería' : 'AC') : '—');

    return (
        <div className="flex flex-col gap-6">
            <Section title="Diagnóstico de Hardware" desc="Telemetría real del equipo (SO, CPU, RAM, GPU, disco, batería y pantalla).">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <Metric label="CPU" value={cpuShort} sub={`${info?.cpuCores ?? '—'} hilos${info?.appCpuPercent != null ? ` · app ${info.appCpuPercent.toFixed(0)}%` : ''}`} />
                    <Metric label="RAM" value={info ? `${info.ramUsedGB} / ${info.ramTotalGB} GB` : '—'} sub={info ? `${ramPct}% usada` : ''} />
                    <Metric label="GPU" value={gpuShort} sub={info?.gpuVendor ?? ''} />
                    <Metric label="Disco" value={info ? `${info.diskFreeGB} GB libre` : '—'} sub={info ? `de ${fmtGB(info.diskTotalGB)}` : ''} />
                    <Metric label="Batería" value={batt} sub={info?.isCharging ? 'Cargando' : info?.isOnBattery === false ? 'Conectada' : ''} />
                    <Metric label="Pantalla" value={info ? `${info.screenWidth} × ${info.screenHeight}` : '—'} sub={info ? `${info.pixelRatio}x` : ''} />
                </div>
            </Section>

            <Section title="Uso de recursos" desc="RAM y disco en tiempo real; CPU/GPU instantáneo no lo expone el SO/navegador.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <MemoryStick size={16} className="text-[rgb(var(--accent))]" />
                            <span className="text-sm font-semibold text-white">RAM</span>
                            <span className="ml-auto text-[11px] text-neutral-500">{ramPct}%</span>
                        </div>
                        <Bar pct={ramPct} />
                    </Card>
                    <Card className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <HardDrive size={16} className="text-[rgb(var(--accent))]" />
                            <span className="text-sm font-semibold text-white">Disco</span>
                            <span className="ml-auto text-[11px] text-neutral-500">{diskPct}% usado</span>
                        </div>
                        <Bar pct={diskPct} />
                    </Card>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] text-neutral-500 flex items-center gap-1.5"><Monitor size={12} /> <Battery size={12} /> {info ? `Datos ${info.isElectron ? 'reales de Electron' : 'web (estimados)'} · ${info.osName} · se actualiza solo` : 'Leyendo hardware…'}</p>
                    <button type="button" onClick={() => getSystemInfo().then(setInfo).catch(() => {})} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors">
                        <RefreshCw size={13} /> Actualizar
                    </button>
                </div>
            </Section>
        </div>
    );
};
