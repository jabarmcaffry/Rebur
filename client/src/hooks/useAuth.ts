import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: Infinity,
  });

  const login = async (creds: { username: string; password: string }) => {
    const res = await apiRequest("POST", "/api/login", creds);
    const json = await res.json();
    if (json.token) {
      localStorage.setItem("auth_token", json.token);
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    return json;
  };

  const register = async (creds: { email: string; password: string; firstName?: string; lastName?: string }) => {
    const res = await apiRequest("POST", "/api/register", creds);
    const json = await res.json();
    if (json.token) {
      localStorage.setItem("auth_token", json.token);
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    return json;
  };

  const logout = async () => {
    localStorage.removeItem("auth_token");
    await apiRequest("POST", "/api/logout", {});
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  };

  return {
    user: (data ?? null) as User | null,
    isAuthenticated: !!data,
    isLoading,
    error,
    login,
    register,
    logout,
  };
}
