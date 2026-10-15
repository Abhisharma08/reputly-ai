import {describe,it,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {validateReviewUrl,validateNarrative} from '../lib/validation';
import {dailyRows,sumRows,initialState,rangeDates,loadState,saveState,recordEvent,STORAGE_KEY,csvCell} from '../lib/model';
import QRCode from 'qrcode';
describe('Google destination validation',()=>{
  for(const url of ['https://g.page/r/ChITest123/review','https://search.google.com/local/writereview?placeid=ChITest123','https://www.google.com/local/writereview?placeid=ChITest123'])it(`accepts ${url}`,()=>assert.equal(validateReviewUrl(url),url));
  for(const url of ['javascript:alert(1)','http://g.page/r/abc/review','https://g.page.evil.test/r/abc/review','https://google.com.evil.test/local/writereview?placeid=ChIabc','https://127.0.0.1/review','https://g.page@evil.test/r/abc/review','https://name:secret@g.page/r/abc/review','https://g.page:8443/r/abc/review','https://g.page/r/abc/review?redirect=https://evil.test','https://g.page/r/abc/review#extra','https://www.google.com/url?q=https://evil.test','https://search.google.com/local/writereview?placeid=ChIone&placeid=ChItwo','https://search.google.com/local/writereview?placeid=ChIabc&redirect=evil','https://g.page/r/%2F/review','https://maps.app.goo.gl/unknown'])it(`rejects ${url}`,()=>assert.throws(()=>validateReviewUrl(url)));
});
describe('Narrative requirements',()=>{
  it('rejects empty, rating-only and repetitive input',()=>{for(const s of ['','5 stars','5 stars 5 stars 5 stars','a'.repeat(30),'x'.repeat(1501)])assert.ok(validateNarrative(s));});
  it('accepts negative and mixed experiences equally',()=>{assert.equal(validateNarrative('Food was cold and the service was unhelpful.'),null);assert.equal(validateNarrative('Waited an hour, but the dessert was excellent.'),null);});
  it('accepts Hindi',()=>assert.equal(validateNarrative('कॉफी अच्छी थी लेकिन सेवा थोड़ी धीमी थी।'),null));
});
describe('Demo analytics and privacy',()=>{
  let store:Map<string,string>;
  beforeEach(()=>{store=new Map();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>store.get(k)||null,setItem:(k:string,v:string)=>store.set(k,v)},configurable:true});Object.defineProperty(globalThis,'window',{value:{dispatchEvent:()=>{}},configurable:true});});
  it('creates isolated state copies',()=>{const a=loadState();a.locations=[];assert.equal(loadState().locations.length,3);});
  it('recovers from malformed stored JSON',()=>{store.set(STORAGE_KEY,'broken');assert.equal(loadState().locations.length,3);});
  it('persists local edits',()=>{const s=loadState();s.organization='Test Café';saveState(s);assert.equal(loadState().organization,'Test Café');});
  it('deduplicates each QR event for five minutes',()=>{recordEvent('loc-1','qr-1','qr_opened');recordEvent('loc-1','qr-1','qr_opened');recordEvent('loc-1','qr-1','review_link_clicked');assert.equal(loadState().events.length,2);});
  it('records only allowlisted fields, not narrative or rating',()=>{recordEvent('loc-1','qr-1','assist_started');assert.deepEqual(Object.keys(loadState().events[0]).sort(),['at','codeId','id','locationId','type']);});
  it('filters by date and location without counting other locations',()=>{const dates=rangeDates(7);const all=sumRows(dailyRows(initialState,'all',dates.from,dates.to));const one=sumRows(dailyRows(initialState,'loc-1',dates.from,dates.to));assert.equal(dailyRows(initialState,'all',dates.from,dates.to).length,7);assert.ok(one.scans>0&&one.scans<all.scans);const parts=initialState.locations.map(l=>sumRows(dailyRows(initialState,l.id,dates.from,dates.to)).scans);assert.equal(parts.reduce((a,b)=>a+b,0),all.scans);});
  it('gives new locations zero sample activity',()=>{const s=loadState();s.locations.push({...s.locations[0],id:'new'});const d=rangeDates(30);assert.equal(sumRows(dailyRows(s,'new',d.from,d.to)).scans,0);});
  it('adds local handoffs without falsely counting drafts',()=>{const d=rangeDates(1);const before=sumRows(dailyRows(loadState(),'loc-1',d.from,d.to));recordEvent('loc-1','qr-1','review_link_clicked');const after=sumRows(dailyRows(loadState(),'loc-1',d.from,d.to));assert.equal(after.handoffs,before.handoffs+1);assert.equal(after.completed,before.completed);});
  it('escapes CSV formula injection and quotes',()=>{assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');assert.equal(csvCell('a,b'),'"a,b"');});
});
describe('QR generation',()=>{it('generates a valid SVG QR asset',async()=>{const svg=await QRCode.toString('https://reputly-ai.tech385485.chatgpt.site/r/daily-grind-demo-1',{type:'svg',errorCorrectionLevel:'M',margin:4,width:1024});assert.match(svg,/<svg/);assert.match(svg,/width="1024"/);assert.match(svg,/<path/);});});
