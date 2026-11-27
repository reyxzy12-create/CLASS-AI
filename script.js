(() => {
  const $ = (selector) => document.querySelector(selector);
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");

  // Tombol Settings menggantikan indikator READY tanpa mengubah desain utama.
  const topPill = document.querySelector(".top-pill");
  if (topPill) {
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "top-pill top-settings-button";
    settingsButton.setAttribute("aria-label", "Buka Settings");
    settingsButton.innerHTML = '<span aria-hidden="true">⚙</span> SETTINGS';
    settingsButton.addEventListener("click", () => showPage("settings"));
    topPill.replaceWith(settingsButton);
  }

  // Tombol Buka dan efek blur untuk riwayat yang terkunci.
  const historyElement = $("#chatHistory");
  let openHistoryButton = null;

  if (historyElement) {
    openHistoryButton = document.createElement("button");
    openHistoryButton.type = "button";
    openHistoryButton.id = "openLockedHistory";
    openHistoryButton.className = "settings-action";
    openHistoryButton.textContent = "Buka";
    openHistoryButton.hidden = true;
    openHistoryButton.style.margin = "10px 0";

    openHistoryButton.addEventListener("click", () => {
      const screen = $("#historyLockScreen");
      if (screen) {
        screen.hidden = false;
        $("#unlockPin")?.focus();
      }
    });

    historyElement.insertAdjacentElement("afterend", openHistoryButton);
  }

  function setHistoryLocked(locked) {
    if (historyElement) {
      historyElement.style.filter = locked ? "blur(5px)" : "none";
      historyElement.style.pointerEvents = locked ? "none" : "auto";
      historyElement.style.userSelect = locked ? "none" : "auto";
      historyElement.setAttribute("aria-hidden", locked ? "true" : "false");
    }

    if (openHistoryButton) {
      openHistoryButton.hidden = !locked;
    }
  }

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
    } catch (error) {
      console.error("Gagal menyimpan riwayat:", error);
    }
  }

  function makeTitle(text) {
    const clean = String(text || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!clean) return "New chat";

    return clean.length > 32
      ? clean.slice(0, 32) + "..."
      : clean;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp || Date.now());

    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short"
    });
  }

  function renderHistory() {
    const history = $("#chatHistory");
    if (!history) return;

    history.innerHTML = "";

    const sorted = [...conversations].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    sorted.forEach(chat => {
      const item = document.createElement("div");
      item.className = "history-item";

      if (chat.id === activeId) {
        item.classList.add("active");
      }

      const title = document.createElement("button");
      title.type = "button";
      title.className = "history-title";
      title.textContent = chat.title || "New chat";

      title.addEventListener("click", () => {
        activeId = chat.id;
        draftChat = null;
        renderHistory();
        renderMessages();
        closeSidebar();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "history-delete";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Hapus riwayat");

      remove.addEventListener("click", async event => {
        event.stopPropagation();

        if (!confirm("Hapus percakapan ini?")) return;

        conversations = conversations.filter(
          item => item.id !== chat.id
        );

        if (activeId === chat.id) {
          activeId = conversations[0]?.id || null;
        }

        await save();
        renderHistory();
        renderMessages();
      });

      item.append(title, remove);
      history.appendChild(item);
    });
  }

  function renderMessages() {
    const messages = $("#messages");
    const welcome = $("#welcome");

    if (!messages) return;

    const chat = conversations.find(
      item => item.id === activeId
    );

    const list = chat?.messages || draftChat?.messages || [];

    messages.innerHTML = "";

    if (welcome) {
      welcome.hidden = list.length > 0;
    }

    list.forEach(message => {
      const wrapper = document.createElement("div");
      wrapper.className = `message ${message.role === "user" ? "user-message" : "ai-message"}`;

      const content = document.createElement("div");
      content.className = "message-content";

      if (message.image) {
        const image = document.createElement("img");
        image.src = message.image;
        image.alt = "Gambar yang dikirim";
        image.className = "message-image";
        content.appendChild(image);
      }

      const text = document.createElement("div");
      text.className = "message-text";

      if (message.role === "assistant" && window.marked && window.DOMPurify) {
        text.innerHTML = DOMPurify.sanitize(
          marked.parse(String(message.content || ""))
        );
      } else {
        text.textContent = message.content || "";
      }

      content.appendChild(text);
      wrapper.appendChild(content);
      messages.appendChild(wrapper);
    });

    messages.scrollTop = messages.scrollHeight;
  }

  function showPage(name) {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.remove("active-page");
    });

    const target = $(`#page-${name}`);
    if (target) {
      target.classList.add("active-page");
    }

    document.querySelectorAll("[data-page]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === name
      );
    });

    closeSidebar();
  }

  function openSidebar() {
    sidebar?.classList.add("open");
    scrim?.classList.add("show");
  }

  function closeSidebar() {
    sidebar?.classList.remove("open");
    scrim?.classList.remove("show");
  }

  $("#menuButton")?.addEventListener("click", openSidebar);
  $("#closeSidebar")?.addEventListener("click", closeSidebar);
  scrim?.addEventListener("click", closeSidebar);

  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

  $("#newChat")?.addEventListener("click", () => {
    activeId = null;
    draftChat = {
      id: String(Date.now()),
      title: "New chat",
      messages: [],
      updatedAt: Date.now()
    };

    renderHistory();
    renderMessages();
    closeSidebar();
    $("#chatInput")?.focus();
  });

  document.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => {
      const prompt = button.dataset.prompt || "";
      const input = $("#chatInput");

      if (input) {
        input.value = prompt;
        input.focus();
      }

      $("#chatForm")?.requestSubmit();
    });
  });

  const imageInput = $("#imageInput");
  const imagePreview = $("#imagePreview");

  imageInput?.addEventListener("change", () => {
    const file = imageInput.files?.[0];

    if (!file) {
      selectedImageData = null;
      if (imagePreview) {
        imagePreview.innerHTML = "";
        imagePreview.hidden = true;
      }
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Pilih file gambar.");
      imageInput.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      selectedImageData = reader.result;

      if (imagePreview) {
        imagePreview.innerHTML = `
          <img src="${selectedImageData}" alt="Preview gambar">
          <button type="button" id="removeImage" aria-label="Hapus gambar">×</button>
        `;

        imagePreview.hidden = false;

        $("#removeImage")?.addEventListener("click", () => {
          selectedImageData = null;
          imageInput.value = "";
          imagePreview.innerHTML = "";
          imagePreview.hidden = true;
        });
      }
    };

    reader.readAsDataURL(file);
  });

  async function sendMessage(content, imageData) {
    if (busy || (!content.trim() && !imageData)) return;

    busy = true;

    const input = $("#chatInput");
    const sendButton = $("#sendButton");

    if (sendButton) sendButton.disabled = true;

    let chat = conversations.find(
      item => item.id === activeId
    );

    if (!chat && draftChat) {
      chat = draftChat;
      conversations.unshift(chat);
      activeId = chat.id;
      draftChat = null;
    }

    if (!chat) {
      chat = {
        id: String(Date.now()),
        title: makeTitle(content),
        messages: [],
        updatedAt: Date.now()
      };

      conversations.unshift(chat);
      activeId = chat.id;
    }

    const userMessage = {
      role: "user",
      content,
      image: imageData || null
    };

    chat.messages.push(userMessage);
    chat.title = makeTitle(
      chat.messages.find(item => item.role === "user")?.content || content
    );
    chat.updatedAt = Date.now();

    if (input) input.value = "";

    selectedImageData = null;
    if (imageInput) imageInput.value = "";
    if (imagePreview) {
      imagePreview.innerHTML = "";
      imagePreview.hidden = true;
    }

    renderHistory();
    renderMessages();
    await save();

    const messages = $("#messages");
    const loading = document.createElement("div");
    loading.className = "message ai-message typing-indicator";
    loading.textContent = "CLASS-AI sedang mengetik...";
    messages?.appendChild(loading);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: chat.messages.map(item => ({
            role: item.role,
            content: item.content,
            image: item.image
          })),
          style: localStorage.getItem("classAI_style") || "normal"
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Gagal menghubungi AI.");
      }

      loading.remove();

      const answer = data.reply || data.message || data.content || "Maaf, AI tidak memberikan jawaban.";

      chat.messages.push({
        role: "assistant",
        content: answer
      });

      chat.updatedAt = Date.now();
      await save();

      renderHistory();
      renderMessages();

    } catch (error) {
      loading.remove();

      chat.messages.push({
        role: "assistant",
        content: `Maaf, terjadi kesalahan: ${error.message || "Tidak dapat menghubungi server."}`
      });

      await save();
      renderMessages();

    } finally {
      busy = false;
      if (sendButton) sendButton.disabled = false;
      input?.focus();
    }
  }

  $("#chatForm")?.addEventListener("submit", event => {
    event.preventDefault();

    const content = $("#chatInput")?.value || "";
    sendMessage(content, selectedImageData);
  });

  const appearanceSelect = $("#appearanceSelect");

  if (appearanceSelect) {
    appearanceSelect.value =
      localStorage.getItem("classAI_appearance") || "light";

    function applyAppearance(value) {
      const theme = value === "system"
        ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : value;

      document.documentElement.dataset.theme = theme;
    }

    applyAppearance(appearanceSelect.value);

    appearanceSelect.addEventListener("change", () => {
      localStorage.setItem(
        "classAI_appearance",
        appearanceSelect.value
      );
      applyAppearance(appearanceSelect.value);
    });
  }

  const profileName = $("#profileName");

  if (profileName) {
    profileName.value =
      localStorage.getItem("classAI_profile_name") || "";
  }

  $("#saveProfile")?.addEventListener("click", () => {
    localStorage.setItem(
      "classAI_profile_name",
      profileName?.value.trim() || ""
    );

    alert("Nama berhasil disimpan.");
  });

  const enterToSend = $("#enterToSend");

  if (enterToSend) {
    enterToSend.checked =
      localStorage.getItem("classAI_enter_to_send") !== "false";
  }

  enterToSend?.addEventListener("change", () => {
    localStorage.setItem(
      "classAI_enter_to_send",
      String(enterToSend.checked)
    );
  });

  $("#chatInput")?.addEventListener("keydown", event => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      enterToSend?.checked
    ) {
      event.preventDefault();
      $("#chatForm")?.requestSubmit();
    }
  });

  const aiStyle = $("#aiStyle");

  if (aiStyle) {
    aiStyle.value =
      localStorage.getItem("classAI_style") || "normal";

    aiStyle.addEventListener("change", () => {
      localStorage.setItem("classAI_style", aiStyle.value);
    });
  }

  $("#clearAllHistory")?.addEventListener("click", async () => {
    if (!confirm(
      "Hapus semua riwayat chat? Tindakan ini tidak bisa dibatalkan."
    )) return;

    conversations = [];
    activeId = null;
    draftChat = null;

    await save();

    renderHistory();
    renderMessages();
  });

  // LOCK HISTORY
  const lockScreen = $("#historyLockScreen");
  const lockForm = $("#historyUnlockForm");
  const unlockPin = $("#unlockPin");
  const lockStatus = $("#lockStatus");
  const lockPinInput = $("#lockPin");
  const lockPinConfirm = $("#lockPinConfirm");
  const lockCurrentPin = $("#lockCurrentPin");

  [
    lockCurrentPin,
    lockPinInput,
    lockPinConfirm,
    unlockPin
  ].forEach(field => {
    if (!field) return;

    field.setAttribute("inputmode", "numeric");
    field.setAttribute("pattern", "[0-9]*");
    field.setAttribute("autocomplete", "off");
  });

  [lockPinInput, lockPinConfirm].forEach(field => {
    if (field) field.minLength = 4;
  });

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

  $("#enableLock")?.addEventListener("click", async () => {
    const pin = lockPinInput?.value || "";

    if (!/^\d{4,}$/.test(pin)) {
      return alert("PIN harus berupa angka dan minimal 4 digit.");
    }

    if (pin !== lockPinConfirm?.value) {
      return alert("Konfirmasi PIN tidak cocok.");
    }

    try {
      if (lockMeta) {
        if (!lockCurrentPin?.value) {
          return alert(
            "Masukkan PIN saat ini untuk mengubah PIN."
          );
        }

        const currentKey = await deriveVaultKey(
          lockCurrentPin.value,
          lockMeta.salt
        );

        conversations = await decryptHistory(
          currentKey,
          JSON.parse(
            localStorage.getItem(LOCK_VAULT) || "null"
          )
        );
      }

      await activateHistoryLock(pin);
      setHistoryLocked(true);

      if (lockPinInput) lockPinInput.value = "";
      if (lockPinConfirm) lockPinConfirm.value = "";
      if (lockCurrentPin) lockCurrentPin.value = "";

      alert("Kunci riwayat berhasil diaktifkan/diperbarui.");

    } catch (error) {
      alert(error.message || "Gagal mengaktifkan kunci.");
    }
  });

  $("#disableLock")?.addEventListener("click", async () => {
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
      setHistoryLocked(false);
      renderHistory();

      alert("Kunci riwayat berhasil dihapus.");

    } catch {
      alert("PIN salah atau data riwayat tidak bisa dibuka.");
    }
  });

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

      if (lockScreen) lockScreen.hidden = true;

      setHistoryLocked(false);
      renderHistory();
      renderMessages();
      updateLockStatus();

      unlockPin.value = "";

      const unlockError = $("#unlockError");
      if (unlockError) unlockError.textContent = "";

    } catch {
      const unlockError = $("#unlockError");

      if (unlockError) {
        unlockError.textContent = "PIN salah. Coba lagi.";
      }

      if (unlockPin) unlockPin.value = "";
    }
  });

  if (lockMeta) {
    if (lockScreen) lockScreen.hidden = true;
    setHistoryLocked(true);
    updateLockStatus();
  } else {
    if (lockScreen) lockScreen.hidden = true;
    setHistoryLocked(false);
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
