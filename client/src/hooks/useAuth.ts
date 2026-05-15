import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

/**
 * Lightweight auth hook. The browser-side `/api/*` shim auto-logs the user in
 * as the seeded `test` account on first call, so this resolves quickly.
 */
export function useAuth() {
  const { data, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: Infinity,
  });

  const login = async (creds: { username: string; password: string }) => {
    const res = await apiRequest("POST", "/api/login", creds);
    const json = await res.json();
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    return json;
  };

  const logout = async () => {
    await apiRequest("POST", "/api/logout", {});
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  };

  return {
    user: (data ?? null) as User | null,
    isAuthenticated: !!data,
    isLoading,
    error,
    login,
    logout,
  };
}