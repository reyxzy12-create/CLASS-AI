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
  let selectedImageData = null;

  const LOCK_META = "classAI_history_lock_v1";
  const LOCK_VAULT = "classAI_history_vault_v1";

  let lockMeta = null;
  let vaultKey = null;

  try {
    lockMeta = JSON.parse(
      localStorage.getItem(LOCK_META) || "null"
    );
  } catch {
    lockMeta = null;
  }

  async function deriveVaultKey(pin, saltText) {
    const enc = new TextEncoder();

    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(pin),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const salt = Uint8Array.from(
      atob(saltText),
      c => c.charCodeAt(0)
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 250000,
        hash: "SHA-256"
      },
      material,
      {
        name: "AES-GCM",
        length: 256
      },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function toBase64(bytes) {
    const data = new Uint8Array(bytes);
    let binary = "";

    for (
      let offset = 0;
      offset < data.length;
      offset += 0x8000
    ) {
      binary += String.fromCharCode(
        ...data.subarray(offset, offset + 0x8000)
      );
    }

    return btoa(binary);
  }

  async function encryptHistory(key, value) {
    const iv = crypto.getRandomValues(
      new Uint8Array(12)
    );

    const data = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      new TextEncoder().encode(
        JSON.stringify(value)
      )
    );

    return {
      iv: toBase64(iv),
      data: toBase64(data)
    };
  }

  async function decryptHistory(key, vault) {
    const iv = Uint8Array.from(
      atob(vault.iv),
      c => c.charCodeAt(0)
    );

    const data = Uint8Array.from(
      atob(vault.data),
      c => c.charCodeAt(0)
    );

    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      data
    );

    return JSON.parse(
      new TextDecoder().decode(plain)
    );
  }

  try {
    const saved = lockMeta
      ? null
      : JSON.parse(
          localStorage.getItem(STORE) || "null"
        );

    if (Array.isArray(saved)) {
      conversations = saved.filter(chat =>
        Array.isArray(chat.messages) &&
        chat.messages.some(message =>
          message.role === "user" &&
          String(message.content || "").trim()
        )
      );

      conversations.forEach(chat => {
        const firstUserMessage = chat.messages.find(
          message => message.role === "user"
        );

        if (firstUserMessage) {
          chat.title = makeTitle(
            firstUserMessage.content
          );
        }
      });
    } else {
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

  async function save() {
    try {
      if (lockMeta && vaultKey) {
        const encrypted = await encryptHistory(
          vaultKey,
          conversations
        );

        localStorage.setItem(
          LOCK_VAULT,
          JSON.stringify(encrypted)
        );

        localStorage.removeItem(STORE);
      } else {
        localStorage.setItem(
          STORE,
          JSON.stringify(conversations)
        );
      }
    } catch {
      alert(
        "Penyimpanan browser penuh atau enkripsi tidak tersedia."
      );
    }
  }

  function makeTitle(text) {
    const prompt = String(text || "")
      .replace(/\s+/g, " ")
      .trim();

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

    let subject = prompt
      .replace(/^(tolong\s+)?(bisa\s+)?(buatkan|bikinkan|bikin|buat|jelaskan|terangkan|carikan|cari|berikan|beri|tolong|minta|apa itu)\s*/i, "")
      .replace(/\b(dong|ya|tolong|please|untuk saya|buat saya)\b/gi, " ")
      .replace(/[?!.,]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!subject) subject = prompt;

    const words = subject
      .split(" ")
      .filter(Boolean)
      .slice(0, 5);

    const clean = words.join(" ");

    return clean.length > 1
      ? clean.charAt(0).toLocaleUpperCase("id-ID") + clean.slice(1)
      : "Percakapan Baru";
  }

  function currentChat() {
    return conversations.find(
      chat => chat.id === activeId
    ) || (
      draftChat && draftChat.id === activeId
        ? draftChat
        : null
    );
  }

  function createChat() {
    draftChat = {
      id: String(Date.now()) +
        Math.random().toString(16).slice(2),
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
            alert(
              "Tunggu sampai jawaban selesai sebelum menghapus riwayat."
            );
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
      button.classList.toggle(
        "active",
        button.dataset.page === name
      );
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

  const imageInput = $("#imageInput");
  const imagePreview = $("#imagePreview");

  async function fileToDataURL(file) {
    if (file.size > 12 * 1024 * 1024) {
      throw new Error(
        "Pilih foto berukuran maksimal 12 MB."
      );
    }

    const image = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Foto tidak bisa dibaca."));
      };

      img.src = url;
    });

    const max = 1280;

    const scale = Math.min(
      1,
      max / Math.max(image.width, image.height)
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    canvas.getContext("2d").drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL("image/jpeg", 0.82);
  }

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files &&
      imageInput.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Pilih file gambar.");
      imageInput.value = "";
      return;
    }

    try {
      selectedImageData = await fileToDataURL(file);

      imagePreview.innerHTML = "";

      const previewImage = document.createElement("img");
      previewImage.src = selectedImageData;
      previewImage.alt = "Foto yang akan dikirim";

      const fileInfo = document.createElement("span");
      fileInfo.className = "image-file-name";
      fileInfo.textContent = file.name;

      const removeImage = document.createElement("button");
      removeImage.type = "button";
      removeImage.className = "remove-image";
      removeImage.textContent = "×";

      removeImage.setAttribute(
        "aria-label",
        "Batalkan foto"
      );

      removeImage.addEventListener(
        "click",
        clearSelectedImage
      );

      imagePreview.append(
        previewImage,
        fileInfo,
        removeImage
      );

      imagePreview.hidden = false;

    } catch (error) {
      alert(error.message || "Foto gagal diproses.");
      clearSelectedImage();
    }
  });

  function clearSelectedImage() {
    imageInput.value = "";
    selectedImageData = null;
    imagePreview.innerHTML = "";
    imagePreview.hidden = true;
  }

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

    text = text.replace(
      /&lt;br\s*\/?&gt;/gi,
      "<br>"
    );

    text = text.replace(
      /`([^`]+)`/g,
      "<code>$1</code>"
    );

    text = text.replace(
      /\*\*(.+?)\*\*/g,
      "<strong>$1</strong>"
    );

    text = text.replace(
      /\*(.+?)\*/g,
      "<em>$1</em>"
    );

    text = text.replace(
      /~~(.+?)~~/g,
      "<del>$1</del>"
    );

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
        html += listType === "ol"
          ? "</ol>"
          : "</ul>";

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

      const heading = line.match(
        /^(#{1,4})\s+(.+)$/
      );

      if (heading) {
        closeList();

        const level = heading[1].length;

        html += `<h${level}>${inlineFormat(heading[2])}</h${level}>`;
        continue;
      }

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

      if (/^>\s?/.test(line)) {
        html += `<blockquote>${inlineFormat(
          line.replace(/^>\s?/, "")
        )}</blockquote>`;

        continue;
      }

      html += `<p>${inlineFormat(line)}</p>`;
    }

    if (inCode) {
      html += makeCodeBlock(code.join("\n"));
    }

    closeList();
    closeTable();

    return html;
  }

  function addCopyButtons(container) {
    container.querySelectorAll(".code-block").forEach(block => {
      const code = block.querySelector(
        "pre code"
      )?.textContent || "";

      const codeView = block.querySelector(".code-view");
      const previewView = block.querySelector(
        ".code-preview-view"
      );

      const frame = block.querySelector("iframe");
      const source = block.querySelector(".preview-source");

      const codeTab = block.querySelector(".code-tab");
      const previewTab = block.querySelector(".preview-tab");

      if (source && frame) {
        try {
          const htmlSource = JSON.parse(
            source.textContent || '""'
          );

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

      codeTab?.addEventListener("click", () => {
        codeView.hidden = false;
        previewView.hidden = true;

        codeTab.classList.add("active");
        previewTab.classList.remove("active");

        codeTab.setAttribute("aria-pressed", "true");
        previewTab.setAttribute("aria-pressed", "false");
      });

      previewTab?.addEventListener("click", () => {
        codeView.hidden = true;
        previewView.hidden = false;

        codeTab.classList.remove("active");
        previewTab.classList.add("active");

        codeTab.setAttribute("aria-pressed", "false");
        previewTab.setAttribute("aria-pressed", "true");
      });

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
    welcome.style.display = messages.length
      ? "none"
      : "block";

    messages.forEach(message => {
      const row = document.createElement("div");

      row.className = "message " +
        (message.role === "user"
          ? "user"
          : "assistant");

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

        if (message.image) {
          const sentImage = document.createElement("img");

          sentImage.src = message.image;
          sentImage.alt = "Foto yang dikirim";
          sentImage.className = "sent-chat-image";

          bubble.appendChild(sentImage);
        }

      } else {
        bubble.innerHTML = renderMarkdown(
          message.content
        );

        addCopyButtons(bubble);
      }

      row.appendChild(bubble);
      messagesEl.appendChild(row);
    });

    $("#chatContent").scrollTop =
      $("#chatContent").scrollHeight;
  }

  document.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.prompt || "";
      input.focus();
    });
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";

    input.style.height =
      Math.min(input.scrollHeight, 150) + "px";
  });

  $("#chatForm").addEventListener("submit", async event => {
    event.preventDefault();

    const text = input.value.trim();
    const imageForRequest = selectedImageData;

    if ((!text && !imageForRequest) || busy) return;

    if (!currentChat()) {
      createChat();
    }

    const chat = currentChat();
    const isFirstMessage = chat.messages.length === 0;

    if (isFirstMessage) {
      activateDraft(chat);
    }

    chat.messages.push({
      role: "user",
      content: text || "Tolong analisis foto ini.",
      ...(imageForRequest
        ? { image: imageForRequest }
        : {})
    });

    chat.title = chat.messages.length === 1
      ? makeTitle(text)
      : chat.title;

    chat.updatedAt = Date.now();

    input.value = "";
    input.style.height = "auto";

    clearSelectedImage();

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
          chat.messages[
            chat.messages.length - 1
          ].content = partial;

          renderMessages();
        },
        imageForRequest,
        {
          style: localStorage.getItem(
            "classAI_ai_style"
          ) || "normal"
        }
      );

      chat.messages[
        chat.messages.length - 1
      ].content = reply || "Maaf, belum ada jawaban.";

    } catch (error) {
      chat.messages[
        chat.messages.length - 1
      ].content =
        "Maaf, CLASS-AI belum bisa terhubung.\n\n" +
        (error.message || "");
    }

    chat.updatedAt = Date.now();

    await save();

    renderHistory();
    renderMessages();

    busy = false;
    sendButton.disabled = false;
    sendButton.textContent = "↑";
  });

  // SETTINGS
  const setting = (key, fallback = "") =>
    localStorage.getItem("classAI_" + key) ?? fallback;

  const appearanceSelect = $("#appearanceSelect");
  const aiStyleSelect = $("#aiStyle");
  const profileName = $("#profileName");
  const enterToSend = $("#enterToSend");

  function applyTheme(theme) {
    const dark =
      theme === "dark" ||
      (
        theme === "system" &&
        matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches
      );

    document.documentElement.classList.toggle(
      "theme-dark",
      dark
    );
  }

  if (appearanceSelect) {
    appearanceSelect.value = setting(
      "appearance",
      "light"
    );

    applyTheme(appearanceSelect.value);

    appearanceSelect.addEventListener("change", () => {
      localStorage.setItem(
        "classAI_appearance",
        appearanceSelect.value
      );

      applyTheme(appearanceSelect.value);
    });
  }

  if (profileName) {
    profileName.value = setting("profile_name", "");
  }

  $("#saveProfile")?.addEventListener("click", () => {
    localStorage.setItem(
      "classAI_profile_name",
      profileName.value.trim()
    );

    alert("Nama profil disimpan di perangkat ini.");
  });

  if (aiStyleSelect) {
    aiStyleSelect.value = setting(
      "ai_style",
      "normal"
    );
  }

  aiStyleSelect?.addEventListener("change", () => {
    localStorage.setItem(
      "classAI_ai_style",
      aiStyleSelect.value
    );
  });

  if (enterToSend) {
    enterToSend.checked =
      setting("enter_to_send", "true") === "true";
  }

  enterToSend?.addEventListener("change", () => {
    localStorage.setItem(
      "classAI_enter_to_send",
      String(enterToSend.checked)
    );
  });

  input.addEventListener("keydown", event => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      enterToSend?.checked
    ) {
      event.preventDefault();
      $("#chatForm").requestSubmit();
    }
  });

  $("#clearAllHistory")?.addEventListener(
    "click",
    async () => {
      if (!confirm(
        "Hapus semua riwayat chat? Tindakan ini tidak bisa dibatalkan."
      )) return;

      conversations = [];
      activeId = null;
      draftChat = null;

      await save();

      renderHistory();
      renderMessages();
    }
  );

  // LOCK HISTORY
  const lockScreen = $("#historyLockScreen");
  const lockForm = $("#historyUnlockForm");
  const unlockPin = $("#unlockPin");
  const lockStatus = $("#lockStatus");
  const lockPinInput = $("#lockPin");
  const lockPinConfirm = $("#lockPinConfirm");
  const lockCurrentPin = $("#lockCurrentPin");

  function updateLockStatus() {
    if (lockStatus) {
      lockStatus.textContent = lockMeta
        ? "Kunci riwayat aktif · terenkripsi"
        : "Kunci belum aktif";
    }
  }

  async function activateHistoryLock(pin) {
    if (!crypto?.subtle) {
      throw new Error(
        "Browser ini tidak mendukung enkripsi aman. Gunakan browser terbaru melalui HTTPS."
      );
    }

    const salt = crypto.getRandomValues(
      new Uint8Array(16)
    );

    const saltText = toBase64(salt);

    const key = await deriveVaultKey(
      pin,
      saltText
    );

    const vault = await encryptHistory(
      key,
      conversations
    );

    lockMeta = { salt: saltText };
    vaultKey = key;

    localStorage.setItem(
      LOCK_META,
      JSON.stringify(lockMeta)
    );

    localStorage.setItem(
      LOCK_VAULT,
      JSON.stringify(vault)
    );

    localStorage.removeItem(STORE);
    localStorage.removeItem(OLD_STORE);

    updateLockStatus();
  }

  $("#enableLock")?.addEventListener(
    "click",
    async () => {
      const pin = lockPinInput.value;

      if (pin.length < 6) {
        return alert("PIN harus minimal 6 karakter.");
      }

      if (pin !== lockPinConfirm.value) {
        return alert("Konfirmasi PIN tidak cocok.");
      }

      try {
        if (lockMeta) {
          if (!lockCurrentPin.value) {
            return alert(
              "Masukkan PIN saat ini untuk mengubah PIN."
            );
          }

          const currentKey = await deriveVaultKey(
            lockCurrentPin.value,
            lockMeta.salt
          );

          await decryptHistory(
            currentKey,
            JSON.parse(
              localStorage.getItem(LOCK_VAULT) || "null"
            )
          );
        }

        await activateHistoryLock(pin);

        lockPinInput.value = "";
        lockPinConfirm.value = "";
        lockCurrentPin.value = "";

        alert(
          "Kunci riwayat berhasil diaktifkan/diperbarui."
        );

      } catch (error) {
        alert(
          error.message || "Gagal mengaktifkan kunci."
        );
      }
    }
  );

  $("#disableLock")?.addEventListener(
    "click",
    async () => {
      if (!lockMeta || !vaultKey) {
        return alert(
          "Buka riwayat dengan PIN terlebih dahulu."
        );
      }

      const pin = prompt(
        "Masukkan PIN saat ini untuk menghapus kunci:"
      );

      if (pin === null) return;

      try {
        const checkKey = await deriveVaultKey(
          pin,
          lockMeta.salt
        );

        const vault = JSON.parse(
          localStorage.getItem(LOCK_VAULT) || "null"
        );

        const restored = await decryptHistory(
          checkKey,
          vault
        );

        conversations = restored;

        lockMeta = null;
        vaultKey = null;

        localStorage.removeItem(LOCK_META);
        localStorage.removeItem(LOCK_VAULT);
        localStorage.removeItem(OLD_STORE);

        localStorage.setItem(
          STORE,
          JSON.stringify(conversations)
        );

        updateLockStatus();

        alert("Kunci riwayat berhasil dihapus.");

      } catch {
        alert(
          "PIN salah atau data riwayat tidak bisa dibuka."
        );
      }
    }
  );

  lockForm?.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const vault = JSON.parse(
        localStorage.getItem(LOCK_VAULT) || "null"
      );

      if (!lockMeta || !vault) {
        throw new Error("Data kunci tidak ditemukan.");
      }

      const key = await deriveVaultKey(
        unlockPin.value,
        lockMeta.salt
      );

      conversations = await decryptHistory(
        key,
        vault
      );

      vaultKey = key;
      activeId = conversations[0]?.id || null;

      lockScreen.hidden = true;
      $(".app-shell").inert = false;

      renderHistory();
      renderMessages();
      updateLockStatus();

      unlockPin.value = "";

    } catch {
      $("#unlockError").textContent =
        "PIN salah. Coba lagi.";

      unlockPin.value = "";
    }
  });

  if (lockMeta) {
    lockScreen.hidden = false;
    $(".app-shell").inert = true;

    updateLockStatus();
    unlockPin?.focus();

  } else {
    updateLockStatus();
  }

  if (conversations.length) {
    activeId = conversations[0].id;
  } else {
    activeId = null;
    draftChat = null;
  }

  renderHistory();
  renderMessages();
})();
