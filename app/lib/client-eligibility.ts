export function isConfirmedClient(data: Record<string, unknown> | null | undefined): boolean {
  return !!data && (data.adminManagedClient === true || data.adminManagedClient === "true")
    && data.admissionStatus === "확정"
    && !["admin-client", "site-settings", "tat-session"].includes(String(data.type));
}
