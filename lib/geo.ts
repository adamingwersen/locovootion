export type LatLng = { lat: number; lon: number };

const R = 6371000; // Earth radius in meters

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Total length of a polyline path in meters. */
export function pathLengthMeters(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineMeters(path[i - 1], path[i]);
  }
  return total;
}

/**
 * Resample a polyline into points spaced ~every `stepMeters` along it.
 * Each sample carries its cumulative distance from the start of the path,
 * which we use to order sights "along the walk".
 */
export function samplePath(
  path: LatLng[],
  stepMeters = 150
): { point: LatLng; distanceAlong: number }[] {
  if (path.length === 0) return [];
  if (path.length === 1) return [{ point: path[0], distanceAlong: 0 }];

  const samples: { point: LatLng; distanceAlong: number }[] = [
    { point: path[0], distanceAlong: 0 },
  ];
  let traveled = 0;
  let nextMark = stepMeters;

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const segLen = haversineMeters(a, b);
    while (nextMark <= traveled + segLen && segLen > 0) {
      const t = (nextMark - traveled) / segLen;
      samples.push({
        point: {
          lat: a.lat + (b.lat - a.lat) * t,
          lon: a.lon + (b.lon - a.lon) * t,
        },
        distanceAlong: nextMark,
      });
      nextMark += stepMeters;
    }
    traveled += segLen;
  }

  const last = path[path.length - 1];
  samples.push({ point: last, distanceAlong: traveled });
  return samples;
}

/** Distance from a point to the nearest vertex sample of a path. */
export function distanceToPath(point: LatLng, path: LatLng[]): number {
  let min = Infinity;
  for (const p of path) {
    const d = haversineMeters(point, p);
    if (d < min) min = d;
  }
  return min;
}

/** Cumulative distance along the path to the path vertex nearest `point`. */
export function distanceAlongPath(point: LatLng, path: LatLng[]): number {
  let cumulative = 0;
  let best = { dist: Infinity, along: 0 };
  for (let i = 0; i < path.length; i++) {
    if (i > 0) cumulative += haversineMeters(path[i - 1], path[i]);
    const d = haversineMeters(point, path[i]);
    if (d < best.dist) best = { dist: d, along: cumulative };
  }
  return best.along;
}
