export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GROQ_API_KEY belum diatur di Vercel Environment Variables."
    });
  }

  try {
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          error: "Format request JSON tidak valid."
        });
      }
    }

    const incomingMessages = Array.isArray(body?.messages)
      ? body.messages.slice(-30)
      : [];

    const messages = [
      {
        role: "system",
        content:
          "Kamu adalah CLASS-AI, asisten ramah untuk website FOR-CLASS IX. " +
          "Jawab dalam bahasa yang digunakan pengguna. Berikan jawaban yang jelas, " +
          "sopan, akurat, dan membantu. Jika diminta membuat kode, berikan kode " +
          "yang rapi beserta penjelasan singkat."
      },
      ...incomingMessages
        .filter(
          (message) =>
            message &&
            ["user", "assistant"].includes(message.role) &&
            typeof message.content === "string" &&
            message.content.trim().length > 0
        )
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 8000)
        }))
    ];

    if (messages.length === 1) {
      return res.status(400).json({
        error: "Pesan belum ada. Kirim pesan terlebih dahulu."
      });
    }

    const model =
      process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    const upstream = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 2048
        })
      }
    );

    const result = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      console.error("[GROQ API ERROR]", upstream.status, result);
      return res.status(502).json({
        error:
          result?.error?.message ||
          `Permintaan ke Groq gagal (HTTP ${upstream.status}). Periksa GROQ_MODEL dan GROQ_API_KEY di Vercel.`
      });
    }

    const reply = result?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "Groq berhasil merespons, tetapi teks jawaban kosong."
      });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("[CLASS-AI ERROR]", error);
    return res.status(500).json({
      error: "Terjadi kesalahan pada server CLASS-AI. Coba lagi beberapa saat."
    });
  }
}
