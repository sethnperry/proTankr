// lib/supabase/cookieScope.ts
//
// Which auth cookie a given host uses. Shared by the browser client
// (lib/supabase/client.ts) and the server client (lib/supabase/server.ts)
// so the two can never disagree.
//
// - www.protankr.com / protankr.com: one cookie scoped to ".protankr.com",
//   so a session set on one host exists on the other.
// - demo.protankr.com (the /for-drivers iframe demo): a host-only cookie
//   with its OWN name. A ".protankr.com" cookie would also cover this
//   subdomain, so the demo login overwrote the real account's cookie --
//   starting the demo signed the operator's installed app out and into the
//   demo account (found live 2026-09-28). The separate name matters too:
//   the browser still sends the real ".protankr.com" cookie to the demo
//   host, and with the same name the demo client could read it.
// - anything else (localhost, *.vercel.app): SDK default. A literal
//   ".protankr.com" domain is rejected by the browser there.

export const DEMO_HOST = "demo.protankr.com";

export function authCookieOptionsForHost(hostname: string): { domain?: string; name?: string } | undefined {
  const h = hostname.split(":")[0].toLowerCase();
  if (h === DEMO_HOST) return { name: "sb-demo-auth-token" };
  if (/(^|\.)protankr\.com$/.test(h)) return { domain: ".protankr.com" };
  return undefined;
}
