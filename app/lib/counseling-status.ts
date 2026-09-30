import { supabaseAdminRequest } from "./supabase";

const SETTINGS_STATUS = "종결";

type SettingsRow = {
  id: string;
  data: Record<string, unknown> | null;
};

export async function getCounselingOpen() {
  const response = await supabaseAdminRequest(
    `/rest/v1/counseling_requests?status=eq.${encodeURIComponent(SETTINGS_STATUS)}&select=id,data&limit=1000`,
  );
  const rows = (await response.json()) as SettingsRow[];
  const settings = rows.find((row) => row.data?.type === "site-settings");
  return settings?.data?.counselingOpen !== false;
}

export async function setCounselingOpen(counselingOpen: boolean) {
  const response = await supabaseAdminRequest(
    `/rest/v1/counseling_requests?status=eq.${encodeURIComponent(SETTINGS_STATUS)}&select=id,data&limit=1000`,
  );
  const rows = (await response.json()) as SettingsRow[];
  const current = rows.find((row) => row.data?.type === "site-settings");
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
