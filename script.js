
(() => {
  const $ = (selector) => document.querySelector(selector);
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");

  const STORE = "forClassIX_conversations_v2";
  const OLD_STORE = "forClassIX_chat_v1";

  let conversations = [];
  let activeId = null;
  let busy = false;

  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");

    if (Array.isArray(saved)) {
      conversations = saved;
    } else {
      // Pindahkan chat lama ke format riwayat baru.
      const oldMessages = JSON.parse(localStorage.getItem(OLD_STORE) || "[]");
      if (oldMessages.length) {
        conversations = [{
          id: String(Date.now()),
          title: makeTitle(oldMessages[0]?.content || "Percakapan lama"),
          messages: oldMessages,
          updatedAt: Date.now()
        }];
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

  function makeTitle(text) {
    return String(text || "Percakapan baru")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 34) || "Percakapan baru";
  }

  function currentChat() {
    return conversations.find(chat => chat.id === activeId);
  }

  function createChat() {
    const chat = {
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      title: "Percakapan baru",
      messages: [],
      updatedAt: Date.now()
    };

    conversations.unshift(chat);
    activeId = chat.id;
    save();
    renderHistory();
    renderMessages();
  }

  function renderHistory() {
    const history = $("#chatHistory");
    if (!history) return;

    history.innerHTML = "";

    conversations
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach(chat => {
        const item = document.createElement("button");
        item.className = "history-item" + (chat.id === activeId ? " selected" : "");
        item.textContent = chat.title || "Percakapan baru";
        item.title = item.textContent;

        item.addEventListener("click", () => {
          if (busy) return;
          activeId = chat.id;
          renderHistory();
          renderMessages();
          showPage("chat");
        });

        history.appendChild(item);
      });
  }

  function showPage(name) {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle("active-page", page.id === "page-" + name);
    });

    document.querySelectorAll(".nav-item[data-page]").forEach(button => {
      button.classList.toggle("active", button.dataset.page === name);
    });

    const titles = {
      chat: "CLASS-AI",
      ml: "FAKE ML",
      about: "ABOUT CLASS IX"
    };

    $("#topTitle").textContent = titles[name] || "CLASS-AI";
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
  }

  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.page));
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

    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

    return text;
  }

  function renderMarkdown(source) {
    const lines = String(source || "").replace(/\r/g, "").split("\n");
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
        html += "</tbody></table>";
        inTable = false;
      }
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
          html += `<div class="code-block"><div class="code-toolbar"><span>CODE</span><button type="button" class="copy-code">Salin kode</button></div><pre><code>${escapeHTML(code.join("\n"))}</code></pre></div>`;
          inCode = false;
        }
        continue;
      }

      if (inCode) {
        code.push(line);
        continue;
      }

      // Tabel Markdown
      if (line.includes("|") && i + 1 < lines.length &&
          /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        closeList();
        closeTable();

        const cells = line.split("|").map(s => s.trim()).filter(Boolean);
        i++;
        html += "<div class=\"table-wrap\"><table class=\"ai-table\"><thead><tr>";
        cells.forEach(cell => html += `<th>${inlineFormat(cell)}</th>`);
        html += "</tr></thead><tbody>";
        inTable = true;
        continue;
      }

      if (inTable && line.includes("|")) {
        const cells = line.split("|").map(s => s.trim()).filter(Boolean);
        html += "<tr>";
        cells.forEach(cell => html += `<td>${inlineFormat(cell)}</td>`);
        html += "</tr>";
        continue;
      } else {
        closeTable();
      }

      if (!line.trim()) {
        closeList();
        continue;
      }

      const heading = line.match(/^(#{1,4})\s+(.+)$/);
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
        html += `<li>${inlineFormat(line.replace(/^\s*[-*]\s+/, ""))}</li>`;
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        if (!inList || listType !== "ol") {
          closeList();
          html += "<ol>";
          inList = true;
          listType = "ol";
        }
        html += `<li>${inlineFormat(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`;
        continue;
      }

      closeList();

      if (/^>\s?/.test(line)) {
        html += `<blockquote>${inlineFormat(line.replace(/^>\s?/, ""))}</blockquote>`;
        continue;
      }

      html += `<p>${inlineFormat(line)}</p>`;
    }

    if (inCode) {
      html += `<div class="code-block"><div class="code-toolbar"><span>CODE</span><button type="button" class="copy-code">Salin kode</button></div><pre><code>${escapeHTML(code.join("\n"))}</code></pre></div>`;
    }

    closeList();
    closeTable();
    return html;
  }

  function addCopyButtons(container) {
    container.querySelectorAll(".copy-code").forEach(button => {
      button.addEventListener("click", async () => {
        const code = button.closest(".code-block")?.querySelector("code")?.textContent || "";

        try {
          await navigator.clipboard.writeText(code);
          button.textContent = "Tersalin!";
        } catch {
          button.textContent = "Gagal menyalin";
        }

        setTimeout(() => button.textContent = "Salin kode", 1600);
      });
    });
  }

  function renderMessages() {
    const chat = currentChat();
    const messages = chat?.messages || [];

    messagesEl.innerHTML = "";
    welcome.style.display = messages.length ? "none" : "block";

    messages.forEach(message => {
      const row = document.createElement("div");
      row.className = "message " + (message.role === "user" ? "user" : "assistant");

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

  document.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.prompt || "";
      input.focus();
    });
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
  });

  $("#chatForm").addEventListener("submit", async event => {
    event.preventDefault();

    const text = input.value.trim();
    if (!text || busy) return;

    if (!currentChat()) createChat();

    const chat = currentChat();
    chat.messages.push({ role: "user", content: text });
    chat.title = chat.messages.length === 1 ? makeTitle(text) : chat.title;
    chat.updatedAt = Date.now();

    input.value = "";
    input.style.height = "auto";
    busy = true;
    sendButton.disabled = true;
    sendButton.textContent = "…";

    chat.messages.push({ role: "assistant", content: "" });
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
        "Maaf, CLASS-AI belum bisa terhubung.\n\n" + (error.message || "");
    }

    chat.updatedAt = Date.now();
    save();
    renderHistory();
    renderMessages();

    busy = false;
    sendButton.disabled = false;
    sendButton.textContent = "↑";
  });

  // Memulai dengan chat kosong, tanpa menghapus riwayat sebelumnya.
  if (conversations.length) {
    activeId = conversations[0].id;
  } else {
    createChat();
  }

  renderHistory();
  renderMessages();

  // Fake ML tetap aktif jika modulnya tersedia.
  window.FakeML?.init();
})();
