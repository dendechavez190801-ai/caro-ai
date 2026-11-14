import { _electron as electron } from 'playwright';
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 30000 });
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(5000);
console.log('URL:', win.url());
for (const sel of [
  "role=button[name='Chat']",
  "text='Chat'",
  "button:has-text('Chat')",
]) {
  try {
    const loc = win.locator(sel).first();
    const vis = await loc.isVisible().catch(e=>'ERR:'+e.message.slice(0,80));
    const cnt = await win.locator(sel).count();
    console.log(sel, '→ count:', cnt, 'visible:', vis);
    if (vis === true) { await loc.click({timeout:3000}); console.log('  CLICK OK'); break; }
  } catch(e){ console.log(sel,'→',String(e).slice(0,120)); }
}
try { await app.evaluate(({ app: a }) => a.exit(0)); } catch {}
app.process()?.kill();
process.exit(0);
