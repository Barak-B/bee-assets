import { chromium } from 'playwright';
import path from 'node:path';
const dir = new URL('.', import.meta.url).pathname;
const jobs = [['ss_badge_color',1024,1024],['ss_badge_mono',1024,1024],['ss_badge_reverse',1024,1024],['ss_lockup_color',1800,600],['ss_lockup_reverse',1800,600],['ss_icon',600,600],['ss_sheet',1600,2440]];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const [name,w,h] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto('file://' + path.join(dir, name + '.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#logo').screenshot({ path: path.join(dir, name + '.png'), type: 'png' });
  await page.close(); console.log('rendered', name);
}
await browser.close();
