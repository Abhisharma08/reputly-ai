'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X, ArrowUpRight, Info } from 'lucide-react';
import QRCode from 'qrcode';
import { downloadFile, type DailyRow } from '@/lib/model';
export function Modal({ title, children, onClose, wide=false }: { title:string; children:ReactNode; onClose:()=>void; wide?:boolean }) {
  const titleId=useId();
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ ref.current?.showModal(); const original=document.body.style.overflow; document.body.style.overflow='hidden'; return()=>{document.body.style.overflow=original;}; },[]);
  return <dialog ref={ref} className={`modal ${wide?'modal-wide':''}`} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}} aria-labelledby={titleId}><div className="modal-top"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19}/></button></div><div className="modal-body">{children}</div></dialog>;
}
export function QR({ value, size=160 }: { value:string; size?:number }) {
  const [src,setSrc]=useState('');
  useEffect(()=>{let live=true; QRCode.toDataURL(value,{width:size*2,margin:4,errorCorrectionLevel:'M',color:{dark:'#203e31',light:'#ffffff'}}).then(v=>{if(live)setSrc(v);}); return()=>{live=false;};},[value,size]);
  return src?<img src={src} width={size} height={size} alt="Scannable QR code for the customer experience page"/>:<div className="qr-loading" style={{width:size,height:size}} aria-label="Generating QR code"/>;
}
export async function downloadQR(value:string,label:string,format:'png'|'svg') {
  const filename=label.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'reputly-qr';
  if(format==='svg') downloadFile(await QRCode.toString(value,{type:'svg',margin:4,width:1024,errorCorrectionLevel:'M'}),`${filename}.svg`,'image/svg+xml');
  else { const data=await QRCode.toDataURL(value,{width:1024,margin:4,errorCorrectionLevel:'M'}); const a=document.createElement('a');a.href=data;a.download=`${filename}.png`;a.click(); }
}
export function InfoNote({children}:{children:ReactNode}) {return <div className="info-note"><Info size={15}/><span>{children}</span></div>;}
export function MiniChart({ variant=0 }: {variant?:number}) {const paths=['M1 29 L10 25 L18 29 L27 17 L36 22 L44 18 L53 23 L62 10 L71 14 L79 7 L88 12 L98 2','M1 29 L10 25 L18 28 L27 23 L36 23 L44 14 L53 20 L62 10 L71 15 L79 8 L88 12 L98 4','M1 30 L10 24 L18 26 L27 18 L36 21 L44 11 L53 17 L62 11 L71 18 L79 12 L88 15 L98 3'];return <svg className="mini-chart" viewBox="0 0 100 35" aria-hidden="true"><path d={paths[variant%3]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>;}
export function TrendChart({rows,label}:{rows:DailyRow[];label?:string}) {
  const [hover,setHover]=useState<number|null>(null); const max=Math.max(20,Math.ceil(Math.max(...rows.map(r=>r.scans),0)/20)*20); const w=700,h=194; const points=(key:'scans'|'handoffs')=>rows.map((r,i)=>`${48+i*(w-66)/Math.max(rows.length-1,1)},${h-18-r[key]/max*(h-40)}`).join(' ');
  return <div className="chart-wrap"><svg viewBox={`0 0 ${w} ${h+30}`} role="img" aria-label={label||`Sample engagement chart for ${rows.length} days: QR scans and Google link clicks`} onMouseLeave={()=>setHover(null)}>
    <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d9c6e" stopOpacity=".22"/><stop offset="100%" stopColor="#6d9c6e" stopOpacity="0"/></linearGradient></defs>
    {[0,1,2,3,4].map(i=><g key={i}><line x1="48" y1={h-18-i*(h-40)/4} x2={w-18} y2={h-18-i*(h-40)/4} stroke="#e9ebe4" strokeDasharray="3 4"/><text x="33" y={h-14-i*(h-40)/4} textAnchor="end">{Math.round(max*i/4)}</text></g>)}
    {rows.length>0&&<><polygon points={`48,${h-18} ${points('scans')} ${w-18},${h-18}`} fill="url(#chart-fill)"/><polyline points={points('scans')} fill="none" stroke="#51794f" strokeWidth="2.5" strokeLinejoin="round"/><polyline points={points('handoffs')} fill="none" stroke="#b6cba6" strokeWidth="2.5" strokeLinejoin="round"/></>}
    {rows.map((r,i)=><g key={r.date}>{(i===0||i===rows.length-1||i%Math.max(1,Math.floor(rows.length/5))===0)&&<text x={48+i*(w-66)/Math.max(rows.length-1,1)} y={h+15} textAnchor="middle">{new Date(r.date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</text>}<rect x={40+i*(w-66)/Math.max(rows.length-1,1)} y="10" width={Math.max(14,(w-66)/rows.length)} height={h-20} fill="transparent" onMouseEnter={()=>setHover(i)}/></g>)}
    {hover!==null&&rows[hover]&&<circle cx={48+hover*(w-66)/Math.max(rows.length-1,1)} cy={h-18-rows[hover].scans/max*(h-40)} r="4" fill="#315642" stroke="white" strokeWidth="2"/>}
  </svg>{hover!==null&&rows[hover]&&<div className="chart-tooltip">{rows[hover].date} · {rows[hover].scans} scans · {rows[hover].handoffs} Google clicks</div>}</div>;
}
export function TextLink({children,href}:{children:ReactNode;href:string}){return <a className="text-link" href={href}>{children}<ArrowUpRight size={15}/></a>;}
