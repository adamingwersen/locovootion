"use client";

import { useEffect } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/geo";

export type Sight = { lat: number; lon: number; title: string; order: number };

type Props = {
  mode: "pin" | "route";
  center: LatLng;
  pin: LatLng | null;
  path: LatLng[];
  sights: Sight[];
  userLocation: LatLng | null;
  activeSight: number | null;
  onMapClick: (latlng: LatLng) => void;
};

const pinIcon = L.divIcon({
  className: "",
  html: `<div class="map-pin"><div class="map-pin-dot"></div></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

const userIcon = L.divIcon({
  className: "",
  html: `<div class="map-user"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function waypointIcon(n: number) {
  return L.divIcon({
    className: "",
    html: `<div class="map-waypoint">${n}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function sightIcon(order: number, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="map-sight${active ? " active" : ""}"><span>${order}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}

function ClickHandler({ onMapClick }: { onMapClick: (l: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

function Recenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.lat, center.lon], map.getZoom(), { duration: 0.8 });
  }, [center, map]);
  return null;
}

export default function MapView({
  mode,
  center,
  pin,
  path,
  sights,
  userLocation,
  activeSight,
  onMapClick,
}: Props) {
  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={15}
      zoomControl={false}
      className="leaflet-root"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        maxZoom={20}
      />

      <ClickHandler onMapClick={onMapClick} />
      <Recenter center={center} />

      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lon]}
          icon={userIcon}
        />
      )}

      {mode === "pin" && pin && (
        <Marker position={[pin.lat, pin.lon]} icon={pinIcon} />
      )}

      {mode === "route" && path.length > 0 && (
        <>
          <Polyline
            positions={path.map((p) => [p.lat, p.lon])}
            pathOptions={{ color: "#6ea8fe", weight: 5, opacity: 0.9 }}
          />
          {path.map((p, i) => (
            <Marker
              key={`wp-${i}`}
              position={[p.lat, p.lon]}
              icon={waypointIcon(i + 1)}
            />
          ))}
        </>
      )}

      {sights.map((s) => (
        <Marker
          key={`sight-${s.order}`}
          position={[s.lat, s.lon]}
          icon={sightIcon(s.order, activeSight === s.order)}
        />
      ))}
    </MapContainer>
  );
}
