import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type NarrateBody = {
  title: string;
  summary?: string;
  distanceMeters?: number;
  city?: string;
  visitedTitles?: string[];
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set" },
      { status: 500 }
    );
  }

  let body: NarrateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, summary, distanceMeters, city = "Copenhagen", visitedTitles = [] } = body;
  if (!title) {
    return NextResponse.json({ error: "Missing 'title'" }, { status: 400 });
  }

  const distanceNote =
    typeof distanceMeters === "number"
      ? `The walker is about ${Math.round(distanceMeters)} meters away from it right now.`
      : "";
  const visitedNote = visitedTitles.length
    ? `They have already heard about: ${visitedTitles.join(", ")}. Don't repeat those.`
    : "";

  const system = [
    "You are a warm, knowledgeable local walking-tour guide speaking directly into a listener's earphones as they stroll through the city.",
    "Your narration is SPOKEN ALOUD by a text-to-speech voice, so: write plain prose only — no markdown, no headings, no bullet points, no emoji, no stage directions.",
    "Be vivid and conversational, like a friend who happens to be a historian. Share a concrete historical detail or surprising story, not a dry encyclopedia summary.",
    "Aim for roughly 110-160 words: long enough to be interesting, short enough to finish before they walk past.",
    "End with a single gentle, curiosity-piquing nudge toward looking at something specific nearby or wandering a little further off the main route.",
  ].join(" ");

  const user = [
    `City: ${city}.`,
    `Landmark the walker is approaching: "${title}".`,
    summary ? `Reference facts (may be incomplete): ${summary}` : "",
    distanceNote,
    visitedNote,
    "Narrate this landmark for them now.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: user }],
    });

    const script = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    return NextResponse.json({ script });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Narration failed", detail },
      { status: 502 }
    );
  }
}
