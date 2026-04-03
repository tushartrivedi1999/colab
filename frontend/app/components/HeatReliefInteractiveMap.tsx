"use client";

import mapboxgl, { GeoJSONSource, LngLatLike, MapLayerMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";

type ServiceCategory = "water" | "ors" | "shade";
type ThemeMode = "light" | "dark";

type ServicePoint = {
  id: string;
  name: string;
  category: ServiceCategory;
  coordinates: [number, number];
  address: string;
};

type NearbyService = ServicePoint & {
  distanceKm: number;
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const SERVICE_POINTS: ServicePoint[] = [
  { id: "w1", name: "Hydration Station - Civic Center", category: "water", coordinates: [-122.4194, 37.7793], address: "1 Dr Carlton B Goodlett Pl" },
  { id: "w2", name: "Water Point - Market St", category: "water", coordinates: [-122.4106, 37.7825], address: "Market St & 5th" },
  { id: "o1", name: "ORS Center - Mission Clinic", category: "ors", coordinates: [-122.4182, 37.7594], address: "240 Shotwell St" },
  { id: "o2", name: "ORS Center - Tenderloin Hub", category: "ors", coordinates: [-122.4158, 37.7838], address: "201 Turk St" },
  { id: "s1", name: "Shade Shelter - Dolores Park", category: "shade", coordinates: [-122.4269, 37.7596], address: "Dolores St & 19th" },
  { id: "s2", name: "Shade Shelter - Embarcadero", category: "shade", coordinates: [-122.3969, 37.7955], address: "Embarcadero Plaza" }
];

const categoryStyles: Record<ServiceCategory, { color: string; icon: string; label: string }> = {
  water: { color: "#3b82f6", icon: "💧", label: "Water" },
  ors: { color: "#22c55e", icon: "➕", label: "ORS" },
  shade: { color: "#f59e0b", icon: "🌳", label: "Shade" }
};

const toFeatureCollection = (points: ServicePoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: "FeatureCollection",
  features: points.map((point) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: point.coordinates
    },
    properties: {
      id: point.id,
      name: point.name,
      category: point.category,
      address: point.address,
      color: categoryStyles[point.category].color,
      icon: categoryStyles[point.category].icon
    }
  }))
});

const haversineKm = (from: [number, number], to: [number, number]): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(to[1] - from[1]);
  const dLng = toRad(to[0] - from[0]);
  const lat1 = toRad(from[1]);
  const lat2 = toRad(to[1]);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const mapStyleForTheme = (theme: ThemeMode): string =>
  theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";

export default function HeatReliefInteractiveMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<ServiceCategory, boolean>>({ water: true, ors: true, shade: true });
  const [center, setCenter] = useState<[number, number]>([-122.4194, 37.7749]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  const filteredPoints = useMemo(() => {
    return SERVICE_POINTS.filter((point) => {
      const categoryAllowed = activeFilters[point.category];
      const matchesSearch = point.name.toLowerCase().includes(search.toLowerCase());
      return categoryAllowed && matchesSearch;
    });
  }, [activeFilters, search]);

  const nearbyServices = useMemo<NearbyService[]>(() => {
    const origin = userLocation ?? center;

    return filteredPoints
      .map((service) => ({
        ...service,
        distanceKm: haversineKm(origin, service.coordinates)
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 12);
  }, [center, filteredPoints, userLocation]);

  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_TOKEN;
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: mapStyleForTheme(theme),
      center: center as LngLatLike,
      zoom: 12,
      pitchWithRotate: false,
      dragRotate: false,
      attributionControl: false
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      map.addSource("services", {
        type: "geojson",
        data: toFeatureCollection(filteredPoints),
        cluster: true,
        clusterRadius: 55,
        clusterMaxZoom: 14
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "services",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#60a5fa", 10, "#3b82f6", 25, "#1d4ed8"],
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 25, 26],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "services",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12
        },
        paint: {
          "text-color": "#ffffff"
        }
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "services",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      });

      map.addLayer({
        id: "unclustered-icon",
        type: "symbol",
        source: "services",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "icon"],
          "text-size": 12,
          "text-offset": [0, 0.1]
        }
      });

      map.on("click", "clusters", (event: MapLayerMouseEvent) => {
        const cluster = event.features?.[0];
        if (!cluster) return;
        const clusterId = cluster.properties?.cluster_id as number;
        const source = map.getSource("services") as GeoJSONSource;

        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return;
          map.easeTo({
            center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom
          });
        });
      });

      map.on("click", "unclustered-point", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const props = feature.properties as Record<string, string>;

        new mapboxgl.Popup({ offset: 18 })
          .setLngLat(coordinates)
          .setHTML(`<div style=\"font-family:Inter,sans-serif\"><strong>${props.name}</strong><br/>${categoryStyles[props.category as ServiceCategory].label}<br/>${props.address}</div>`)
          .addTo(map);
      });

      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));

      map.on("moveend", () => {
        const nextCenter = map.getCenter();
        setCenter([nextCenter.lng, nextCenter.lat]);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(mapStyleForTheme(theme));

    mapRef.current.once("style.load", () => {
      const map = mapRef.current;
      if (!map) return;

      map.addSource("services", {
        type: "geojson",
        data: toFeatureCollection(filteredPoints),
        cluster: true,
        clusterRadius: 55,
        clusterMaxZoom: 14
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "services",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#60a5fa", 10, "#3b82f6", 25, "#1d4ed8"],
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 25, 26],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "services",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12
        },
        paint: {
          "text-color": "#ffffff"
        }
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "services",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      });

      map.addLayer({
        id: "unclustered-icon",
        type: "symbol",
        source: "services",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "icon"],
          "text-size": 12,
          "text-offset": [0, 0.1]
        }
      });
    });
  }, [theme, filteredPoints]);

  useEffect(() => {
    const source = mapRef.current?.getSource("services") as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toFeatureCollection(filteredPoints));
  }, [filteredPoints]);

  const toggleFilter = (category: ServiceCategory): void => {
    setActiveFilters((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const useMyLocation = (): void => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: [number, number] = [position.coords.longitude, position.coords.latitude];
        setUserLocation(nextLocation);
        mapRef.current?.easeTo({ center: nextLocation, zoom: 14 });

        new mapboxgl.Marker({ color: "#ef4444" })
          .setLngLat(nextLocation)
          .setPopup(new mapboxgl.Popup().setText("You are here"))
          .addTo(mapRef.current!);
      },
      () => {
        window.alert("Unable to fetch your location. Please check browser permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-100">
      <aside className="absolute left-4 top-4 z-20 h-[calc(100vh-2rem)] w-[320px] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-900">Nearby Services</h2>
        <p className="mb-3 text-xs text-slate-500">Sorted by proximity to map center / your GPS location.</p>
        <div className="space-y-2">
          {nearbyServices.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">No services match current filters.</p>
          ) : (
            nearbyServices.map((service) => (
              <button
                key={service.id}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm"
                onClick={() => mapRef.current?.easeTo({ center: service.coordinates, zoom: 15 })}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-800">{service.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{service.distanceKm.toFixed(2)} km</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{categoryStyles[service.category].label} • {service.address}</p>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="absolute left-1/2 top-4 z-20 w-[min(680px,calc(100%-380px))] -translate-x-1/2 px-2">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-lg">
          <span className="text-slate-500">🔍</span>
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search water points, ORS centers, shade shelters"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-full border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur">
        {(Object.keys(categoryStyles) as ServiceCategory[]).map((category) => {
          const active = activeFilters[category];
          return (
            <button
              key={category}
              onClick={() => toggleFilter(category)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                active ? "text-white shadow" : "bg-slate-100 text-slate-600"
              }`}
              style={{ backgroundColor: active ? categoryStyles[category].color : undefined }}
            >
              {categoryStyles[category].icon} {categoryStyles[category].label}
            </button>
          );
        })}
      </div>

      <div className="absolute right-4 top-4 z-20 flex gap-2">
        <button
          onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg hover:bg-slate-50"
        >
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>
        <button
          onClick={useMyLocation}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg hover:bg-slate-50"
        >
          📍 Use My Location
        </button>
      </div>

      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
