export type Landmark = {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  /** Distance in meters from the search coordinate, as returned by the API. */
  dist: number;
  summary?: string;
};

const API = "https://en.wikipedia.org/w/api.php";

/** Find Wikipedia articles near a coordinate, nearest first. */
export async function findNearbyLandmarks(
  lat: number,
  lon: number,
  radiusMeters = 1000,
  limit = 20
): Promise<Landmark[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "geosearch",
    gscoord: `${lat}|${lon}`,
    gsradius: String(radiusMeters),
    gslimit: String(limit),
    format: "json",
    origin: "*",
  });

  const resp = await fetch(`${API}?${params}`);
  if (!resp.ok) throw new Error(`Wikipedia geosearch failed (${resp.status})`);
  const data = await resp.json();
  const results = data?.query?.geosearch ?? [];
  return results.map((r: any) => ({
    pageid: r.pageid,
    title: r.title,
    lat: r.lat,
    lon: r.lon,
    dist: r.dist,
  }));
}

/** Fetch the intro extract for a single Wikipedia page. */
export async function fetchExtract(pageid: number): Promise<string> {
  const map = await fetchExtracts([pageid]);
  return map[pageid] ?? "";
}

/** Fetch intro extracts for many pages in one request (chunked at 20). */
export async function fetchExtracts(
  pageids: number[]
): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (let i = 0; i < pageids.length; i += 20) {
    const chunk = pageids.slice(i, i + 20);
    const params = new URLSearchParams({
      action: "query",
      prop: "extracts",
      exintro: "1",
      explaintext: "1",
      exlimit: "20",
      pageids: chunk.join("|"),
      format: "json",
      origin: "*",
    });
    const resp = await fetch(`${API}?${params}`);
    if (!resp.ok) throw new Error(`Wikipedia extract failed (${resp.status})`);
    const data = await resp.json();
    const pages = data?.query?.pages ?? {};
    for (const key of Object.keys(pages)) {
      const page = pages[key];
      if (page?.pageid) out[page.pageid] = (page.extract ?? "").trim();
    }
  }
  return out;
}
