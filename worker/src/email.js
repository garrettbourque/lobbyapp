// All outgoing email goes through here. Until the account is on Workers Paid,
// Cloudflare only delivers to verified destination addresses; sends to anyone
// else throw, so callers treat a send as best-effort where that's acceptable.

export async function sendEmail(env, to, subject, text, fromName) {
  await env.EMAIL.send({
    to: to,
    from: { email: env.FROM_ADDRESS, name: fromName || 'LobbyApp' },
    subject: subject,
    text: text
  });
}

export async function trySendEmail(env, to, subject, text, fromName) {
  try {
    await sendEmail(env, to, subject, text, fromName);
    return true;
  } catch (e) {
    console.error('Email to ' + to + ' failed:', e && e.message);
    return false;
  }
}
