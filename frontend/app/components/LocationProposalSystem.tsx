"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getToken, saveToken } from "../../lib/auth";
import { getDeviceLocation, isNativeMobile, scanIncrementQrPayload } from "../../lib/mobile";

type LocationType = "water" | "ors" | "shade";
type ProposalStatus = "pending" | "approved" | "rejected";

type LocationProposal = {
  id: string;
  type: LocationType;
  description: string;
  status: ProposalStatus;
  lat: number;
  lng: number;
  created_at: string;
  usage_count: number;
  review_note?: string;
};

type LocationsResponse = {
  locations: LocationProposal[];
};

type UsageSummaryResponse = {
  period: "daily" | "weekly";
  byLocation: Array<{
    location_id: string;
    type: LocationType;
    status: ProposalStatus;
    total_usage: number;
    last_24h_usage: number;
    last_7d_usage: number;
  }>;
  timeline: Array<{
    bucket_start: string;
    usage_count: number;
  }>;
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const typeColors: Record<LocationType, string> = {
  water: "#3b82f6",
  ors: "#22c55e",
  shade: "#f59e0b"
};

const statusClasses: Record<ProposalStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800"
};

export default function LocationProposalSystem() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const providerMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const locationMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const [token, setToken] = useState("");
  const [type, setType] = useState<LocationType>("water");
  const [description, setDescription] = useState("");
  const [pickedLat, setPickedLat] = useState<number>(37.7749);
  const [pickedLng, setPickedLng] = useState<number>(-122.4194);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<LocationType | "all">("all");
  const [locations, setLocations] = useState<LocationProposal[]>([]);
  const [feedback, setFeedback] = useState("Ready");
  const [usagePeriod, setUsagePeriod] = useState<"daily" | "weekly">("daily");
  const [usageSummary, setUsageSummary] = useState<UsageSummaryResponse | null>(null);
  const [platformLabel, setPlatformLabel] = useState("Web");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    return params.toString();
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    const saved = getToken();
    if (saved) setToken(saved);
    setPlatformLabel(isNativeMobile() ? "Capacitor Native" : "Web Browser");
  }, []);

  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_TOKEN;
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [pickedLng, pickedLat],
      zoom: 11
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    mapRef.current.on("click", (event) => {
      const { lng, lat } = event.lngLat;
      setPickedLng(lng);
      setPickedLat(lat);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pickedLat, pickedLng]);

  useEffect(() => {
    if (!mapRef.current) return;

    providerMarkerRef.current?.remove();
    providerMarkerRef.current = new mapboxgl.Marker({ color: "#111827" })
      .setLngLat([pickedLng, pickedLat])
      .setPopup(new mapboxgl.Popup().setText("Selected proposal location"))
      .addTo(mapRef.current);
  }, [pickedLat, pickedLng]);

  useEffect(() => {
    if (!mapRef.current) return;

    locationMarkersRef.current.forEach((marker) => marker.remove());
    locationMarkersRef.current = locations.map((location) => {
      const marker = new mapboxgl.Marker({ color: typeColors[location.type] })
        .setLngLat([location.lng, location.lat])
        .setPopup(
          new mapboxgl.Popup().setHTML(
            `<strong>${location.type.toUpperCase()}</strong><br/>Status: ${location.status}<br/>Usage: ${location.usage_count}<br/>${location.description}`
          )
        )
        .addTo(mapRef.current!);

      return marker;
    });
  }, [locations]);

  const loadLocations = async () => {
    try {
      const data = await apiFetch<LocationsResponse>(`/locations${query ? `?${query}` : ""}`);
      setLocations(data.locations);
      setFeedback(`Loaded ${data.locations.length} location proposals`);
    } catch {
      setFeedback("Failed to load locations");
    }
  };

  const loadUsageSummary = async () => {
    try {
      saveToken(token);
      const data = await apiFetch<UsageSummaryResponse>(`/locations/usage/aggregation?period=${usagePeriod}`, {
        method: "GET",
        auth: true
      });
      setUsageSummary(data);
      setFeedback(`Loaded ${usagePeriod} usage summary`);
    } catch {
      setFeedback("Unable to load usage summary (admin role required)");
    }
  };

  useEffect(() => {
    void loadLocations();
  }, [query]);

  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      saveToken(token);
      await apiFetch<{ proposal: LocationProposal }>("/locations", {
        method: "POST",
        body: { lat: pickedLat, lng: pickedLng, type, description },
        auth: true
      });
      setDescription("");
      setFeedback("Proposal submitted with pending status");
      await loadLocations();
    } catch {
      setFeedback("Failed to submit proposal (check JWT token/role)");
    }
  };

  const reviewProposal = async (id: string, decision: "approve" | "reject") => {
    try {
      saveToken(token);
      await apiFetch(`/locations/${id}/${decision}`, {
        method: "PUT",
        body: { note: decision === "approve" ? "Approved by admin" : "Rejected by admin" },
        auth: true
      });
      setFeedback(`Proposal ${decision}d`);
      await loadLocations();
    } catch {
      setFeedback(`Failed to ${decision} proposal (admin role required)`);
    }
  };

  const incrementUsage = async (id: string, qr = false) => {
    try {
      await apiFetch<{ usageCount: number }>(`/locations/${id}/increment${qr ? "/qr" : ""}`, {
        method: "POST"
      });

      setLocations((prev) =>
        prev.map((location) =>
          location.id === id
            ? {
                ...location,
                usage_count: location.usage_count + 1
              }
            : location
        )
      );

      setFeedback(`Usage counter incremented${qr ? " via QR" : ""}`);
    } catch {
      setFeedback("Failed to increment usage");
    }
  };

  const useMyCurrentLocation = async () => {
    try {
      const position = await getDeviceLocation();
      setPickedLat(position.lat);
      setPickedLng(position.lng);
      mapRef.current?.easeTo({
        center: [position.lng, position.lat],
        zoom: 14
      });
      setFeedback("Device GPS location applied to proposal picker");
    } catch {
      setFeedback("Unable to access device GPS location");
    }
  };

  const incrementUsageFromQrScan = async () => {
    try {
      const payload = await scanIncrementQrPayload();
      if (!payload) {
        setFeedback("QR scan cancelled");
        return;
      }

      const matchedLocation = locations.find((location) => location.id === payload);

      if (!matchedLocation) {
        setFeedback("QR value does not match any visible location ID");
        return;
      }

      await incrementUsage(matchedLocation.id, true);
    } catch {
      setFeedback("QR scanner was denied or unavailable");
    }
  };

  return (
    <main className="grid h-screen w-screen grid-cols-1 lg:grid-cols-[420px_1fr] bg-slate-100">
      <section className="overflow-y-auto border-r border-slate-200 bg-white p-5">
        <h1 className="text-xl font-semibold">Location Proposal + Usage Counter</h1>
        <p className="mt-1 text-sm text-slate-500">Providers submit geo-tagged proposals. Admin reviews status and analytics.</p>
        <p className="mt-1 text-xs font-medium text-indigo-600">Runtime: {platformLabel}</p>

        <form className="mt-5 space-y-3" onSubmit={submitProposal}>
          <label className="block text-sm font-medium">JWT token</label>
          <textarea
            className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            rows={3}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste JWT token"
            required
          />

          <label className="block text-sm font-medium">Type</label>
          <select
            className="w-full rounded-lg border border-slate-300 p-2"
            value={type}
            onChange={(event) => setType(event.target.value as LocationType)}
          >
            <option value="water">Water</option>
            <option value="ors">ORS</option>
            <option value="shade">Shade</option>
          </select>

          <label className="block text-sm font-medium">Description</label>
          <textarea
            className="w-full rounded-lg border border-slate-300 p-2"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            minLength={10}
            placeholder="Provide details about access, timing, and capacity"
            required
          />

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="font-medium">Latitude</p>
              <p className="rounded bg-slate-100 px-2 py-1">{pickedLat.toFixed(6)}</p>
            </div>
            <div>
              <p className="font-medium">Longitude</p>
              <p className="rounded bg-slate-100 px-2 py-1">{pickedLng.toFixed(6)}</p>
            </div>
          </div>

          <button
            type="button"
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={useMyCurrentLocation}
          >
            Use My Location (GPS)
          </button>

          <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            Submit Proposal (Pending)
          </button>
        </form>

        <div className="mt-6 flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-slate-300 p-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ProposalStatus | "all")}
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            className="rounded-lg border border-slate-300 p-2 text-sm"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as LocationType | "all")}
          >
            <option value="all">All types</option>
            <option value="water">Water</option>
            <option value="ors">ORS</option>
            <option value="shade">Shade</option>
          </select>

          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50" onClick={loadLocations}>
            Refresh
          </button>
          <button className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-100" onClick={incrementUsageFromQrScan}>
            Scan QR to Increment
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <h2 className="text-sm font-semibold">Admin Usage Aggregation</h2>
          <div className="mt-2 flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 p-2 text-sm"
              value={usagePeriod}
              onChange={(event) => setUsagePeriod(event.target.value as "daily" | "weekly")}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <button className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-white" onClick={loadUsageSummary}>
              Load Counts
            </button>
          </div>
          {usageSummary && (
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              <p>Locations in summary: {usageSummary.byLocation.length}</p>
              <p>Timeline points: {usageSummary.timeline.length}</p>
            </div>
          )}
        </div>

        <p className="mt-3 text-sm text-slate-500">Status: {feedback}</p>

        <div className="mt-4 space-y-2">
          {locations.map((location) => (
            <article key={location.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-slate-800">{location.type.toUpperCase()}</h3>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClasses[location.status]}`}>
                  {location.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{location.description}</p>
              <p className="mt-1 text-xs text-slate-400">
                {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
              </p>
              <p className="mt-1 text-xs font-medium text-blue-700">Live usage count: {location.usage_count}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
                  onClick={() => incrementUsage(location.id)}
                >
                  +1 Usage
                </button>
                <button
                  className="rounded-md bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700"
                  onClick={() => incrementUsage(location.id, true)}
                >
                  +1 via QR
                </button>
                <button
                  className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                  onClick={() => reviewProposal(location.id, "approve")}
                >
                  Approve
                </button>
                <button
                  className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                  onClick={() => reviewProposal(location.id, "reject")}
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="relative">
        <div className="absolute left-4 top-4 z-10 rounded-lg bg-white/95 px-3 py-2 text-xs shadow">
          Click map to pick a provider location.
        </div>
        <div ref={mapContainerRef} className="h-full w-full" />
      </section>
    </main>
  );
}
