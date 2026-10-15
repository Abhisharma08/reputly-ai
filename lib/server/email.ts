import { ApiError, requiredEnv } from "./config";
export async function sendInvitation(email: string, link: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: requiredEnv("EMAIL_FROM"),
      to: [email],
      subject: "You’re invited to a Reputly workspace",
      text: `You have been invited as a location manager. Sign in with this email and accept your invitation: ${link}\n\nThis link expires in seven days. If you were not expecting it, ignore this message.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new ApiError(
      "EMAIL_UNAVAILABLE",
      503,
      "The invitation was created, but its email could not be sent. Generate a new invitation to retry.",
    );
  return true;
}
