import { supabaseAdminRequest } from "./supabase";

const SETTINGS_STATUS = "__AUDE_SITE_SETTINGS__";

type SettingsRow = {
  id: string;
  data: Record<string, unknown> | null;
};

export async function getCounselingOpen() {
  const response = await supabaseAdminRequest(
    `/rest/v1/counseling_requests?status=eq.${encodeURIComponent(SETTINGS_STATUS)}&select=id,data&limit=1`,
  );
  const rows = (await response.json()) as SettingsRow[];
  return rows[0]?.data?.counselingOpen !== false;
}

export async function setCounselingOpen(counselingOpen: boolean) {
  const response = await supabaseAdminRequest(
    `/rest/v1/counseling_requests?status=eq.${encodeURIComponent(SETTINGS_STATUS)}&select=id,data&limit=1`,
  );
  const rows = (await response.json()) as SettingsRow[];
  const current = rows[0];
  const data = {
    ...(current?.data || {}),
    type: "site-settings",
    counselingOpen,
    updatedAt: new Date().toISOString(),
  };

  if (current) {
    await supabaseAdminRequest(`/rest/v1/counseling_requests?id=eq.${encodeURIComponent(current.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: SETTINGS_STATUS, data }),
    });
  } else {
    await supabaseAdminRequest("/rest/v1/counseling_requests", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: SETTINGS_STATUS, data }),
    });
  }
}

export { SETTINGS_STATUS };
