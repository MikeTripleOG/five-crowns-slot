// Real coordinate clicks on each visible portrait: desktop, portrait and landscape.
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://localhost:8123/';
const OUT = process.env.OUT || '/workspace/five-crowns-slot/screenshots/selection';
fs.mkdirSync(OUT, {recursive:true});
const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome'});
const heroes = ['eldenvale','northgard','solenthia','vellorien','drakonia'];
let checks=0;
try {
  for (const [label,width,height] of [['desktop',1280,800],['portrait',390,844],['landscape',844,390]]) {
    const ctx=await browser.newContext({viewport:{width,height}, reducedMotion:'reduce'});
    for (const hero of heroes) {
      const page=await ctx.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(BASE+'?demo=1&forceBonus=laststand&bonusvideo=0&introvideo=0');
      await page.waitForFunction(()=>window.__game?.introDone);
      await page.locator('#spin').click();
      await page.waitForSelector('#heroSelect');
      await page.waitForTimeout(600); // finish entry animation before coordinate checks
      const geometry=await page.locator('#heroSelect .hs button').evaluateAll(buttons=>buttons.map(b=>{
        const r=b.getBoundingClientRect(), img=b.querySelector('img'), ir=img.getBoundingClientRect();
        const x=ir.x+ir.width/2, y=ir.y+ir.height/2;
        return {hero:b.dataset.hero, inside:r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight,
          imageLoaded:img.complete && img.naturalWidth>0, hit:document.elementFromPoint(x,y)?.closest('button')?.dataset.hero};
      }));
      assert.equal(geometry.length,5);
      for (const g of geometry) { assert.ok(g.inside && g.imageLoaded,JSON.stringify(g)); assert.equal(g.hit,g.hero); }
      if(hero==='eldenvale') await page.screenshot({path:OUT+'/'+label+'-select.png'});
      const image=await page.locator(`[data-hero="${hero}"] img`).boundingBox();
      await page.mouse.click(image.x+image.width/2,image.y+image.height/2);
      await page.waitForSelector('#fHero');
      assert.equal(await page.locator('#fHero').getAttribute('data-hero'),hero);
      assert.deepEqual(errors,[]);
      console.log('PASS',label,hero,'portrait click selects correct fighter; all five buttons visible and aligned');
      checks++;
      await page.close();
    }
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(`${checks}/15 hero coordinate-selection cases PASS`);
