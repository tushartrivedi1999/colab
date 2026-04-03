import { getToken } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type ApiOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  auth?: boolean;
};

export const apiFetch = async <T>(path: string, options: ApiOptions = {}): Promise<T> => {
  const headers: HeadersInit = {
    "Content-Type": "application/json"
  };

  if (options.auth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};
