import { chromium, firefox } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const base = process.env.WMS_BASE || 'http://127.0.0.1:4183';
const out = process.env.WMS_OUT || join(process.cwd(), 'screenshots', 'refinement');
mkdirSync(out, { recursive: true });
const engine = process.env.WMS_BROWSER || 'chromium';
const browser = await ({chromium, firefox}[engine]).launch();
const results = [];
function check(ok, name, evidence) { results.push({ok, name, evidence}); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(evidence)}`); }
const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page = await context.newPage();
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
async function ready(path='/') { await page.goto(base+path); await page.locator('section.sec').first().waitFor(); await page.evaluate(()=>document.fonts.ready); }
try {
 await ready();
 const rollup = await page.evaluate(async()=> (await fetch('/data/rollup.json')).json());
 const slugs = rollup.calculator.flatMap(v=>v.rows.map(r=>r.slug));
 for (const theme of ['parchment','light','dark']) {
  await page.getByRole('button',{name:'Theme',exact:true}).click();
  await page.getByRole('menuitemradio',{name:new RegExp('^'+theme+'$', 'i')}).click();
  await page.reload(); await page.locator('section.sec').first().waitFor();
  check(await page.evaluate(t=>document.documentElement.dataset.theme===t && localStorage.getItem('halvard-wms-theme')===t,theme),'Theme persists '+theme,theme);
  for (const width of [1440,1024,390,360]) {
   await page.setViewportSize({width,height:width<700?844:1000}); await ready();
   const bounds=await page.locator('.mast-icon').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {label:e.getAttribute('aria-label'),w:r.width,h:r.height,radius:s.borderRadius,inside:r.left>=0&&r.right<=innerWidth,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
   check(bounds.length===2&&bounds.every(x=>x.w===x.h&&x.w>=44&&x.radius==='50%'&&x.inside&&x.hit),'Circular reachable controls '+theme+' '+width,bounds);
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No document overflow '+theme+' '+width,width);
   for (const label of ['Module','Theme']) {
    await page.getByRole('button',{name:label,exact:true}).click();
    const b=await page.getByRole('menu',{name:label+' options'}).boundingBox();
    check(b.x>=0&&b.x+b.width<=width,'Dropdown bounds '+label+' '+theme+' '+width,b);
    await page.keyboard.press('Escape');
   }
   await page.locator('h1').click();
   if(width===1440||width===390) {
    await page.screenshot({path:join(out,`overview-${theme}-${width}.png`)});
    if(width===1440) await page.screenshot({path:join(out,`overview-${theme}-${width}-full.png`),fullPage:true});
   }
   if(width===1024||width===360) {
    for(const route of ['/capacity','/aging','/replenishment','/cost','/inbound','/calculator?v=cooling','/data-basis','/g/air-handling-unit-sections']){
     await ready(route);
     check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Report width '+theme+' '+width+' '+route,width);
    }
    await ready();
   }
   if(width===360) {
    const nav=page.locator('.nav-reports'); await nav.evaluate(e=>{e.scrollLeft=e.scrollWidth;});
    const last=page.getByRole('link',{name:'Data basis',exact:true}).first();
    const hit=await last.evaluate(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
    check(hit,'Last report reachable by phone scroll '+theme,hit);
   }
  }
  await page.setViewportSize({width:1440,height:1000});
  for (const path of ['/','/capacity','/aging','/replenishment','/cost','/inbound','/calculator?v=cooling','/data-basis',...slugs.map(s=>'/g/'+s)]) {
   await ready(path);
   const state=await page.evaluate(()=>({h1:document.querySelector('h1')?.textContent,theme:document.documentElement.dataset.theme,sections:document.querySelectorAll('section.sec').length,bg:getComputedStyle(document.body).color,overflow:document.documentElement.scrollWidth>innerWidth}));
   check(!!state.h1&&state.sections>0&&state.theme===theme&&!state.overflow,'Route '+theme+' '+path,state);
   const gap=await page.locator('.page-head').evaluate(e=>e.getBoundingClientRect().top-document.querySelector('.mast').getBoundingClientRect().bottom);
   check(gap<90,'Report opening spacing '+theme+' '+path,gap);
   if ((theme==='dark'&&path==='/capacity')||(theme==='light'&&path==='/calculator?v=cooling')||(theme==='parchment'&&path==='/aging')) await page.screenshot({path:join(out,`${theme}-${path.split('?')[0].slice(1)}.png`)});
  }
 }
 await ready();
 const module=page.getByRole('button',{name:'Module',exact:true});
 await module.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
 check((await page.evaluate(()=>document.activeElement.textContent)).includes('Central Store'),'Rapid menu arrows preserve focus order',await page.evaluate(()=>document.activeElement.textContent));
 check(page.url()===base+'/','Arrows do not activate module',page.url());
 await page.keyboard.press('End'); check((await page.evaluate(()=>document.activeElement.textContent)).includes('Project Intelligence'),'End focuses last module',true);
 await page.keyboard.press('Home'); check((await page.evaluate(()=>document.activeElement.textContent)).includes('Group MIS'),'Home focuses first module',true);
 const links=await page.getByRole('menu',{name:'Module options'}).locator('a').evaluateAll(es=>es.map(e=>({url:e.href,current:e.getAttribute('aria-current')})));
 // The masthead's destinations are build flags (src/lib/suite.ts), so the expected set is too.
 const suite=[process.env.VITE_SUITE_MIS??'https://kinetics-mis-demo.vercel.app/',process.env.VITE_SUITE_WMS??'https://kinetics-wms-demo.vercel.app/',process.env.VITE_SUITE_PIS??'https://kinetics-pis-demo.vercel.app/'];
 check(links.map(x=>x.url).join('|')===suite.join('|')&&links[1].current==='true','Suite destination contract',links);
 await page.evaluate(()=>{const a=document.activeElement;a.addEventListener('click',event=>{event.preventDefault();document.documentElement.dataset.spaceActivated='true';},{once:true});});
 await page.keyboard.press('Space'); check(await page.evaluate(()=>document.documentElement.dataset.spaceActivated)==='true','Space explicitly activates module link',true);
 await module.click();
 await page.keyboard.press('Escape'); check(await module.evaluate(e=>document.activeElement===e),'Escape restores trigger focus',true);
 await module.click(); await page.locator('h1').click(); check(await module.getAttribute('aria-expanded')==='false','Outside dismissal',true);
 await module.focus(); await page.keyboard.press('Space'); check(await module.getAttribute('aria-expanded')==='true','Space opens menu',true);
 await page.keyboard.press('Tab'); check(await module.getAttribute('aria-expanded')==='false','Tab exits menu',true);
 for (const name of ['Theme','Module']) {
  const trigger=page.getByRole('button',{name,exact:true});
  await trigger.click(); await page.keyboard.press('Shift+Tab');
  check(await trigger.getAttribute('aria-expanded')==='false'&&await trigger.evaluate(e=>document.activeElement===e),'Shift+Tab dismisses '+name+' and preserves backward focus',true);
 }
 const themeButton=page.getByRole('button',{name:'Theme',exact:true}); await themeButton.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
 check(await page.evaluate(()=>document.documentElement.dataset.theme)==='dark','Theme arrows do not select',true);
 await page.keyboard.press('Enter'); check(await page.evaluate(()=>document.documentElement.dataset.theme)==='light','Enter selects theme',true);
 await page.screenshot({path:join(out,'menus-context.png')});
 await page.getByRole('combobox',{name:'Jump to section'}).selectOption('runout');
 check(!page.url().includes('#runout'),'Section selection requires Go',page.url());
 await page.getByRole('button',{name:'Go to selected section'}).click(); await page.waitForTimeout(150);
 const anchor=await page.locator('#runout-title').evaluate(e=>({top:e.getBoundingClientRect().top,mast:document.querySelector('.mast').getBoundingClientRect().bottom,focus:document.activeElement===e}));
 check(anchor.top>=anchor.mast&&anchor.focus,'Section Go clears masthead and transfers focus',anchor);
 await page.evaluate(()=>scrollTo(0,0)); await page.getByRole('button',{name:'Go to selected section'}).click(); await page.waitForFunction(()=>scrollY>0);
 check(await page.evaluate(()=>scrollY>0),'Repeated Go to current anchor scrolls again',true);
 await ready('/#aging'); await page.waitForFunction(()=>scrollY>0);
 const direct=await page.locator('#aging').evaluate(e=>({top:e.getBoundingClientRect().top,mast:document.querySelector('.mast').getBoundingClientRect().bottom,scroll:scrollY}));
 check(direct.scroll>0&&direct.top>=direct.mast&&direct.top<direct.mast+120,'Direct anchor after async data load',direct);
 await page.locator('#aging .sec-link').click(); await page.waitForURL('**/aging'); await page.locator('#slow').waitFor(); await page.goBack(); await page.locator('#aging').waitFor(); await page.waitForFunction(()=>scrollY>0);
 check(page.url().endsWith('/#aging')&&await page.evaluate(()=>scrollY>0),'Back returns to overview anchor',page.url());
 await ready('/calculator?v=cooling');
 const originalTotal=await page.locator('#calc-total').innerText();
 await page.locator('#calc-vertical').selectOption('trading');
 check(page.url().includes('v=cooling')&&await page.locator('#calc-total').innerText()===originalTotal,'Vertical browsing holds calculator context',originalTotal);
 await page.locator('#calc-open').click();
 check(page.url().includes('v=trading'),'Open vertical explicitly changes context',page.url());
 await page.waitForFunction(()=>document.querySelector('#rows-title')?.textContent?.startsWith('Trading'));
 await page.goBack(); await page.waitForFunction(()=>document.querySelector('#calc-vertical')?.value==='cooling');
 check(await page.locator('#calc-vertical').inputValue()==='cooling','Calculator Back restores selection',true);
 for (const path of ['/calculator#rows','/calculator?v=invalid#rows']) {
  await ready(path); await page.waitForFunction(()=>scrollY>0);
  const restored=await page.locator('#rows').evaluate(e=>({top:e.getBoundingClientRect().top,mast:document.querySelector('.mast').getBoundingClientRect().bottom}));
  check(new URL(page.url()).hash==='#rows'&&new URL(page.url()).searchParams.get('v')===rollup.calculator.find(v=>v.rows.length>0).slug&&restored.top>=restored.mast,'Calculator query fallback preserves direct anchor '+path,{url:page.url(),...restored});
 }
 await ready('/calculator?v=trading&review=context');
 const quantity=page.locator('#calc-table input').first();
 await quantity.fill('1.13');
 const editedTotal=await page.locator('#calc-total').innerText();
 await page.getByRole('combobox',{name:'Jump to section'}).selectOption('rows');
 await page.getByRole('button',{name:'Go to selected section'}).click();
 await page.waitForFunction(()=>scrollY>0);
 check(new URL(page.url()).search==='?v=trading&review=context'&&new URL(page.url()).hash==='#rows','Calculator section Go preserves query context',page.url());
 check(await page.locator('#calc-vertical').inputValue()==='trading'&&await quantity.inputValue()==='1.13'&&await page.locator('#calc-total').innerText()===editedTotal,'Calculator section Go preserves edited inputs and totals',editedTotal);
 const calcAnchor=await page.locator('#rows-title').evaluate(e=>({top:e.getBoundingClientRect().top,mast:document.querySelector('.mast').getBoundingClientRect().bottom,focus:document.activeElement===e}));
 check(calcAnchor.top>=calcAnchor.mast&&calcAnchor.focus,'Calculator section Go reaches and focuses correct vertical',calcAnchor);
 await page.goBack(); await page.waitForURL('**/calculator?v=trading&review=context');
 check(await page.locator('#calc-vertical').inputValue()==='trading'&&await quantity.inputValue()==='1.13','Back from calculator section preserves working draft',page.url());
 await ready('/calculator?v=cooling');
 const pendingInput=page.locator('#calc-table input[data-field="l"]').first();
 await pendingInput.fill('3'); await pendingInput.fill('3e2');
 const pendingStore=await page.locator('#calc-store-util').innerText();
 await page.locator('#calc-vertical').selectOption('trading'); await page.locator('#calc-open').click();
 check((await page.locator('#calc-pending-elsewhere').innerText()).includes('Cooling')&&await page.locator('#calc-store-util').innerText()===pendingStore,'Other vertical retains invalid-draft warning and last-valid store total',pendingStore);
 await page.locator('#calc-vertical').selectOption('cooling'); await page.locator('#calc-open').click();
 await page.waitForFunction(()=>document.querySelector('#rows-title')?.textContent?.startsWith('Cooling'));
 check(await pendingInput.inputValue()==='3e2'&&await pendingInput.getAttribute('aria-invalid')==='true','Returning to pending vertical retains invalid input',true);
 await page.locator('#calc-reset').click(); await page.locator('#calc-vertical').selectOption('trading'); await page.locator('#calc-open').click();
 check(await page.locator('#calc-pending-elsewhere').count()===0,'Reset clears other-vertical pending warning',true);
 const closed=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:engine==='chromium'});
 const touch=await closed.newPage(); await touch.goto(base); await touch.locator('.mast').waitFor(); await touch.getByRole('button',{name:'Theme',exact:true}).tap(); await touch.getByRole('menuitemradio',{name:'Dark',exact:true}).tap();
 check(await touch.evaluate(()=>document.documentElement.dataset.theme)==='dark','Touch selects theme',true); await closed.close();
 for(const invalid of [true,false]){
  const c=await browser.newContext(); await c.addInitScript(block=>{if(block){Object.defineProperty(window,'localStorage',{get(){throw new Error('storage unavailable');}});}else localStorage.setItem('halvard-wms-theme','invalid');},invalid);
  const q=await c.newPage(); await q.goto(base); await q.locator('.mast').waitFor(); check(await q.evaluate(()=>document.documentElement.dataset.theme)==='parchment',invalid?'Unavailable storage fallback':'Invalid storage fallback',true); await q.getByRole('button',{name:'Theme',exact:true}).click(); await q.getByRole('menuitemradio',{name:'Dark',exact:true}).click(); check(await q.evaluate(()=>document.documentElement.dataset.theme)==='dark','Theme remains usable with storage fallback '+invalid,true); await c.close();
 }
 check(errors.length===0,'No uncaught errors',errors);
} catch(e){check(false,'Probe completed',{error:String(e),url:page.url(),body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,1200),errors}); await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});} finally {
 writeFileSync(join(out,'refinement-results.json'),JSON.stringify({base,results},null,2)); await browser.close();
}
console.log(`${results.filter(x=>x.ok).length}/${results.length} checks passed`);
if(results.some(x=>!x.ok)) process.exitCode=1;
