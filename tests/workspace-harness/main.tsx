// Browser-only fixture. No auth bypass or fixture route is shipped in the app.
import { createRoot } from "react-dom/client";
import LiveWorkspace from "../../components/live-workspace";
import "../../app/globals.css";
const org = "10000000-0000-4000-8000-000000000001";
createRoot(document.getElementById("root")!).render(<LiveWorkspace section={new URLSearchParams(location.search).get("section") || "nfc"} identity={{ user: { id: "10000000-0000-4000-8000-000000000002", name: "Test Owner" }, memberships: [{ organization_id: org, user_id: "10000000-0000-4000-8000-000000000002", role: "organization_admin", accepted_at: "2026-10-15", organizations: { id: org, name: "Test Workspace", country_code: "IN", default_locale: "en", status: "active", created_at: "2026-10-15" } }] }} />);
