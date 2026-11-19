// services/account.ts
//
// The account itself, for Privacy & security: the sessions signed in to it,
// a copy of its data, and deleting it (api: AccountController).
import api from "./apiClient";

export interface AccountSession {
  id: number;
  name: string;
  /** This phone's own session. */
  current: boolean;
  last_used_at: string | null;
  created_at: string | null;
  expires_at: string | null;
}

export const AccountService = {
  async sessions(): Promise<AccountSession[]> {
    const res = await api.get<{ data: AccountSession[] }>("/auth/sessions");
    return res.data?.data ?? [];
  },

  async revokeSession(id: number): Promise<void> {
    await api.delete(`/auth/sessions/${id}`);
  },

  /** Signs out every session but this one; resolves to how many. */
  async revokeOtherSessions(): Promise<number> {
    const res = await api.delete<{ revoked: number }>("/auth/sessions");
    return res.data?.revoked ?? 0;
  },

  /** Everything the account holds, as the JSON the API exports. */
  async exportData(): Promise<string> {
    const res = await api.get("/auth/export", { responseType: "text", transformResponse: (d) => d });
    return typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2);
  },

  /**
   * Deletes the account for good: with the password, or, for a Google or
   * Apple account (no password), confirm "DELETE".
   */
  async deleteAccount(proof: { password: string } | { confirm: "DELETE" }): Promise<void> {
    await api.delete("/auth/account", { data: proof });
  },
};
