import { expect, test, type Page } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
const ROOT = "docs/quality-audit/screenshots";
const FIXTURE = "src/tests/fixtures/background-quality/synthetic-signature.png";
const source = PNG.sync.read(readFileSync(FIXTURE));
const compact = new PNG({width:600,height:240});
for(let y=0;y<240;y++)for(let x=0;x<600;x++)source.data.copy(compact.data,(y*600+x)*4,(y*2*1200+x*2)*4,(y*2*1200+x*2)*4+4);
// Native pixel parity uses DPR 1; Desktop Safari's default DPR 2 changes backing size.
test.use({viewport:{width:1440,height:960},deviceScaleFactor:1});
test.beforeEach(async ({page}) => { await page.addInitScript(() => localStorage.setItem("shotexa.analytics-consent.v1", "rejected")); });
async function openInk(page: Page, small=false) {
  await page.goto("/remove-background"); await page.getByTestId("file-input").setInputFiles(small ? {name:"mark.png",mimeType:"image/png",buffer:PNG.sync.write(compact)} : FIXTURE);
  await page.getByLabel("Removal method").filter({visible:true}).selectOption("ink");
  await page.getByRole("button",{name:"Remove background",exact:true}).click();
  await expect(page.getByText("Mask ready",{exact:true}).first()).toBeVisible();
}
async function slider(page:Page, name:string, value:string) {
  await page.getByRole("slider",{name,exact:true}).evaluate((node,value)=>{const input=node as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));},value);
}
function parity(actual: PNG, expected: PNG) {
  expect([actual.width,actual.height]).toEqual([expected.width,expected.height]);
  let maxAlpha=0,maxComposite=0;
  for(let i=0;i<actual.data.length;i+=4){maxAlpha=Math.max(maxAlpha,Math.abs(actual.data[i+3]-expected.data[i+3]));for(const bg of [0,255])for(let c=0;c<3;c++){const a=actual.data[i+3]/255,b=expected.data[i+3]/255;maxComposite=Math.max(maxComposite,Math.abs(actual.data[i+c]*a+bg*(1-a)-expected.data[i+c]*b-bg*(1-b)));}}
  console.log({maxAlpha,maxComposite});
  writeFileSync(test.info().outputPath("preview.png"),PNG.sync.write(actual));writeFileSync(test.info().outputPath("export.png"),PNG.sync.write(expected));
  expect(maxAlpha).toBeLessThanOrEqual(1);expect(maxComposite).toBeLessThanOrEqual(2);
}
async function exported(page:Page) {
  const [d]=await Promise.all([page.waitForEvent("download"),page.getByTestId("export").click()]);
  return { data:PNG.sync.read(readFileSync((await d.path())!)), download:d };
}
test("single-ink PNG preserves strokes, alpha, clipboard bytes and workspace continuation",async({page,browserName})=>{
  const requests:string[]=[];page.on("request",r=>requests.push(r.url()));await openInk(page);
  await page.getByRole("group",{name:"Preview surface",exact:true}).getByRole("button",{name:"Dark",exact:true}).click();
  const {data,download}=await exported(page);expect([data.width,data.height]).toEqual([1200,480]);
  let zero=0,opaque=0,partial=0,whiteLeaks=0,strokeLoss=0,maxError=0;
  for(let i=0;i<data.data.length;i+=4){const alpha=Math.round((255-source.data[i])/231*255);maxError=Math.max(maxError,Math.abs(alpha-data.data[i+3]));if(source.data[i]===255 && data.data[i+3]>0)whiteLeaks++;if(alpha>20 && data.data[i+3]===0)strokeLoss++;if(data.data[i+3]===0)zero++;else if(data.data[i+3]===255)opaque++;else partial++;}
  expect(whiteLeaks).toBe(0);expect(strokeLoss).toBe(0);expect(maxError).toBeLessThanOrEqual(2);expect(opaque).toBeGreaterThan(100);
  expect(requests.some(url=>/u2net|ort-wasm/.test(url))).toBe(false);
  if(browserName==="chromium"){
    mkdirSync(ROOT,{recursive:true});await download.saveAs(`${ROOT}/after-signature-export.png`);await page.screenshot({path:`${ROOT}/after-signature-ui.png`});
    writeFileSync(`${ROOT}/alpha-results.json`,JSON.stringify({width:data.width,height:data.height,zero,opaque,partial,whiteLeaks,strokeLoss,maxAlphaError:maxError,diagnostics:await page.getByTestId("background-removal-diagnostics").evaluate(e=>({... (e as HTMLElement).dataset}))},null,2));
    for(const [name,color] of Object.entries({white:[255,255,255],dark:[24,32,44],green:[62,150,110]})){const out=new PNG({width:data.width,height:data.height});for(let i=0;i<data.data.length;i+=4){const a=data.data[i+3]/255;for(let c=0;c<3;c++)out.data[i+c]=Math.round(data.data[i+c]*a+color[c]*(1-a));out.data[i+3]=255;}writeFileSync(`${ROOT}/after-on-${name}.png`,PNG.sync.write(out));}
    await page.context().grantPermissions(["clipboard-read","clipboard-write"]);await page.getByRole("button",{name:"Copy PNG",exact:true}).click();await expect(page.getByText(/^PNG copied\./)).toBeVisible();
    const copied=await page.evaluate(async()=>{const item=(await navigator.clipboard.read())[0];const bitmap=await createImageBitmap(await item.getType("image/png"));const c=document.createElement("canvas");c.width=bitmap.width;c.height=bitmap.height;const x=c.getContext("2d")!;x.drawImage(bitmap,0,0);const alpha=x.getImageData(0,0,1,1).data[3];bitmap.close();return {width:c.width,height:c.height,alpha};});expect(copied).toEqual({width:1200,height:480,alpha:0});
  }
  await page.getByRole("link",{name:/Open Beautifier/}).click();await expect(page.getByTestId("beautify-workspace")).toBeVisible({timeout:60000});
  await expect(page.getByText("background-removed-synthetic-signature.png",{exact:true}).first()).toBeVisible();
});
test("trim preserves the entire mark and preview pixels match the export",async({page})=>{
  await openInk(page,true);const source=compact;await page.getByLabel("Trim transparent space",{exact:true}).check();
  await slider(page,"Trim padding","10");
  const {data}=await exported(page);let minX=source.width,minY=source.height,maxX=0,maxY=0;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){if((255-source.data[(y*source.width+x)*4])/231*255>8){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
  expect(data.width).toBe(maxX-minX+21);expect(data.height).toBe(maxY-minY+21);
  const canvas=page.getByTestId("background-removal-canvas");
  await page.getByRole("button",{name:/Actual size/}).click();
  const preview=await canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL().split(",")[1]);const p=PNG.sync.read(Buffer.from(preview,"base64"));parity(p,data);
  let ink=0;for(let i=3;i<data.data.length;i+=4)if(data.data[i]>200)ink++;expect(ink).toBeGreaterThan(700);
});
test("gradient angle, placement and shadow use the same preview and export composition",async({page})=>{
  await openInk(page,true);await page.getByRole("button",{name:"Gradient",exact:true}).click();await slider(page,"Gradient angle","270");await page.getByLabel("Ambient subject shadow").check();await page.getByRole("button",{name:/Actual size/}).click();const {data}=await exported(page);const preview=await page.getByTestId("background-removal-canvas").evaluate(c=>(c as HTMLCanvasElement).toDataURL().split(",")[1]);const p=PNG.sync.read(Buffer.from(preview,"base64"));parity(p,data);
});
test("photo rejects single-ink assumptions and remains available for object removal",async({page,browserName})=>{
  test.setTimeout(240000);await page.goto("/remove-background");await page.getByTestId("file-input").setInputFiles("src/tests/fixtures/privacy-v23/astronaut-public-domain.png");await page.getByLabel("Removal method").filter({visible:true}).selectOption("ink");await page.getByRole("button",{name:"Remove background",exact:true}).click();await expect(page.getByText(/Use a single ink color/)).toBeVisible();await page.getByLabel("Removal method").filter({visible:true}).selectOption("object");await page.getByRole("button",{name:"Remove background",exact:true}).click();await expect(page.getByText("Mask ready",{exact:true}).first()).toBeVisible({timeout:180000});const {data,download}=await exported(page);expect(data.data.some((v,i)=>i%4===3&&v===0)).toBe(true);if(browserName==="chromium")await download.saveAs(`${ROOT}/photo-object-export.png`);
});
test("mobile signature controls and PNG export fit at 390px",async({page,browserName})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/remove-background");await page.getByTestId("file-input").setInputFiles(FIXTURE);await page.getByTestId("mobile-inspector-trigger").click();const sheet=page.getByRole("dialog",{name:"Background removal settings"});await sheet.getByLabel("Removal method").selectOption("ink");await sheet.getByRole("button",{name:"Remove background",exact:true}).click();await expect(sheet.getByText(/Mask ready. Review/)).toBeVisible();await sheet.getByRole("group",{name:"Preview surface",exact:true}).getByRole("button",{name:"White",exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(browserName==="chromium")await page.screenshot({path:`${ROOT}/mobile-settings.png`});const [d]=await Promise.all([page.waitForEvent("download"),sheet.getByRole("button",{name:"Export image",exact:true}).click()]);expect(PNG.sync.read(readFileSync((await d.path())!)).data[3]).toBe(0);
});

test("single-color logo keeps its edge colors and mask edits undo and redo", async ({page,browserName}) => {
  await page.goto('/remove-background');
  const bytes=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=300;const x=c.getContext('2d')!;x.fillStyle='#f4efe4';x.fillRect(0,0,600,300);x.strokeStyle='#1854b4';x.fillStyle='#1854b4';x.lineWidth=3;x.beginPath();x.arc(150,150,70,0,Math.PI*2);x.stroke();x.font='bold 46px sans-serif';x.fillText('DEMO',250,165);return c.toDataURL().split(',')[1];});
  await page.getByTestId('file-input').setInputFiles({name:'synthetic-logo.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
  await page.getByLabel('Removal method').filter({visible:true}).selectOption('ink');await page.getByRole('button',{name:'Remove background',exact:true}).click();await expect(page.getByText('Mask ready',{exact:true}).first()).toBeVisible();
  const {data,download}=await exported(page);expect(data.data[3]).toBe(0);if(browserName==='chromium')await download.saveAs(`${ROOT}/logo-export.png`);
  const canvas=page.getByTestId('background-removal-canvas');const original=await canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL());const box=(await canvas.boundingBox())!;
  const targetAlpha=await canvas.evaluate(c=>{const x=Math.floor((c as HTMLCanvasElement).width*.25),y=Math.floor((c as HTMLCanvasElement).height*.267);return (c as HTMLCanvasElement).getContext('2d')!.getImageData(x,y,1,1).data[3];});
  expect(targetAlpha).toBeGreaterThan(200);
  await page.getByRole('button',{name:'Erase foreground',exact:true}).click();
  await expect(page.getByLabel(/Erase mask brush canvas/)).toBeVisible();
  await page.mouse.move(box.x+box.width*.25,box.y+box.height*.267);await page.mouse.down();await page.mouse.up();
  await expect.poll(()=>canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL())).not.toBe(original);
  await expect(page.getByRole('button',{name:'Undo mask stroke'})).toBeEnabled();await page.getByRole('button',{name:'Undo mask stroke'}).click();await expect.poll(()=>canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL())).toBe(original);await page.getByRole('button',{name:'Redo mask stroke'}).click();await expect.poll(()=>canvas.evaluate(c=>(c as HTMLCanvasElement).toDataURL())).not.toBe(original);
});

test("signature mode refuses excessive dimensions before allocating a full mask", async ({page}) => {
  const large=new PNG({width:4100,height:4000});large.data.fill(255);
  await page.goto('/remove-background');await page.getByTestId('file-input').setInputFiles({name:'large-paper.png',mimeType:'image/png',buffer:PNG.sync.write(large)});await page.getByLabel('Removal method').filter({visible:true}).selectOption('ink');await page.getByRole('button',{name:'Remove background',exact:true}).click();await expect(page.getByText(/Signature mode supports up to 16 megapixels/)).toBeVisible({timeout:30000});await expect(page.getByTestId('export')).toBeDisabled();
});
