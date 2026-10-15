import Customer from "@/components/customer";
import LiveCustomer from "@/components/live-customer";
export default async function CustomerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return slug.startsWith("daily-grind-demo-") || slug.startsWith("demo-") ? (
    <Customer slug={slug} />
  ) : (
    <LiveCustomer slug={slug} />
  );
}
