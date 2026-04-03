"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";

type ReliefSite = {
  id: string;
  name: string;
  category: "cooling_center" | "hydration" | "medical" | "shade";
  lat: number;
  lng: number;
  address?: string;
  distance_m?: number;
};

type Props = {
  sites: ReliefSite[];
};

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export default function HeatReliefMap({ sites }: Props) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors"
          }
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm"
          }
        ]
      },
      center: [-122.4194, 37.7749],
      zoom: 11
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    document.querySelectorAll(".mapboxgl-marker").forEach((node) => node.remove());

    sites.forEach((site) => {
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<div style="font-family:Inter,sans-serif"><strong>${site.name}</strong><br/>${site.category}<br/>${
          site.address ?? "Address unavailable"
        }</div>`
      );

      new mapboxgl.Marker({ color: "#1d4ed8" }).setLngLat([site.lng, site.lat]).setPopup(popup).addTo(mapRef.current!);
    });
  }, [sites]);

  return <div ref={mapContainer} className="h-[60vh] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-lg" />;
}
