import { NextRequest, NextResponse } from "next/server";

type Annotation = {
  label: string;
  description: string;
  x: number;
  y: number;
};

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { imageUrl, keyword } = body;

    if (
      typeof imageUrl !== "string" ||
      typeof keyword !== "string"
    ) {
      return NextResponse.json(
        { error: "A valid imageUrl and keyword are required." },
        { status: 400 }
      );
    }

    // Only accept images hosted by Unsplash.
    const parsedUrl = new URL(imageUrl);

    if (
      parsedUrl.protocol !== "https:" ||
      !["images.unsplash.com", "plus.unsplash.com"].includes(
        parsedUrl.hostname
      )
    ) {
      return NextResponse.json(
        { error: "Only HTTPS Unsplash image URLs are supported." },
        { status: 400 }
      );
    }

    const prompt = `
You are an expert educational diagram analyst.

Analyze the supplied image in the context of this topic:
"${keyword}"

Identify up to 4 important visible components that a teacher
should explain to students.

For each component, return:
- label: short component name (maximum 5 words)
- description: clear explanation in one or two sentences
- x: horizontal position from 0 to 100
- y: vertical position from 0 to 100

Coordinates must identify the approximate CENTER of the actual
visible component in the image.

Coordinate system:
- (0, 0) is the top-left corner.
- (100, 100) is the bottom-right corner.
- Do not invent components that are not visible.
- Do not label decorative elements.
- Prefer important, clearly identifiable components.
- Keep labels concise and suitable for a classroom screen.

Return ONLY valid JSON in this exact structure:
{
  "annotations": [
    {
      "label": "Component name",
      "description": "Short educational explanation",
      "x": 50,
      "y": 40
    }
  ]
}

If the image does not contain an identifiable educational diagram,
return an empty annotations array.
`;

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
          temperature: 0.2,
          max_completion_tokens: 700,
          response_format: {
            type: "json_object",
          },
        }),
      }
    );

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("Groq annotation error:", errorText);

      return NextResponse.json(
        { error: "The AI annotation service failed." },
        { status: 502 }
      );
    }

    const result = await groqResponse.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Groq returned an empty response.");
    }

    const parsed = JSON.parse(content);

    const annotations: Annotation[] = Array.isArray(
      parsed.annotations
    )
      ? parsed.annotations
          .filter(
            (item: any) =>
              typeof item.label === "string" &&
              typeof item.description === "string" &&
              Number.isFinite(Number(item.x)) &&
              Number.isFinite(Number(item.y))
          )
          .slice(0, 6)
          .map((item: any) => ({
            label: item.label.slice(0, 60),
            description: item.description.slice(0, 300),
            x: Math.max(0, Math.min(100, Number(item.x))),
            y: Math.max(0, Math.min(100, Number(item.y))),
          }))
      : [];

    return NextResponse.json({
      annotations,
      keyword,
    });
  } catch (error) {
    console.error("Annotation API error:", error);

    return NextResponse.json(
      { error: "Unable to generate annotations." },
      { status: 500 }
    );
  }
}