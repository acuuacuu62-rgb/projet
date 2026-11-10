import nodemailer from "nodemailer";
export function emailConfigured() {
  return !!(process.env.SMTP_URL || process.env.RESEND_API_KEY);
}
export async function sendEmail(to: string, subject: string, text: string) {
  const from = process.env.MAIL_FROM || "ZetaInstall <noreply@example.com>";
  if (process.env.SMTP_URL) {
    await nodemailer
      .createTransport(process.env.SMTP_URL, {
        disableFileAccess: true,
        disableUrlAccess: true,
      })
      .sendMail({ from, to, subject, text });
    return;
  }
  if (process.env.RESEND_API_KEY) {
    const response = await fetch(
      (process.env.RESEND_BASE_URL || "https://api.resend.com").replace(
        /\/$/,
        "",
      ) + "/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
    if (!response.ok) throw new Error("Email provider rejected delivery");
    return;
  }
  throw new Error(
    "Configure SMTP_URL or RESEND_API_KEY on the persistent backend.",
  );
}
