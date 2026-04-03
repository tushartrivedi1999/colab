"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../../lib/api";
import { getToken, saveToken } from "../../lib/auth";

type LocationType = "water" | "ors" | "shade";
type ProposalStatus = "pending" | "approved" | "rejected";

type DashboardLocation = {
  id: string;
  type: LocationType;
  status: ProposalStatus;
  description: string;
  lng: number;
  lat: number;
  usage_count: number;
};

type DashboardData = {
  locations: DashboardLocation[];
  usersServed: Array<{ bucket: string; users_served: number }>;
  locationsByType: Array<{ type: string; location_count: number }>;
};

type UserRow = {
  id: string;
  email: string;
  role: "admin" | "sub-admin" | "provider";
  createdAt: string;
};

const statusColors: Record<ProposalStatus, string> = {
  pending: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444"
};

const typeColors: Record<LocationType, string> = {
  water: "#3b82f6",
  ors: "#22c55e",
  shade: "#f59e0b"
};

export default function AdminDashboard() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const [token, setToken] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<LocationType | "all">("all");
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    locations: [],
    usersServed: [],
    locationsByType: []
  });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [feedback, setFeedback] = useState("Ready");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    return params.toString();
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    const saved = getToken();
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-122.4194, 37.7749],
      zoom: 10
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    mapMarkersRef.current.forEach((marker) => marker.remove());
    mapMarkersRef.current = dashboardData.locations.map((location) => {
      const marker = new mapboxgl.Marker({ color: statusColors[location.status] })
        .setLngLat([location.lng, location.lat])
        .setPopup(
          new mapboxgl.Popup().setHTML(
            `<strong>${location.type.toUpperCase()}</strong><br/>Status: ${location.status}<br/>Usage: ${location.usage_count}`
          )
        )
        .addTo(mapRef.current!);
      return marker;
    });
  }, [dashboardData.locations]);

  const loadDashboard = async () => {
    try {
      saveToken(token);
      const data = await apiFetch<DashboardData>(`/admin/dashboard${query ? `?${query}` : ""}`, {
        method: "GET",
        auth: true
      });
      setDashboardData(data);
      setFeedback(`Loaded ${data.locations.length} locations`);
    } catch {
      setFeedback("Failed to load dashboard data (admin role required)");
    }
  };

  const loadUsers = async () => {
    try {
      saveToken(token);
      const data = await apiFetch<{ users: UserRow[] }>("/admin/users", {
        method: "GET",
        auth: true
      });
      setUsers(data.users);
    } catch {
      setFeedback("Failed to load users");
    }
  };

  useEffect(() => {
    if (!token) return;
    void loadDashboard();
    void loadUsers();
  }, [query, token]);

  const updateRole = async (id: string, role: UserRow["role"]) => {
    try {
      saveToken(token);
      await apiFetch(`/admin/users/${id}/role`, {
        method: "PUT",
        body: { role },
        auth: true
      });
      await loadUsers();
      setFeedback("User role updated");
    } catch {
      setFeedback("Failed to update role");
    }
  };

  const downloadExport = async (format: "csv" | "xls") => {
    try {
      saveToken(token);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/admin/export?format=${format}`,
        {
          headers: { Authorization: `Bearer ${getToken() ?? ""}` }
        }
      );

      if (!response.ok) {
        throw new Error("Failed export");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dashboard-export.${format}`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setFeedback(`डाउनलोड complete (${format.toUpperCase()})`);
    } catch {
      setFeedback("Export failed");
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 bg-slate-100 p-4 lg:grid-cols-[2fr_1fr]">
      <section className="space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow">
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">Map, statistics, user management, and exports.</p>

          <textarea
            className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-xs"
            rows={3}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste admin JWT token"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <select className="rounded border p-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProposalStatus | "all")}>
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select className="rounded border p-2" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as LocationType | "all")}>
              <option value="all">All type</option>
              <option value="water">Water</option>
              <option value="ors">ORS</option>
              <option value="shade">Shade</option>
            </select>
            <button className="rounded bg-slate-900 px-3 py-2 text-white" onClick={loadDashboard}>Refresh</button>
            <button className="rounded bg-emerald-600 px-3 py-2 text-white" onClick={() => downloadExport("csv")}>डाउनलोड CSV</button>
            <button className="rounded bg-indigo-600 px-3 py-2 text-white" onClick={() => downloadExport("xls")}>डाउनलोड XLS</button>
          </div>
        </div>

        <div className="h-[420px] overflow-hidden rounded-2xl bg-white shadow">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-2 font-semibold">Number of users served</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardData.usersServed}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="users_served" fill="#2563eb" name="Users Served" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-2 font-semibold">Locations by type</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dashboardData.locationsByType} dataKey="location_count" nameKey="type" outerRadius={90} label>
                    {dashboardData.locationsByType.map((entry) => (
                      <Cell key={entry.type} fill={typeColors[entry.type as LocationType] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <aside className="rounded-2xl bg-white p-4 shadow">
        <h2 className="text-lg font-semibold">Manage Users</h2>
        <p className="mb-3 text-sm text-slate-500">Promote/demote users by role.</p>
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "80vh" }}>
          {users.map((user) => (
            <div key={user.id} className="rounded border p-2">
              <p className="text-sm font-medium">{user.email}</p>
              <div className="mt-2 flex items-center gap-2">
                <select
                  className="rounded border p-1 text-sm"
                  defaultValue={user.role}
                  onChange={(event) => updateRole(user.id, event.target.value as UserRow["role"])}
                >
                  <option value="provider">provider</option>
                  <option value="sub-admin">sub-admin</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-500">Status: {feedback}</p>
      </aside>
    </main>
  );
}
