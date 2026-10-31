
type CachedImage = {
  imageUrl: string | null;
  imageAttribution: {
    photographerName: string;
    photographerUrl: string;
    unsplashUrl: string;
  } | null;
  expiresAt: number;
};

// Cache Unsplash results for one hour
const imageCache = new Map<string, CachedImage>();
const CACHE_DURATION = 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    // 1. Safely parse the incoming request body
    let body;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const { transcript } = body;

    // 2. Validate transcript
    if (typeof transcript !== "string" || !transcript.trim()) {
      return Response.json(
        { error: "Transcript is required." },
        { status: 400 }
      );
    }

    const groqKey = process.env.GROQ_API_KEY;
    const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;

    if (!groqKey || !unsplashKey) {
      return Response.json(
        { error: "API credentials are missing." },
        { status: 500 }
      );
    }

    // 3. Start total backend latency measurement
    const totalStart = performance.now();

    // 4. Extract the visual-search keyword using Groq
    const groqStart = performance.now();

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            {
              role: "system",
              content:
                'Extract the main educational subject from the classroom transcript. Identify the overall topic rather than individual details or minor subtopics. Prefer broad, recognizable subjects suitable for visual search. Examples: "Newton laws of motion", "human heart", "solar system", "photosynthesis", "wind turbine". Ignore greetings, filler and casual conversation. If no educational subject exists, return an empty keyword. You MUST return a valid JSON object with exactly one string property named keyword. Example: {"keyword":"Newton laws of motion"}.',
            },
            {
              role: "user",
              content: transcript,
            },
          ],
          response_format: { type: "json_object" },
          reasoning_format: "hidden",
          temperature: 0,
          max_tokens: 300,
        }),
        cache: "no-store",
      }
    );

    const groqData = await groqResponse.json();

    const groqMs = Math.round(performance.now() - groqStart);

    if (!groqResponse.ok) {
      console.error("Groq error:", groqData);
      console.error("Groq latency:", groqMs, "ms");

      return Response.json(
        { error: "Keyword extraction failed." },
        { status: groqResponse.status }
      );
    }

    const generatedText =
      groqData.choices?.[0]?.message?.content;

    if (!generatedText) {
      throw new Error("Groq returned an empty response.");
    }

    const parsed = JSON.parse(generatedText);

    const keyword =
      typeof parsed.keyword === "string"
        ? parsed.keyword.trim()
        : "";

    // 5. No educational concept found
    if (!keyword) {
      const totalMs = Math.round(performance.now() - totalStart);

      console.log("AI Pipeline Performance:", {
        groqMs,
        unsplashMs: 0,
        totalMs,
        cache: "not applicable",
      });

      return Response.json({
        keyword: "",
        imageUrl: null,
        isRelevant: false,
        imageAttribution: null,
      });
    }

    // 6. Check image cache
    const normalizedKeyword = keyword.toLowerCase();
    const cachedImage = imageCache.get(normalizedKeyword);

    if (cachedImage && cachedImage.expiresAt > Date.now()) {
      const totalMs = Math.round(performance.now() - totalStart);

      console.log("AI Pipeline Performance:", {
        groqMs,
        unsplashMs: 0,
        totalMs,
        cache: "HIT",
      });

      return Response.json({
        keyword,
        imageUrl: cachedImage.imageUrl,
        isRelevant: Boolean(cachedImage.imageUrl),
        imageAttribution: cachedImage.imageAttribution,
      });
    }

    // Remove expired cache entry
    if (cachedImage) {
      imageCache.delete(normalizedKeyword);
    }

    // 7. Search Unsplash for the extracted keyword
    const imageSearchUrl = new URL(
      "https://api.unsplash.com/search/photos"
    );

    imageSearchUrl.search = new URLSearchParams({
      query: keyword,
      per_page: "1",
      orientation: "landscape",
    }).toString();

    const unsplashStart = performance.now();

    const imageResponse = await fetch(imageSearchUrl.toString(), {
      headers: {
        Authorization: `Client-ID ${unsplashKey}`,
      },
      cache: "no-store",
    });

    const imageData = await imageResponse.json();

    const unsplashMs = Math.round(
      performance.now() - unsplashStart
    );

    const totalMs = Math.round(performance.now() - totalStart);

    // 8. Log pipeline performance
    console.log("AI Pipeline Performance:", {
      groqMs,
      unsplashMs,
      totalMs,
      cache: "MISS",
    });

    if (!imageResponse.ok) {
      console.error("Unsplash error:", imageData);

      return Response.json(
        {
          error: "Image search failed.",
          details: imageData.errors || "Unsplash request failed.",
        },
        { status: imageResponse.status }
      );
    }

    const photo = imageData.results?.[0];

    const imageUrl = photo?.urls?.regular || null;

    const imageAttribution = photo
      ? {
          photographerName: photo.user.name,
          photographerUrl: photo.user.links.html,
          unsplashUrl: photo.links.html,
        }
      : null;

    // 9. Store successful image search result in cache
    if (imageUrl) {
      imageCache.set(normalizedKeyword, {
        imageUrl,
        imageAttribution,
        expiresAt: Date.now() + CACHE_DURATION,
      });
    }

    // 10. Return the combined response
    return Response.json({
      keyword,
      imageUrl,
      isRelevant: Boolean(imageUrl),
      imageAttribution,
    });
  } catch (error) {
    console.error("Analyze speech error:", error);

    return Response.json(
      { error: "Speech analysis failed." },
      { status: 500 }
    );
  }
}
