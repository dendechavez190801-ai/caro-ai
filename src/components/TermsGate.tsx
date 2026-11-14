import React, { useState } from 'react';
import { Scale, X } from 'lucide-react';
import { useApp } from '../store';

const inputCls =
    'w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-[rgb(var(--accent)/0.5)] transition-colors';

/**
 * Ventana de términos y registro local que aparece al instalar/abrir la app
 * por primera vez. No hay servidor: los datos se guardan solo en este equipo.
 * Se puede posponer ("Ahora no") y vuelve a aparecer en el siguiente arranque.
 */
export const TermsGate: React.FC = () => {
    const { state, dispatch } = useApp();
    const [hidden, setHidden] = useState(false);
    const [name, setName] = useState(state.userName);
    const [email, setEmail] = useState(state.userEmail);
    const [phone, setPhone] = useState(state.userPhone);
    const [accepted, setAccepted] = useState(false);

    if (hidden || state.termsAccepted) return null;

    const accept = () => {
        dispatch({
            type: 'set-profile',
            patch: {
                userName: name.trim(),
                userEmail: email.trim(),
                userPhone: phone.trim(),
                termsAccepted: true,
            },
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121212] shadow-2xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/5">
                    <Scale size={16} className="text-[rgb(var(--accent))]" />
                    <h2 className="text-sm font-bold text-white">Términos y registro — CaRo Ai</h2>
                    <button
                        type="button"
                        onClick={() => setHidden(true)}
                        aria-label="Cerrar por ahora"
                        className="ml-auto p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        <X size={15} />
                    </button>
                </div>

                <div className="px-5 py-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
                    <p className="text-xs text-neutral-400 leading-relaxed">
                        CaRo Ai es una aplicación <span className="text-neutral-200">local-first</span>: no tiene servidor
                        en la nube ni usuarios conectados entre sí. Todo corre en <span className="text-neutral-200">tu equipo</span>{' '}
                        (Windows, macOS, Android o iOS) con tu propio internet.
                    </p>
                    <p className="text-xs text-neutral-500 leading-relaxed">
                        Al continuar declaras que eres mayor de edad (o cuentas con autorización), que usarás la app
                        bajo tu propia responsabilidad y que eres responsable de los servicios de terceros que conectes
                        (cuentas, APIs, contenido). Revisa el módulo <span className="text-neutral-300">Legal</span> para el
                        detalle por país (México, EE. UU., UE, Brasil).
                    </p>

                    <div className="grid grid-cols-1 gap-2.5 pt-1">
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" className={inputCls} />
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo (opcional)" className={inputCls} />
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono (opcional)" className={inputCls} />
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                        <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(e) => setAccepted(e.target.checked)}
                            className="mt-0.5 accent-[rgb(var(--accent))]"
                        />
                        <span className="text-[11px] text-neutral-400 leading-relaxed">
                            Leí y acepto los términos y la política de privacidad. Entiendo que CaRo Ai es una
                            herramienta local y que soy responsable de su uso.
                        </span>
                    </label>
                </div>

                <div className="px-5 py-4 border-t border-white/5 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setHidden(true)}
                        className="px-3.5 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                    >
                        Ahora no
                    </button>
                    <button
                        type="button"
                        onClick={accept}
                        disabled={!accepted}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Aceptar y continuar
                    </button>
                </div>
            </div>
        </div>
    );
};
