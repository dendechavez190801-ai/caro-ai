import React, { useEffect, useState } from 'react';
import { Scale, Check, AlertTriangle, ShieldCheck, Download, Trash2, Eye } from 'lucide-react';
import { Section, Card } from '../../components/ui';

const TERMS = [
    'El usuario es el único responsable del uso de CaRo Ai y de todo lo que haga con ella, dentro de la legalidad de su país y de las leyes internacionales aplicables.',
    'Marco aplicable: México (LFPDPPP), Estados Unidos (CCPA/CPRA y leyes estatales), Unión Europea/Reino Unido (GDPR/UK GDPR si aplica), Brasil (LGPD) y demás jurisdicciones del usuario.',
    'El autor/desarrollador no tiene contacto con los datos, cuentas, archivos ni equipos del usuario; todo lo que ocurra dentro de la app es responsabilidad exclusiva del usuario.',
    'Queda prohibido usar el agente para actividades ilegales, intrusivas, de suplantación, acceso no autorizado, minería no consentida o que vulneren privacidad, derechos de autor o seguridad de terceros.',
    'La clonación de voz o imagen solo está permitida sobre la propia voz/imagen del usuario o con consentimiento expreso y documentado del titular; clonaciones de terceros sin permiso son responsabilidad del usuario.',
    'Contenido generado por IA: CaRo Ai puede generar texto, audio y voz sintética. En la UE aplica el AI Act (Art. 50): el contenido sintético debe declararse como generado por IA; en EE. UU. varias leyes estatales exigen lo mismo para deepfakes. El usuario es responsable de etiquetar y declarar el contenido que distribuya.',
    'Datos biométricos: la voz es un dato biométrico. Grabar o clonar voces de terceros sin consentimiento puede violar GDPR (dato especial), CCPA, LFPDPPP y leyes de Illinois/Bipa. Solo se procesan muestras que tú registras en tu equipo.',
    'Tiendas (Google Play / App Store): la app declara sus permisos y usos de micrófono/cámara; el contenido generado por IA debe cumplir las políticas de cada tienda si se distribuye ahí.',
    'Los permisos de hardware, micrófono, cámara, pantalla, ratón/teclado y archivos se otorgan de forma granular y pueden revocarse; el usuario decide qué autoriza.',
    'El autor no se hace responsable por daños directos o indirectos derivados del uso indebido, mala configuración de permisos, ejecución de comandos o acciones sobre el sistema operativo.',
    'Esta pantalla es una revisión técnica de buenas prácticas, NO asesoría legal. Para casos serios consulta a un abogado.',
];

const PRIVACY = [
    { icon: ShieldCheck, title: 'Qué se queda en tu equipo (100% local)', text: 'Bóveda, notas, chats archivados, memoria, credenciales (cifradas con safeStorage/DPAPI), modelos descargados, historial de terminal y archivos de Media Studio. Nada de esto sale de tu dispositivo.' },
    { icon: Eye, title: 'Qué SÍ sale — solo si tú lo configuras', text: 'Mensajes de chat a los proveedores de IA que elijas (OpenAI, Gemini, Ollama local, etc.). Los servidores locales (Ollama, LM Studio) escuchan solo en 127.0.0.1 de tu equipo. Los conectores (GitHub/GitLab/HF) usan tu token solo contra sus APIs oficiales.' },
    { icon: Download, title: 'Transferencias entre tus dispositivos', text: 'La proyección de pantalla y archivos por LAN viajan solo por tu red local (puerto 47823) y exigen tu código de vínculo. No pasan por internet ni por servidores de CaRo Ai.' },
    { icon: Trash2, title: 'Retención y control', text: 'La bóveda y el archivo de chats aplican retención de 6 meses con opción de conservar o eliminar. Puedes exportar todo a Markdown/JSON en cualquier momento y borrar datos desde cada módulo.' },
    { icon: AlertTriangle, title: 'Contenido con IA y voz clonada', text: 'Los audios/notas generados son sintéticos: decláralos como IA al compartirlos (AI Act UE Art. 50, leyes de deepfake en EE. UU.). Las muestras de voz quedan solo en tu equipo (userData/voz-clon) y se procesan localmente con OpenVoice.' },
];

const RIGHTS = [
    'Acceso y portabilidad: exporta tus datos desde Bóveda, chats y Actualizaciones.',
    'Supresión: elimina notas, chats, secretos y archivos compartidos localmente; desinstalar borra la app.',
    'Oposición/revocación: apaga micrófono, wake word, conectores y permisos en cualquier momento desde la app.',
    'Menores: CaRo Ai no está dirigida a menores de 13 años (COPPA) ni recopila datos de menores.',
    'Brechas: al ser local-first, una filtración requeriría acceso físico a tu equipo; los secretos van cifrados por el sistema operativo.',
];

const ACCEPT_KEY = 'caro-legal-accepted';

/**
 * Consentimiento legal y privacidad (C3/C4).
 * Términos de responsabilidad + política de privacidad real de la app +
 * derechos por región. La aceptación se persiste con fecha.
 */
export const LegalModule: React.FC = () => {
    const [accepted, setAccepted] = useState(false);
    const [acceptedAt, setAcceptedAt] = useState('');

    useEffect(() => {
        try {
            const raw = localStorage.getItem(ACCEPT_KEY);
            if (raw) {
                const { at } = JSON.parse(raw) as { at?: string };
                setAccepted(true);
                setAcceptedAt(at ?? '');
            }
        } catch { /* noop */ }
    }, []);

    const decide = (ok: boolean) => {
        setAccepted(ok);
        if (ok) {
            const at = new Date().toISOString();
            setAcceptedAt(at);
            try { localStorage.setItem(ACCEPT_KEY, JSON.stringify({ at })); } catch { /* noop */ }
        } else {
            setAcceptedAt('');
            try { localStorage.removeItem(ACCEPT_KEY); } catch { /* noop */ }
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Section title="Términos y responsabilidad" desc="Acuerdo de uso. Cada usuario acepta por su cuenta; nada se comparte entre cuentas.">
                <Card className="border-amber-400/20">
                    <div className="flex items-center gap-2 mb-3">
                        <Scale size={16} className="text-amber-300" />
                        <p className="text-sm font-bold uppercase tracking-wide text-amber-200">Acuerdo de Responsabilidad Legal y Ética</p>
                    </div>
                    <ol className="flex flex-col gap-3 text-[13px] text-neutral-300 leading-relaxed list-decimal list-inside">
                        {TERMS.map((c, i) => <li key={i}>{c}</li>)}
                    </ol>
                </Card>
            </Section>

            <Section title="Política de privacidad" desc="Qué datos maneja CaRo Ai y adónde van. Resumen fiel al comportamiento real de la app.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PRIVACY.map((p) => (
                        <Card key={p.title} className="flex flex-col gap-2">
                            <p.icon size={16} className="text-[rgb(var(--accent))]" />
                            <p className="text-xs font-semibold text-white">{p.title}</p>
                            <p className="text-[11px] text-neutral-400 leading-relaxed">{p.text}</p>
                        </Card>
                    ))}
                </div>
                <Card className="mt-3">
                    <p className="text-xs font-semibold text-white mb-2">Tus derechos (MX LFPDPPP · US CCPA/CPRA · UE GDPR · BR LGPD)</p>
                    <ul className="flex flex-col gap-1.5 text-[11px] text-neutral-400">
                        {RIGHTS.map((r) => <li key={r} className="flex gap-2"><span className="text-[rgb(var(--accent))]">•</span>{r}</li>)}
                    </ul>
                </Card>
            </Section>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={`text-[12px] flex items-center gap-1.5 ${accepted ? 'text-emerald-400' : 'text-neutral-500'}`}>
                    {accepted ? <Check size={14} /> : <AlertTriangle size={14} />}
                    {accepted ? `Acuerdo aceptado${acceptedAt ? ` el ${acceptedAt.slice(0, 10)}` : ''}` : 'Acuerdo pendiente de aceptar'}
                </p>
                <div className="flex gap-2">
                    <button type="button" onClick={() => decide(false)} className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-300 border border-white/10 hover:border-white/20 transition-colors">Rechazar</button>
                    <button type="button" onClick={() => decide(true)} className="px-4 py-2 rounded-lg text-xs font-semibold text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] hover:opacity-90 transition-opacity">Aceptar</button>
                </div>
            </div>
        </div>
    );
};
