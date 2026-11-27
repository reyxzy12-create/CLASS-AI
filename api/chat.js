export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      error: "GROQ_API_KEY belum diatur di Vercel Environment Variables."
    });
  }

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const messages = Array.isArray(body?.messages)
      ? body.messages.slice(-30)
      : [];

    const style = body?.style === "concise"
      ? "Jawab dengan singkat dan langsung."
      : body?.style === "detailed"
        ? "Berikan jawaban lebih rinci, terstruktur, dan jelas."
        : "Jawab dengan jelas dan seimbang.";

    const input = [
      {
        role: "system",
        content: `Kamu adalah CLASS-AI, asisten ramah untuk website FOR-CLASS IX.

Jawab sesuai bahasa pengguna. Gunakan Markdown yang rapi jika sesuai: heading, bold, daftar, tabel, dan blok kode. ${style}

Jika pengguna mengirim gambar, analisis gambar tersebut sesuai pertanyaannya. Jangan mengaku melihat detail yang tidak terlihat.

IDENTITAS RESMI: CLASS-AI dibuat dan dikembangkan oleh Muhammad Fadlan. Jika ditanya pembuat, developer, pencipta, atau pemilik CLASS-AI, jawab: "CLASS-AI dibuat dan dikembangkan oleh Muhammad Fadlan."`
      },

      ...messages
        .filter(m =>
          ["user", "assistant"].includes(m.role) &&
          typeof m.content === "string"
        )
        .map((m, index, arr) => {
          const lastImageIndex = arr
            .map(item => Boolean(item.image))
            .lastIndexOf(true);

          if (
            index === lastImageIndex &&
            m.role === "user" &&
            typeof m.image === "string" &&
            /^data:image\/(png|jpeg|webp);base64,/i.test(m.image)
          ) {
            return {
              role: "user",
              content: [
                {
                  type: "text",
                  text: m.content || "Tolong analisis gambar ini."
                },
                {
                  type: "image_url",
                  image_url: { url: m.image }
                }
              ]
            };
          }

          return {
            role: m.role,
            content: m.content.slice(0, 8000)
          };
        })
    ];

    const hasImage = messages.some(m =>
      typeof m?.image === "string" &&
      m.image.startsWith("data:image/")
    );

    const upstream = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: hasImage
            ? (process.env.GROQ_VISION_MODEL ||
                "meta-llama/llama-4-scout-17b-16e-instruct")
            : (process.env.GROQ_MODEL ||
                "openai/gpt-oss-20b"),
          messages: input,
          temperature: 0.7,
          max_tokens: 2048,
          stream: true
        })
      }
    );

    if (!upstream.ok) {
      const error = await upstream.json().catch(() => ({}));

      return res.status(upstream.status).json({
        error: error?.error?.message || "Groq API error."
      });
    }

    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      "text/event-stream; charset=utf-8"
    );
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = upstream.body.getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }

    res.write("data: [DONE]\n\n");
    return res.end();

  } catch (error) {
    console.error("[CLASS-AI ERROR]", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: error.message || "Internal server error."
      });
    }

    res.write(
      `data: ${JSON.stringify({ error: error.message })}\n\n`
    );
    return res.end();
  }
}
