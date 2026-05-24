import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

const TOKEN_KEY = "auth_token";

export function useAuth() {
  const { data, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
      const res = await fetch("/api/auth/user", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return await res.json();
    },
    retry: false,
    staleTime: Infinity,
  });

  const login = async (creds: { username: string; password: string }) => {
    const res = await apiRequest("POST", "/api/login", creds);
    const json = await res.json();
    if (json.token) {
      localStorage.setItem(TOKEN_KEY, json.token);
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    return json;
  };

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
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