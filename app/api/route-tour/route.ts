import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Candidate = {
  pageid: number;
  title: string;
  distanceAlong: number; // meters from start of route
  distanceFromPath: number; // meters off the route line
  summary?: string;
};

type Body = {
  candidates: Candidate[];
  pathLengthMeters: number;
  city?: string;
};

// Sluggish stroll: ~3 km/h ≈ 50 meters per minute.
const METERS_PER_MIN = 50;

const TOOL = {
  name: "present_tour",
  description:
    "Return the curated, ordered walking tour as narration segments, one per chosen sight.",
  input_schema: {
    type: "object" as const,
    properties: {
      sights: {
        type: "array",
        description:
          "Chosen sights in walking order (by distance along the route).",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "The sight's name." },
            narration: {
              type: "string",
              description:
                "Spoken-aloud narration for this leg of the walk. Plain prose, no markdown.",
            },
          },
          required: ["title", "narration"],
        },
      },
    },
    required: ["sights"],
  },
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set" },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { candidates, pathLengthMeters, city = "Copenhagen" } = body;
  if (!candidates?.length) {
    return NextResponse.json(
      { error: "No candidate sights provided" },
      { status: 400 }
    );
  }

  const totalMin = Math.round(pathLengthMeters / METERS_PER_MIN);

  const system = [
    "You are a master local walking-tour guide and a sharp curator.",
    "You are given a list of candidate landmarks found along a route the walker has drawn, each with how far along the route it sits (in meters from the start) and how far it lies off the path.",
    "FIRST, curate: choose only the genuinely important or fascinating sights — the ones a thoughtful guide would never skip. Drop the trivial, the redundant, and the far-off-route. Aim for between 4 and 8 sights for a normal walk; fewer for a short one. Never pad.",
    "THEN, order them by their distance along the route, so the tour unfolds as the walker actually moves.",
    "WRITE narration meant to be SPOKEN ALOUD by a text-to-speech voice: plain prose only — no markdown, no headings, no lists, no emoji, no stage directions.",
    `PACE it for a sluggish stroll of about ${METERS_PER_MIN} meters per minute. Between sights, add a gentle transition that tells the walker roughly how far and how many minutes of ambling until the next stop, and what to notice on the way. Use the distance-along figures to compute these gaps.`,
    "The first segment should warmly welcome the walker and set the scene. The last should gracefully conclude the walk.",
    "Each segment should be vivid and concrete — a real story or surprising detail, around 90 to 150 words. Ground what you say in the reference facts; do not invent specifics.",
    "Return your answer only via the present_tour tool.",
  ].join(" ");

  const candidateList = candidates
    .sort((a, b) => a.distanceAlong - b.distanceAlong)
    .map((c) => {
      const facts = (c.summary ?? "").slice(0, 500);
      return [
        `• ${c.title}`,
        `   ${Math.round(c.distanceAlong)} m along the route, ${Math.round(
          c.distanceFromPath
        )} m off the path`,
        facts ? `   facts: ${facts}` : `   facts: (none available)`,
      ].join("\n");
    })
    .join("\n");

  const user = [
    `City: ${city}.`,
    `The walker drew a route about ${Math.round(
      pathLengthMeters
    )} meters long — roughly a ${totalMin}-minute sluggish stroll.`,
    "",
    "Candidate sights along the route:",
    candidateList,
    "",
    "Curate and narrate the walking tour now.",
  ].join("\n");

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "present_tour" },
      messages: [{ role: "user", content: user }],
    });

    const toolUse = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) {
      return NextResponse.json(
        { error: "Model did not return a tour" },
        { status: 502 }
      );
    }

    const result = toolUse.input as { sights: { title: string; narration: string }[] };
    return NextResponse.json({
      sights: result.sights ?? [],
      estimatedMinutes: totalMin,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Tour generation failed", detail },
      { status: 502 }
    );
  }
}
