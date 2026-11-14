import React, { useState } from 'react';

/** Piezas UI compartidas para las pantallas de módulos y pestañas. */

export const DemoBadge: React.FC = () => (
    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border border-amber-400/40 text-amber-300 bg-amber-400/10">
        demo
    </span>
);

interface SectionProps {
    title: string;
    desc?: string;
    right?: React.ReactNode;
    demo?: boolean;
    children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, desc, right, demo, children }) => (
    <section className="glass-panel border border-white/5 p-5">
        <header className="flex items-start justify-between gap-3 mb-4">
            <div>
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">{title}</h2>
                    {demo && <DemoBadge />}
                </div>
                {desc && <p className="text-xs text-neutral-500 mt-0.5">{desc}</p>}
            </div>
            {right}
        </header>
        {children}
    </section>
);

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <div className={`rounded-xl border border-white/5 bg-white/[0.02] p-4 ${className}`}>{children}</div>
);

interface ToggleProps {
    /** Modo controlado: si se pasa, el estado lo decide el padre. */
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (v: boolean) => void;
    label?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, defaultChecked = true, onChange }) => {
    const [inner, setInner] = useState(defaultChecked);
    const on = checked ?? inner;
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => {
                const next = !on;
                if (checked === undefined) setInner(next);
                onChange?.(next);
            }}
            className={`relative w-10 h-5.5 h-[22px] rounded-full transition-colors shrink-0 ${on ? 'bg-[rgb(var(--accent))]' : 'bg-white/15'}`}
        >
            <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-[rgb(var(--accent-contrast))] transition-all ${on ? 'left-[22px]' : 'left-[3px]'}`} />
        </button>
    );
};

export const Metric: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
    <Card className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</span>
        <span className="text-lg font-bold text-white">{value}</span>
        {sub && <span className="text-[11px] text-neutral-500">{sub}</span>}
    </Card>
);

export const Bar: React.FC<{ pct: number; label?: string }> = ({ pct, label }) => (
    <div className="flex flex-col gap-1.5">
        {label && <div className="flex justify-between text-[11px] text-neutral-400"><span>{label}</span><span>{pct}%</span></div>}
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-[rgb(var(--accent))]" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
    </div>
);

export const Pill: React.FC<{ children: React.ReactNode; active?: boolean }> = ({ children, active }) => (
    <span className={`text-[10px] font-semibold px-2 py-1 rounded-md border ${active ? 'bg-[rgb(var(--accent)/0.15)] text-[rgb(var(--accent))] border-[rgb(var(--accent)/0.3)]' : 'bg-white/[0.03] text-neutral-400 border-white/10'}`}>
        {children}
    </span>
);
