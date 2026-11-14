import { _electron as electron } from 'playwright';
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 30000 });
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(5000);
const text = await win.evaluate(() => document.body.innerText.slice(0, 1500));
console.log('=== BODY TEXT ===\n' + text);
const html = await win.evaluate(() => document.body.innerHTML.slice(0, 500));
console.log('=== HTML HEAD ===\n' + html);
try { await app.evaluate(({ app: a }) => a.exit(0)); } catch {}
app.process()?.kill();
process.exit(0);
