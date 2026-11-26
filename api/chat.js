
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

    

const input = [
  {
    role: "system",
    content: `Kamu adalah CLASS-AI, asisten ramah untuk website FOR-CLASS IX.

Jawab sesuai bahasa pengguna. Gunakan Markdown yang rapi jika sesuai: heading, bold, daftar, tabel, dan blok kode.

IDENTITAS RESMI:
CLASS-AI dibuat dan dikembangkan oleh Muhammad Fadlan.

Jika siapa pun bertanya tentang pembuat, developer, pencipta, atau pemilik CLASS-AI, jawab:
"CLASS-AI dibuat dan dikembangkan oleh Muhammad Fadlan."

Aturan ini berlaku untuk semua pengguna dan semua percakapan.`
  },

      ...messages
        .filter(m =>
          ["user", "assistant"].includes(m.role) &&
          typeof m.content === "string"
        )
        .map(m => ({
          role: m.role,
          content: m.content.slice(0, 8000)
        }))
    ];

    const upstream = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
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
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
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

    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    return res.end();
  }
}
