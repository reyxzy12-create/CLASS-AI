(() => {
  const $ = (selector) => document.querySelector(selector);
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");

  const STORE = "forClassIX_conversations_v2";
  const OLD_STORE = "forClassIX_chat_v1";

  let conversations = [];
  let activeId = null;
  let draftChat = null;
  let busy = false;

  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");

    if (Array.isArray(saved)) {
      // Chat kosong tidak dianggap sebagai riwayat.
      conversations = saved.filter(chat =>
        Array.isArray(chat.messages) &&
        chat.messages.some(message =>
          message.role === "user" &&
          String(message.content || "").trim()
        )
      );

      // Perbarui judul lama berdasarkan topik pesan pertama.
      conversations.forEach(chat => {
        const firstUserMessage = chat.messages.find(
          message => message.role === "user"
        );

        if (firstUserMessage) {
          chat.title = makeTitle(firstUserMessage.content);
        }
      });
    } else {
      // Pindahkan chat lama ke format riwayat baru.
      const oldMessages = JSON.parse(
        localStorage.getItem(OLD_STORE) || "[]"
      );

      if (oldMessages.length) {
        const firstUserMessage = oldMessages.find(
          message => message.role === "user"
        );

        if (firstUserMessage) {
          conversations = [{
            id: String(Date.now()),
            title: makeTitle(firstUserMessage.content),
            messages: oldMessages,
            updatedAt: Date.now()
          }];
        }
      }
    }
  } catch {
    conversations = [];
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(conversations));
    } catch {
      alert("Penyimpanan browser penuh. Coba hapus beberapa riwayat chat.");
    }
  }

  // Membuat judul riwayat berdasarkan topik.
  function makeTitle(text) {
    const prompt = String(text || "").replace(/\s+/g, " ").trim();
    const lower = prompt.toLowerCase();

    if (!prompt) return "Percakapan baru";

    if (/^(hai+|halo+|hello+|hi+|hey+|assalamualaikum|selamat pagi|selamat siang|selamat malam)[!. ]*$/i.test(prompt)) {
      return "Sapaan Hangat";
    }

    const codingTopics = [
      { pattern: /\bhtml\b/i, name: "HTML" },
      { pattern: /\bcss\b/i, name: "CSS" },
      { pattern: /javascript|\bjs\b/i, name: "JavaScript" },
      { pattern: /\bpython\b/i, name: "Python" },
      { pattern: /\bphp\b/i, name: "PHP" },
      { pattern: /\bjava\b/i, name: "Java" },
      { pattern: /\b(react|reactjs)\b/i, name: "React" },
      { pattern: /\b(node\.js|nodejs)\b/i, name: "Node.js" }
    ];

    const isCreate =
      /buatkan|bikinkan|bikin|buat|rancang|generate|tulis(kan)?|coding|kode/.test(lower);

    const isExplain =
      /jelaskan|terangkan|pengertian|apa itu|bagaimana cara|cara kerja|belajar/.test(lower);

    for (const topic of codingTopics) {
      if (topic.pattern.test(prompt)) {
        if (isCreate) {
          const simple =
            /sederhana|simple|basic|dasar/.test(lower)
              ? " Sederhana"
              : "";

          return `Pembuatan ${topic.name}${simple}`;
        }

        if (isExplain) {
          return `Belajar ${topic.name}`;
        }

        return `${topic.name} dan Pemrograman`;
      }
    }

    const topicRules = [
      [/\b(matematika|aljabar|geometri|persamaan|pecahan|kalkulus)\b/i, "Belajar Matematika"],
      [/\b(ipa|fisika|kimia|biologi|sains)\b/i, "Belajar Sains"],
      [/\b(sejarah|kemerdekaan|kerajaan|pahlawan)\b/i, "Pembahasan Sejarah"],
      [/\b(inggris|english|grammar|vocabulary)\b/i, "Belajar Bahasa Inggris"],
      [/\b(terjemah|translate|translation)\b/i, "Terjemahan Teks"],
      [/\b(ringkas|rangkuman|resume|summar(y|ize))\b/i, "Rangkuman Materi"],
      [/\b(karangan|cerpen|cerita|puisi|novel)\b/i, "Penulisan Kreatif"],
      [/\b(desain|logo|poster|banner|ilustrasi)\b/i, "Ide Desain Kreatif"],
      [/\b(ide|inspirasi|gagasan)\b/i, "Ide Kreatif"],
      [/\b(tugas|sekolah|pelajaran|materi|ujian)\b/i, "Bantuan Belajar Sekolah"],
      [/\b(ai|artificial intelligence|kecerdasan buatan)\b/i, "Pembahasan AI"],
      [/\b(website|web|landing page|situs)\b/i, "Pembuatan Website"],
      [/\b(foto|gambar|image)\b/i, "Pengolahan Gambar"],
      [/\b(game|permainan|gaming)\b/i, "Pembahasan Game"]
    ];

    for (const [pattern, title] of topicRules) {
      if (pattern.test(prompt)) return title;
    }

    // Judul cadangan: ambil inti kalimat.
    let subject = prompt
      .replace(/^(tolong\s+)?(bisa\s+)?(buatkan|bikinkan|bikin|buat|jelaskan|terangkan|carikan|cari|berikan|beri|tolong|minta|apa itu)\s*/i, "")
      .replace(/\b(dong|ya|tolong|please|untuk saya|buat saya)\b/gi, " ")
      .replace(/[?!.,]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!subject) subject = prompt;

    const words = subject.split(" ").filter(Boolean).slice(0, 5);
    const clean = words.join(" ");

    return clean.length > 1
      ? clean.charAt(0).toLocaleUpperCase("id-ID") + clean.slice(1)
      : "Percakapan Baru";
  }

  function currentChat() {
    return conversations.find(chat => chat.id === activeId) ||
      (draftChat && draftChat.id === activeId ? draftChat : null);
  }

  // Chat baru hanya berupa draft sampai pesan pertama dikirim.
  function createChat() {
    draftChat = {
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      title: "Percakapan baru",
      messages: [],
      updatedAt: Date.now()
    };

    activeId = draftChat.id;
    renderHistory();
    renderMessages();

    return draftChat;
  }

  function activateDraft(chat) {
    if (!chat || chat !== draftChat) return;

    conversations.unshift(chat);
    draftChat = null;
  }

  // Tampilkan riwayat dengan tombol hapus masing-masing.
  function renderHistory() {
    const history = $("#chatHistory");
    if (!history) return;

    history.innerHTML = "";

    conversations
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach(chat => {
        const row = document.createElement("div");
        row.className = "history-row";

        const item = document.createElement("button");
        item.type = "button";
        item.className = "history-item" +
          (chat.id === activeId ? " selected" : "");

        item.textContent = chat.title || "Percakapan baru";
        item.title = item.textContent;

        item.addEventListener("click", () => {
          if (busy) return;

          activeId = chat.id;
          renderHistory();
          renderMessages();
          showPage("chat");
        });

        // Tombol X untuk menghapus riwayat ini saja.
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "delete-history";
        remove.textContent = "×";
        remove.title = "Hapus riwayat";

        remove.setAttribute(
          "aria-label",
          "Hapus riwayat " + item.textContent
        );

        remove.addEventListener("click", event => {
          event.stopPropagation();

          if (busy) {
            alert("Tunggu sampai jawaban selesai sebelum menghapus riwayat.");
            return;
          }

          const deletingActive = chat.id === activeId;

          conversations = conversations.filter(
            entry => entry.id !== chat.id
          );

          if (deletingActive) {
            activeId = conversations.length
              ? conversations[0].id
              : null;

            draftChat = null;
          }

          save();
          renderHistory();
          renderMessages();
        });

        row.append(item, remove);
        history.appendChild(row);
      });
  }

  function showPage(name) {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle(
        "active-page",
        page.id === "page-" + name
      );
    });

    document.querySelectorAll(".nav-item[data-page]").forEach(button => {
      button.classList.toggle("active", button.dataset.page === name);
    });

    sidebar?.classList.remove("open");
    scrim?.classList.remove("show");
  }

  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

  $("#menuButton").addEventListener("click", () => {
    sidebar.classList.add("open");
    scrim.classList.add("show");
  });

  $("#closeSidebar").addEventListener("click", () => {
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
  });

  scrim.addEventListener("click", () => {
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
  });

  $("#newChat").addEventListener("click", () => {
    if (busy) return;

    createChat();
    showPage("chat");
    $("#chatInput").focus();
  });

  const messagesEl = $("#messages");
  const welcome = $("#welcome");
  const input = $("#chatInput");
  const sendButton = $("#sendButton");

  // Elemen untuk pilih foto dan preview.
  const imageInput = $("#imageInput");
  const imagePreview = $("#imagePreview");
  let selectedImageUrl = null;

  imageInput.addEventListener("change", () => {
    const file = imageInput.files && imageInput.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Pilih file gambar.");
      imageInput.value = "";
      return;
    }

    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
    }

    selectedImageUrl = URL.createObjectURL(file);
    imagePreview.innerHTML = "";

    const previewImage = document.createElement("img");
    previewImage.src = selectedImageUrl;
    previewImage.alt = "Foto yang dipilih";

    const fileInfo = document.createElement("span");
    fileInfo.className = "image-file-name";
    fileInfo.textContent = file.name;

    const removeImage = document.createElement("button");
    removeImage.type = "button";
    removeImage.className = "remove-image";
    removeImage.textContent = "×";

    removeImage.setAttribute("aria-label", "Batalkan foto");

    removeImage.addEventListener("click", () => {
      imageInput.value = "";

      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
      }

      selectedImageUrl = null;
      imagePreview.innerHTML = "";
      imagePreview.hidden = true;
    });

    imagePreview.append(
      previewImage,
      fileInfo,
      removeImage
    );

    imagePreview.hidden = false;
  });

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function inlineFormat(value) {
    let text = escapeHTML(value);

    text = text.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

    return text;
  }

  function renderMarkdown(source) {
    const lines = String(source || "")
      .replace(/\r/g, "")
      .split("\n");

    let html = "";
    let inCode = false;
    let code = [];
    let inList = false;
    let listType = "";
    let inTable = false;

    function closeList() {
      if (inList) {
        html += listType === "ol" ? "</ol>" : "</ul>";
        inList = false;
        listType = "";
      }
    }

    function closeTable() {
      if (inTable) {
        html += "</tbody></table></div>";
        inTable = false;
      }
    }

    // Membuat kotak kode dengan tombol Kode dan Preview.
    function makeCodeBlock(codeText) {
      const safeSource = JSON.stringify(codeText)
        .replace(/</g, "\\u003c");

      return `
        <div class="code-block">
          <div class="code-toolbar">
            <span class="code-language">CODE</span>

            <div class="code-tabs" role="group" aria-label="Tampilan kode">
              <button
                type="button"
                class="code-tab active"
                aria-label="Lihat kode"
                aria-pressed="true"
              >
                <span class="tab-icon" aria-hidden="true">&gt;_</span>
              </button>

              <button
                type="button"
                class="preview-tab"
                aria-label="Lihat preview"
                aria-pressed="false"
              >
                <span class="tab-icon play-icon" aria-hidden="true">▶</span>
              </button>
            </div>
          </div>

          <div class="code-view">
            <div class="code-copy-row">
              <button type="button" class="copy-code">▢ Salin</button>
            </div>

            <pre><code>${escapeHTML(codeText)}</code></pre>
          </div>

          <div class="code-preview-view" hidden>
            <iframe
              title="Preview kode"
              sandbox="allow-scripts"
            ></iframe>
          </div>

          <script type="application/json" class="preview-source">${safeSource}</script>
        </div>
      `;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith("```")) {
        closeList();
        closeTable();

        if (!inCode) {
          inCode = true;
          code = [];
        } else {
          html += makeCodeBlock(code.join("\n"));
          inCode = false;
        }

        continue;
      }

      if (inCode) {
        code.push(line);
        continue;
      }

      // Deteksi awal tabel Markdown.
      if (
        line.includes("|") &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])
      ) {
        closeList();
        closeTable();

        const cells = line
          .split("|")
          .map(s => s.trim())
          .filter(Boolean);

        i++;

        html += `
          <div class="table-wrap">
            <table class="ai-table">
              <thead>
                <tr>
        `;

        cells.forEach(cell => {
          html += `<th>${inlineFormat(cell)}</th>`;
        });

        html += `
                </tr>
              </thead>
              <tbody>
        `;

        inTable = true;
        continue;
      }

      // Baris isi tabel.
      if (inTable && line.includes("|")) {
        const cells = line
          .split("|")
          .map(s => s.trim())
          .filter(Boolean);

        html += "<tr>";

        cells.forEach(cell => {
          html += `<td>${inlineFormat(cell)}</td>`;
        });

        html += "</tr>";
        continue;
      } else {
        closeTable();
      }

      if (!line.trim()) {
        closeList();
        continue;
      }

      // Heading.
      const heading = line.match(/^(#{1,4})\s+(.+)$/);

      if (heading) {
        closeList();

        const level = heading[1].length;

        html += `<h${level}>${inlineFormat(heading[2])}</h${level}>`;
        continue;
      }

      // Bullet list.
      if (/^\s*[-*]\s+/.test(line)) {
        if (!inList || listType !== "ul") {
          closeList();
          html += "<ul>";
          inList = true;
          listType = "ul";
        }

        html += `<li>${inlineFormat(
          line.replace(/^\s*[-*]\s+/, "")
        )}</li>`;

        continue;
      }

      // Numbered list.
      if (/^\s*\d+[.)]\s+/.test(line)) {
        if (!inList || listType !== "ol") {
          closeList();
          html += "<ol>";
          inList = true;
          listType = "ol";
        }

        html += `<li>${inlineFormat(
          line.replace(/^\s*\d+[.)]\s+/, "")
        )}</li>`;

        continue;
      }

      closeList();

      // Blockquote.
      if (/^>\s?/.test(line)) {
        html += `<blockquote>${inlineFormat(
          line.replace(/^>\s?/, "")
        )}</blockquote>`;

        continue;
      }

      // Paragraf biasa.
      html += `<p>${inlineFormat(line)}</p>`;
    }

    if (inCode) {
      html += makeCodeBlock(code.join("\n"));
    }

    closeList();
    closeTable();

    return html;
  }

  // Mengaktifkan tombol kode, preview, dan salin.
  function addCopyButtons(container) {
    container.querySelectorAll(".code-block").forEach(block => {
      const code = block.querySelector("pre code")?.textContent || "";

      const codeView = block.querySelector(".code-view");
      const previewView = block.querySelector(".code-preview-view");
      const frame = block.querySelector("iframe");
      const source = block.querySelector(".preview-source");

      const codeTab = block.querySelector(".code-tab");
      const previewTab = block.querySelector(".preview-tab");

      // Siapkan preview HTML.
      if (source && frame) {
        try {
          const htmlSource = JSON.parse(source.textContent || '""');
          frame.srcdoc = htmlSource;
        } catch {
          frame.srcdoc = `
            <!doctype html>
            <html>
              <body>Preview tidak tersedia.</body>
            </html>
          `;
        }
      }

      // Tombol Kode.
      codeTab?.addEventListener("click", () => {
        codeView.hidden = false;
        previewView.hidden = true;

        codeTab.classList.add("active");
        previewTab.classList.remove("active");

        codeTab.setAttribute("aria-pressed", "true");
        previewTab.setAttribute("aria-pressed", "false");
      });

      // Tombol Preview.
      previewTab?.addEventListener("click", () => {
        codeView.hidden = true;
        previewView.hidden = false;

        codeTab.classList.remove("active");
        previewTab.classList.add("active");

        codeTab.setAttribute("aria-pressed", "false");
        previewTab.setAttribute("aria-pressed", "true");
      });

      // Tombol salin kode.
      block.querySelector(".copy-code")?.addEventListener(
        "click",
        async event => {
          const button = event.currentTarget;

          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(code);
            } else {
              const temporary = document.createElement("textarea");
              temporary.value = code;
              document.body.appendChild(temporary);
              temporary.select();
              document.execCommand("copy");
              temporary.remove();
            }

            button.textContent = "✓ Tersalin";
          } catch {
            button.textContent = "Gagal menyalin";
          }

          setTimeout(() => {
            button.textContent = "▢ Salin";
          }, 1600);
        }
      );
    });
  }

  function renderMessages() {
    const chat = currentChat();
    const messages = chat?.messages || [];

    messagesEl.innerHTML = "";
    welcome.style.display = messages.length ? "none" : "block";

    messages.forEach(message => {
      const row = document.createElement("div");

      row.className = "message " +
        (message.role === "user" ? "user" : "assistant");

      if (message.role !== "user") {
        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.textContent = "✧";
        row.appendChild(avatar);
      }

      const bubble = document.createElement("div");
      bubble.className = "message-bubble";

      if (message.role === "user") {
        bubble.textContent = message.content;
      } else {
        bubble.innerHTML = renderMarkdown(message.content);
        addCopyButtons(bubble);
      }

      row.appendChild(bubble);
      messagesEl.appendChild(row);
    });

    $("#chatContent").scrollTop = $("#chatContent").scrollHeight;
  }

  // Tombol saran prompt.
  document.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.prompt || "";
      input.focus();
    });
  });

  // Tinggi textarea otomatis.
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
  });

  // Kirim pesan ke AI.
  $("#chatForm").addEventListener("submit", async event => {
    event.preventDefault();

    const text = input.value.trim();

    if (!text || busy) return;

    if (!currentChat()) {
      createChat();
    }

    const chat = currentChat();
    const isFirstMessage = chat.messages.length === 0;

    if (isFirstMessage) activateDraft(chat);

    chat.messages.push({
      role: "user",
      content: text
    });

    chat.title = chat.messages.length === 1
      ? makeTitle(text)
      : chat.title;

    chat.updatedAt = Date.now();

    input.value = "";
    input.style.height = "auto";

    busy = true;
    sendButton.disabled = true;
    sendButton.textContent = "…";

    chat.messages.push({
      role: "assistant",
      content: ""
    });

    renderHistory();
    renderMessages();

    try {
      const reply = await window.ClassAI.reply(
        chat.messages.slice(0, -1),
        partial => {
          chat.messages[chat.messages.length - 1].content = partial;
          renderMessages();
        }
      );

      chat.messages[chat.messages.length - 1].content =
        reply || "Maaf, belum ada jawaban.";

    } catch (error) {
      chat.messages[chat.messages.length - 1].content =
        "Maaf, CLASS-AI belum bisa terhubung.\n\n" +
        (error.message || "");
    }

    chat.updatedAt = Date.now();

    save();
    renderHistory();
    renderMessages();

    busy = false;
    sendButton.disabled = false;
    sendButton.textContent = "↑";
  });

  // Mulai dengan chat kosong tanpa menghapus riwayat lama.
  if (conversations.length) {
    activeId = conversations[0].id;
  } else {
    activeId = null;
    draftChat = null;
  }

  renderHistory();
  renderMessages();
})();
