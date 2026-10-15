import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Reputly — Every experience has a voice', description: 'Branded QR codes, thoughtful review assistance, and a clearer picture of customer engagement. Optional AI editing with customer control.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
