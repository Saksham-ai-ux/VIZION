
export async function POST(request: Request) {
  try {
    const { transcript } = await request.json();

    if (typeof transcript !== "string" || !transcript.trim()) {
      return Response.json({ error: "Transcript is required." }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

    if (!apiKey) {
      return Response.json({ error: "GROQ_API_KEY is missing." }, { status: 500 });
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                'Extract one specific educational concept from classroom speech. Ignore filler and casual conversation. If no educational concept exists, return an empty string. Return only JSON in this format: {"keyword":"wind turbine"}.',
            },
            { role: "user", content: transcript },
          ],
          response_format: { type: "json_object" },
          reasoning_format: "hidden",
          temperature: 0,
          max_tokens: 300,
        }),
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq API error:", data);
      return Response.json(
        { error: "Groq API request failed.", details: data.error?.message },
        { status: response.status }
      );
    }

    const generatedText = data.choices?.[0]?.message?.content;

    if (!generatedText) {
      throw new Error("Groq returned an empty response.");
    }

    const result = JSON.parse(generatedText);

    return Response.json({
      keyword: typeof result.keyword === "string" ? result.keyword.trim() : "",
    });
  } catch (error) {
    console.error("Test route error:", error);
    return Response.json({ error: "Keyword extraction failed." }, { status: 500 });
  }
}
