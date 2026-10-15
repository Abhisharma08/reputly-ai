
import Link from "next/link";
import { Sparkles } from 'lucide-react';
export default function Brand({ light = false }: { light?: boolean }) { return <Link href="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="Reputly home"><span className="brand-mark"><Sparkles size={21} strokeWidth={2.3}/></span><span>reputly<span className="brand-dot">.</span></span><span className="brand-ai">AI</span></Link>; }
