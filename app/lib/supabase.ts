const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function config() {
  if (!url || !serviceKey) throw new Error("Supabase is not configured.");
  return { url, serviceKey };
}

export async function supabaseServiceRequest(path: string, init: RequestInit = {}) {
  const current = config();
  const response = await fetch(current.url + path, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: current.serviceKey,
      Authorization: `Bearer ${current.serviceKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response;
}

export async function verifyAdmin(accessToken: string | undefined) {
  if (!accessToken || !url || !process.env.SUPABASE_ANON_KEY) return false;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) return false;
  const user = await response.json();
  const allowed = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(allowed && user.email?.toLowerCase() === allowed);
}
