import type { FastifyBaseLogger } from "fastify";
import { env } from "../env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Tests read sent mail from here instead of a real inbox. */
export const testOutbox: Mail[] = [];

/**
 * Sends through Resend's HTTP API when RESEND_API_KEY is set. Without it, development prints the
 * mail to the server log so a reset code can be copied from the terminal; production refuses to
 * print (the code would land in log storage) and only warns.
 */
export async function sendMail(mail: Mail, log: FastifyBaseLogger) {
  if (env.isTest) {
    testOutbox.push(mail);
    return;
  }
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") log.warn({ subject: mail.subject }, "RESEND_API_KEY is not set: email not sent");
    else log.info(`\n--- email (not sent: RESEND_API_KEY is empty) ---\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n---`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text().catch(() => "")}`);
}
