window.ClassAI = {
  async reply(messages, onToken = () => {}) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, stream: true })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Permintaan AI gagal.");
    }

    if (!response.body) {
      throw new Error("Browser tidak mendukung streaming.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();

        if (payload === "[DONE]") return result;

        try {
          const data = JSON.parse(payload);
          if (data.error) throw new Error(data.error);

          const token = data.choices?.[0]?.delta?.content || "";
          if (token) {
            result += token;
            onToken(result);
          }
        } catch (err) {
          if (err.message !== "Unexpected end of JSON input") throw err;
        }
      }
    }

    return result;
  }
};
