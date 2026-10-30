import nodemailer from 'nodemailer';
export const mailConfigured = () => !!process.env.SMTP_HOST;
export async function sendMail(to: string, subject: string, text: string) {
  if (!mailConfigured()) return false;
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
  return true;
}
