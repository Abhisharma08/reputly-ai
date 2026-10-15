import Dashboard from '@/components/dashboard';

// Guest previews never require authentication or a business organization.
// This route must remain separate from the future authenticated /app workspace.
export default async function DemoPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  return <Dashboard section={section?.[0] || 'overview'} />;
}
