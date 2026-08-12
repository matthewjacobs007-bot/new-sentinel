// lib/mail.js — transactional email, via plain SMTP so it isn't locked to any
// one vendor's API (SendGrid, Postmark, Mailgun, and even Gmail all offer an
// SMTP relay with the same four settings below). Degrades gracefully when
// unconfigured — every call is fire-and-forget from the caller's side, so a
// missing/broken mail setup never breaks the request that triggered it.
import nodemailer from 'nodemailer';

export const isConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
function client() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

const FROM = () => process.env.MAIL_FROM || `Sentinel <${process.env.SMTP_USER}>`;

export async function sendMail({ to, subject, html, text }) {
  if (!isConfigured() || !to) return;
  await client().sendMail({ from: FROM(), to, subject, html, text: text || html.replace(/<[^>]+>/g, ' ') });
}

export async function notifyNewLead(lead) {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return;
  await sendMail({
    to,
    subject: `New Sentinel lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
    html: `<p><b>${lead.name}</b> (${lead.email})${lead.company ? ` — ${lead.company}` : ''} submitted the contact form.</p>
      <p><b>Platform:</b> ${lead.platform || 'not specified'}</p>
      <p><b>Message:</b><br>${(lead.message || '(none)').replace(/\n/g, '<br>')}</p>`,
  });
}

export async function sendActivationEmail(tenant, email) {
  await sendMail({
    to: email,
    subject: `${tenant.name || tenant.domain} is now active on Sentinel`,
    html: `<p>Your Sentinel subscription for <b>${tenant.name || tenant.domain}</b> is now active.</p>
      <p>Your dashboard is ready — sign in any time to review findings, export reports, and track drift over future scans.</p>`,
  });
  const admin = process.env.ADMIN_EMAIL;
  if (admin) {
    await sendMail({ to: admin, subject: `Sentinel: ${tenant.domain} activated`, html: `<p>${tenant.domain} just activated (${email}).</p>` });
  }
}

export async function notifyCancellation(tenant) {
  const admin = process.env.ADMIN_EMAIL;
  if (admin) {
    await sendMail({ to: admin, subject: `Sentinel: ${tenant.domain} cancelled`, html: `<p>${tenant.domain} cancelled their subscription.</p>` });
  }
}
