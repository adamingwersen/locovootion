"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Sight } from "@/components/MapView";
import { findNearbyLandmarks, fetchExtract, fetchExtracts } from "@/lib/wikipedia";
import {
  distanceAlongPath,
  distanceToPath,
  pathLengthMeters,
  samplePath,
  type LatLng,
} from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

const COPENHAGEN: LatLng = { lat: 55.6761, lon: 12.5683 };

type Mode = "pin" | "route";

type Segment = {
  title: string;
  narration: string;
  lat?: number;
  lon?: number;
};

export default function Home() {
  const [mode, setMode] = useState<Mode>("pin");
  const [center, setCenter] = useState<LatLng>(COPENHAGEN);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pin-mode narration result.
  const [pinResult, setPinResult] = useState<{ title: string; script: string } | null>(
    null
  );

  // Route-mode tour.
  const [tour, setTour] = useState<{
    minutes: number;
    segments: Segment[];
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());

  const sights: Sight[] = useMemo(() => {
    if (mode === "route" && tour) {
      return tour.segments
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => typeof s.lat === "number" && typeof s.lon === "number")
        .map(({ s, i }) => ({
          lat: s.lat as number,
          lon: s.lon as number,
          title: s.title,
          order: i + 1,
        }));
    }
    return [];
  }, [mode, tour]);

  const resetForMode = useCallback((m: Mode) => {
    setMode(m);
    setError(null);
    stopPlayback();
    if (m === "pin") {
      setTour(null);
      setActiveIndex(null);
    } else {
      setPin(null);
      setPinResult(null);
    }
  }, []);

  const onMapClick = useCallback(
    (latlng: LatLng) => {
      setError(null);
      if (mode === "pin") {
        setPin(latlng);
        setPinResult(null);
      } else {
        setPath((prev) => [...prev, latlng]);
      }
    },
    [mode]
  );

  const locateMe = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation isn't supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setUserLocation(here);
        setCenter(here);
        if (mode === "pin") setPin(here);
      },
      (err) => setError(`Location error: ${err.message}`),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [mode]);

  // ---------- Audio ----------
  function stopPlayback() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
  }

  const synthesize = useCallback(async (key: string, text: string) => {
    const cached = audioCache.current.get(key);
    if (cached) return cached;
    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.detail || e.error || "Voice synthesis failed");
    }
    const url = URL.createObjectURL(await resp.blob());
    audioCache.current.set(key, url);
    return url;
  }, []);

  const playSegment = useCallback(
    async (index: number) => {
      if (!tour) return;
      const seg = tour.segments[index];
      if (!seg) return;
      setActiveIndex(index);
      if (seg.lat && seg.lon) setCenter({ lat: seg.lat, lon: seg.lon });
      try {
        setPlaying(true);
        const url = await synthesize(`seg-${index}`, seg.narration);
        const audio = audioRef.current;
        if (!audio) return;
        audio.src = url;
        audio.onended = () => {
          if (index + 1 < tour.segments.length) {
            playSegment(index + 1);
          } else {
            setPlaying(false);
          }
        };
        await audio.play();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Playback failed");
        setPlaying(false);
      }
    },
    [tour, synthesize]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else if (audio.src && audio.currentTime > 0 && !audio.ended) {
      audio.play();
      setPlaying(true);
    } else {
      playSegment(activeIndex ?? 0);
    }
  }, [playing, playSegment, activeIndex]);

  // ---------- Pin narration ----------
  const narratePin = useCallback(async () => {
    if (!pin) return;
    setLoading(true);
    setError(null);
    setPinResult(null);
    try {
      const found = await findNearbyLandmarks(pin.lat, pin.lon, 600, 10);
      if (!found.length) {
        throw new Error("No notable landmarks found near this spot. Try another pin.");
      }
      const nearest = found[0];
      const summary = await fetchExtract(nearest.pageid).catch(() => "");
      const resp = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nearest.title,
          summary,
          distanceMeters: nearest.dist,
          city: "Copenhagen",
        }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || e.error || "Narration failed");
      }
      const { script } = await resp.json();
      setPinResult({ title: nearest.title, script });
      const url = await synthesize(`pin-${nearest.pageid}`, script);
      const audio = audioRef.current;
      if (audio) {
        audio.src = url;
        audio.onended = null;
        await audio.play().catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [pin, synthesize]);

  // ---------- Route tour ----------
  const generateTour = useCallback(async () => {
    if (path.length < 2) return;
    setLoading(true);
    setError(null);
    setTour(null);
    setActiveIndex(null);
    stopPlayback();
    audioCache.current.clear();

    try {
      const samples = samplePath(path, 150).slice(0, 24);
      const found = await Promise.all(
        samples.map((s) =>
          findNearbyLandmarks(s.point.lat, s.point.lon, 250, 8).catch(() => [])
        )
      );

      const byId = new Map<
        number,
        { pageid: number; title: string; lat: number; lon: number }
      >();
      for (const list of found) {
        for (const l of list) {
          if (!byId.has(l.pageid)) {
            byId.set(l.pageid, {
              pageid: l.pageid,
              title: l.title,
              lat: l.lat,
              lon: l.lon,
            });
          }
        }
      }
      if (byId.size === 0) {
        throw new Error("No landmarks found along this route. Try drawing through the city center.");
      }

      const unique = [...byId.values()];
      const extracts = await fetchExtracts(unique.map((u) => u.pageid)).catch(
        () => ({} as Record<number, string>)
      );

      const candidates = unique
        .map((u) => ({
          pageid: u.pageid,
          title: u.title,
          lat: u.lat,
          lon: u.lon,
          distanceAlong: distanceAlongPath({ lat: u.lat, lon: u.lon }, path),
          distanceFromPath: distanceToPath({ lat: u.lat, lon: u.lon }, path),
          summary: extracts[u.pageid] ?? "",
        }))
        .sort((a, b) => a.distanceFromPath - b.distanceFromPath)
        .slice(0, 30);

      const resp = await fetch("/api/route-tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: candidates.map(({ lat, lon, ...rest }) => rest),
          pathLengthMeters: pathLengthMeters(path),
          city: "Copenhagen",
        }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.detail || e.error || "Tour generation failed");
      }
      const data: {
        sights: { title: string; narration: string }[];
        estimatedMinutes: number;
      } = await resp.json();

      const coordFor = (title: string) => {
        const exact = candidates.find((c) => c.title === title);
        if (exact) return { lat: exact.lat, lon: exact.lon };
        const fuzzy = candidates.find(
          (c) =>
            c.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(c.title.toLowerCase())
        );
        return fuzzy ? { lat: fuzzy.lat, lon: fuzzy.lon } : {};
      };

      const segments: Segment[] = data.sights.map((s) => ({
        title: s.title,
        narration: s.narration,
        ...coordFor(s.title),
      }));

      setTour({ minutes: data.estimatedMinutes, segments });
      setActiveIndex(0);
      const first = segments.find((s) => s.lat && s.lon);
      if (first?.lat && first?.lon) setCenter({ lat: first.lat, lon: first.lon });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [path]);

  // ---------- Render ----------
  const routeMeters = useMemo(() => pathLengthMeters(path), [path]);

  return (
    <div className="map-shell">
      <MapView
        mode={mode}
        center={center}
        pin={pin}
        path={path}
        sights={sights}
        userLocation={userLocation}
        activeSight={activeIndex !== null ? activeIndex + 1 : null}
        onMapClick={onMapClick}
      />

      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">🧭</div>
          <div>
            <div className="brand-name">Locovotion</div>
            <div className="brand-sub">AI walking guide · Copenhagen</div>
          </div>
        </div>
        <div className="segmented">
          <button
            className={mode === "pin" ? "active" : ""}
            onClick={() => resetForMode("pin")}
          >
            Pin
          </button>
          <button
            className={mode === "route" ? "active" : ""}
            onClick={() => resetForMode("route")}
          >
            Route
          </button>
        </div>
      </div>

      <div className="fab-col">
        <button className="fab" onClick={locateMe} title="Find my location">
          ◎
        </button>
      </div>

      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-scroll">
          {error && <div className="error">{error}</div>}

          {mode === "pin" && (
            <>
              {!pin && !pinResult && (
                <div className="hint">
                  <span>
                    <span className="kbd">Tap the map</span> to drop a pin
                    anywhere, and I&apos;ll tell you the story of that spot.
                  </span>
                </div>
              )}
              {pin && !pinResult && (
                <button className="btn" onClick={narratePin} disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner" /> Researching this spot…
                    </>
                  ) : (
                    "Tell me about here"
                  )}
                </button>
              )}
              {pinResult && (
                <div className="narration">
                  <h2>{pinResult.title}</h2>
                  <p className="script">{pinResult.script}</p>
                  <div className="btn-row">
                    <button
                      className="btn ghost"
                      onClick={() => audioRef.current?.play()}
                    >
                      ▶ Replay
                    </button>
                    <button
                      className="btn"
                      onClick={narratePin}
                      disabled={loading}
                    >
                      {loading ? <span className="spinner" /> : "Pick again"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === "route" && (
            <>
              {!tour && (
                <>
                  <div className="hint">
                    <span>
                      <span className="kbd">Tap to drop waypoints</span> and
                      trace a walk. I&apos;ll find the key sights along it and
                      narrate them at a slow strolling pace.
                    </span>
                  </div>
                  {path.length > 0 && (
                    <div className="meta-row">
                      <span>
                        <strong>{path.length}</strong> waypoints
                      </span>
                      <span>
                        <strong>{Math.round(routeMeters)}</strong> m ·{" "}
                        <strong>~{Math.round(routeMeters / 50)}</strong> min
                        stroll
                      </span>
                    </div>
                  )}
                  <div className="btn-row">
                    <button
                      className="btn ghost"
                      onClick={() => setPath((p) => p.slice(0, -1))}
                      disabled={path.length === 0 || loading}
                    >
                      Undo
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => setPath([])}
                      disabled={path.length === 0 || loading}
                    >
                      Clear
                    </button>
                  </div>
                  <button
                    className="btn"
                    onClick={generateTour}
                    disabled={path.length < 2 || loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner" /> Curating your walk…
                      </>
                    ) : (
                      "Generate guided walk"
                    )}
                  </button>
                </>
              )}

              {tour && (
                <>
                  <div className="meta-row">
                    <span>
                      <strong>{tour.segments.length}</strong> stops
                    </span>
                    <span>
                      ~<strong>{tour.minutes}</strong> min sluggish stroll
                    </span>
                    <button
                      className="btn ghost"
                      style={{ width: "auto", marginLeft: "auto", padding: "8px 12px" }}
                      onClick={() => {
                        setTour(null);
                        setActiveIndex(null);
                        stopPlayback();
                      }}
                    >
                      New route
                    </button>
                  </div>

                  <div className="transport">
                    <button
                      className="step"
                      onClick={() => playSegment(Math.max(0, (activeIndex ?? 0) - 1))}
                      disabled={(activeIndex ?? 0) <= 0}
                    >
                      ⏮
                    </button>
                    <button className="play" onClick={togglePlay}>
                      {playing ? "⏸" : "▶"}
                    </button>
                    <button
                      className="step"
                      onClick={() =>
                        playSegment(
                          Math.min(tour.segments.length - 1, (activeIndex ?? 0) + 1)
                        )
                      }
                      disabled={(activeIndex ?? 0) >= tour.segments.length - 1}
                    >
                      ⏭
                    </button>
                    <div className="now">
                      <div className="lbl">Now playing</div>
                      <div className="ttl">
                        {activeIndex !== null
                          ? tour.segments[activeIndex]?.title
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <p className="section-label">Your walk</p>
                  <ul className="segments">
                    {tour.segments.map((s, i) => (
                      <li key={i}>
                        <button
                          className={`segment${activeIndex === i ? " active" : ""}`}
                          onClick={() => playSegment(i)}
                        >
                          <span className="num">{i + 1}</span>
                          <span>
                            <span className="seg-title">{s.title}</span>
                            <span className="seg-preview">{s.narration}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} hidden />
    </div>
  );
}
