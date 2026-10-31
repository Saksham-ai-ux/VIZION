
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return Response.json(
        { error: "Supabase credentials are missing." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("lecture_materials")
      .select(
        "id, created_at, title, subject, content, target_keywords, default_image_url"
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);

      return Response.json(
        { error: "Failed to fetch lecture materials." },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      count: data.length,
      lectures: data,
    });
  } catch (error) {
    console.error("Lecture materials API error:", error);

    return Response.json(
      { error: "Unable to retrieve lecture materials." },
      { status: 500 }
    );
  }
}
