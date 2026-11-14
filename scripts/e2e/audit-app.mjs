/**
 * Auditoría E2E de CaRo Ai con Playwright _electron.
 * Lanza la app real (main + renderer), recorre pestañas y módulos del
 * sidebar, captura consola/errores y una captura por pantalla.
 * El reporte se escribe incrementalmente por si algo se cuelga.
 *
 * Uso:  node scripts/e2e/audit-app.mjs [carpeta_salida]
 */
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] ?? path.resolve('audit-out');
const SHOTS = path.join(OUT, 'capturas');
fs.mkdirSync(SHOTS, { recursive: true });
const REPORT_FILE = path.join(OUT, 'reporte.json');

const TABS = ['Chat', 'Llamada', 'Avatar', 'Vista Previa', 'Bóveda', 'Terminal'];
const MODULES = [
    'Apariencia y Temas', 'Modelos e IA', 'Agentes y Entornos', 'Cuentas y Navegador',
    'Memoria y Personalidad', 'Permisos de SO', 'Consentimiento Legal',
    'Terminal y Conexión', 'Conectores del Sistema', 'Dispositivos y Red',
    'Diagnóstico de Hardware', 'Pantalla', 'Actualizaciones',
];

const report = { startedAt: new Date().toISOString(), consoleErrors: [], pageErrors: [], screens: [], actions: [] };
const save = () => fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
save();

async function shot(win, name) {
    try { await win.screenshot({ path: path.join(SHOTS, `${name}.png`) }); report.screens.push(name); }
    catch (e) { report.screens.push(`${name}:ERROR`); }
    save();
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let app;
try {
    app = await electron.launch({ args: ['.'], env, timeout: 30000 });
} catch (e) {
    report.fatal = String(e);
    save();
    console.log('FATAL', e);
    process.exit(1);
}

const win = await app.firstWindow();
win.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
        report.consoleErrors.push({ type: msg.type(), text: msg.text().slice(0, 400) });
        save();
    }
});
win.on('pageerror', (err) => { report.pageErrors.push(String(err).slice(0, 400)); save(); });

await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(5000);
await shot(win, '00-arranque');

async function clickByText(text, exact = false) {
    // Intenta botón con ese nombre visible; si no, cualquier elemento con el texto.
    const candidates = [
        win.getByRole('button', { name: text, exact }),
        win.getByRole('tab', { name: text, exact }),
        win.getByText(text, { exact }),
        win.getByText(text),
    ];
    for (const loc of candidates) {
        try {
            const el = loc.first();
            if (await el.isVisible().catch(() => false)) {
                try {
                    await el.click({ timeout: 2500 });
                } catch {
                    // La app tiene overlays (header drag, modales) que bloquean
                    // el hit-test de Playwright; dispatchEvent salta eso.
                    await el.dispatchEvent('click');
                }
                await win.waitForTimeout(900);
                return true;
            }
        } catch { /* siguiente candidato */ }
    }
    report.actions.push({ text, ok: false });
    save();
    return false;
}

for (const tab of TABS) {
    const ok = await clickByText(tab, true);
    report.actions.push({ tab, ok });
    save();
    if (ok) await shot(win, `tab-${slug(tab)}`);
}

for (const mod of MODULES) {
    const ok = await clickByText(mod);
    report.actions.push({ module: mod, ok });
    save();
    if (ok) await shot(win, `mod-${slug(mod)}`);
}

await clickByText('Chat', true);
try {
    const input = win.locator('textarea').last();
    await input.fill('hola, responde solo OK', { timeout: 5000 });
    await input.press('Enter');
    await win.waitForTimeout(15000);
    await shot(win, 'chat-respuesta');
    report.actions.push({ chatSend: true });
} catch (e) {
    report.actions.push({ chatSend: false, error: String(e).slice(0, 200) });
}
save();

// Cierre forzado: el handler 'close' de la app oculta la ventana en vez de
// salir, así que app.quit() normal puede colgar — forzamos app.exit().
try { await app.evaluate(({ app: a }) => a.exit(0)); } catch { /* noop */ }
try { app.process()?.kill(); } catch { /* noop */ }
report.finishedAt = new Date().toISOString();
save();
console.log('AUDITORÍA LISTA ->', REPORT_FILE);
process.exit(0);
