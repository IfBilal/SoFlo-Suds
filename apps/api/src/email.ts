import nodemailer from 'nodemailer';

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM && process.env.APP_RESET_URL);
}

export async function sendPasswordReset(email: string, token: string) {
  if (!isEmailConfigured()) throw new Error('Password reset email is not configured');

  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid port');

  const url = new URL(process.env.APP_RESET_URL!);
  url.searchParams.set('token', token);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM!,
    to: email,
    subject: 'Reset your SoFlo Suds password',
    text: `Use this link to reset your SoFlo Suds password. It expires in 30 minutes.\n\n${url.toString()}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Use this link to reset your SoFlo Suds password. It expires in 30 minutes.</p><p><a href="${url.toString()}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
}
