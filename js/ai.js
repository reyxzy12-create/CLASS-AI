(() => {
  "use strict";

  /* =========================================
     CLASS-AI
     Main application script
  ========================================= */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const STORAGE = {
    conversations: "forClassIX_conversations_v2",
    currentChat: "forClassIX_chat_v1",
    lock: "classAI_history_lock_v1",
    vault: "classAI_history_vault_v1",
    profile: "classAI_profile_v1",
    settings: "classAI_settings_v1"
  };

  const PBKDF2_ITERATIONS = 250000;

  const el = {
    sidebar: $("#sidebar"),
    scrim: $("#scrim"),
    menuButton: $("#menuButton"),
    closeSidebar: $("#closeSidebar"),
    newChat: $("#newChat"),

    history: $("#chatHistory"),
    historyProtected: $("#historyProtected"),
    historyOpenButton: $("#historyOpenButton"),

    chatContent: $("#chatContent"),
    messages: $("#messages"),
    welcome: $("#welcome"),
    chatForm: $("#chatForm"),
    chatInput: $("#chatInput"),
    sendButton: $("#sendButton"),

    imageInput: $("#imageInput"),
    imagePreview: $("#imagePreview"),

    topSettingsButton: $("#topSettingsButton"),

    appearanceSelect: $("#appearanceSelect"),
    profileName: $("#profileName"),
    saveProfile: $("#saveProfile"),
    enterToSend: $("#enterToSend"),
    aiStyle: $("#aiStyle"),

    clearAllHistory: $("#clearAllHistory"),

    lockSettings: $("#lockSettings"),
    lockStatus: $("#lockStatus"),
    lockCurrentPin: $("#lockCurrentPin"),
    lockPin: $("#lockPin"),
    lockPinConfirm: $("#lockPinConfirm"),
    enableLock: $("#enableLock"),
    disableLock: $("#disableLock"),

    lockScreen: $("#historyLockScreen"),
    unlockForm: $("#historyUnlockForm"),
    unlockPin: $("#unlockPin"),
    unlockError: $("#unlockError"),

    openAbout: $("#openAbout")
  };

  let conversations = [];
  let currentConversation = null;
  let pendingImage = null;
  let sending = false;

  let lockConfig = null;
  let encryptionKey = null;
  let historyUnlocked = false;

  let saveQueue = Promise.resolve();

  /* =========================================
     STORAGE
  ========================================= */

  function readJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function makeId() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 9)
    );
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function getSettings() {
    return readJSON(STORAGE.settings, {
      appearance: "system",
      enterToSend: true,
      aiStyle: "normal"
    });
  }

  function saveSettings(settings) {
    writeJSON(STORAGE.settings, settings);
  }

  /* =========================================
     ENCRYPTION
  ========================================= */

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function toBase64(bytes) {
    let binary = "";
    bytes.forEach(byte => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function fromBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  }

  async function deriveKey(pin, salt) {
    const encoder = new TextEncoder();

    const material = await crypto.subtle.importKey(
      "raw",
      encoder.encode(pin),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
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

  async function encryptData(data, key) {
    const iv = randomBytes(12);
    const encoded = new TextEncoder().encode(JSON.stringify(data));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded
    );

    return {
      iv: toBase64(iv),
      data: toBase64(new Uint8Array(encrypted))
    };
  }

  async function decryptData(encrypted, key) {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(encrypted.iv)
      },
      key,
      fromBase64(encrypted.data)
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  function validatePIN(pin) {
    return /^\d{4,}$/.test(pin);
  }

  function getVault() {
    return readJSON(STORAGE.vault, null);
  }

  async function saveEncryptedHistory() {
    if (!lockConfig || !encryptionKey || !historyUnlocked) return;

    const encrypted = await encryptData(conversations, encryptionKey);
    writeJSON(STORAGE.vault, encrypted);
  }

  function saveHistory() {
    if (lockConfig) {
      if (!historyUnlocked || !encryptionKey) return;

      saveQueue = saveQueue
        .then(saveEncryptedHistory)
        .catch(error => {
          console.error("Gagal menyimpan riwayat terenkripsi:", error);
        });

      return saveQueue;
    }

    writeJSON(STORAGE.conversations, conversations);
    if (currentConversation) {
      localStorage.setItem(STORAGE.currentChat, currentConversation.id);
    }
  }

  /* =========================================
     HISTORY LOCK
  ========================================= */

  function updateLockUI() {
    const locked = Boolean(lockConfig) && !historyUnlocked;

    if (el.history) {
      el.history.classList.toggle("history-locked", locked);
      el.history.classList.toggle("locked", locked);
      el.history.setAttribute("aria-hidden", String(locked));
    }

    if (el.historyProtected) {
      el.historyProtected.classList.toggle("history-locked", locked);
      el.historyProtected.classList.toggle("locked", locked);
    }

    if (el.historyOpenButton) {
      el.historyOpenButton.hidden = !locked;
      el.historyOpenButton.style.display = locked ? "" : "none";
    }

    if (el.lockStatus) {
      el.lockStatus.textContent = lockConfig
        ? "Kunci riwayat aktif"
        : "Kunci riwayat tidak aktif";
    }

    if (el.disableLock) {
      el.disableLock.disabled = !lockConfig;
    }
  }

  function openLockScreen() {
    if (!el.lockScreen) return;

    el.lockScreen.hidden = false;
    el.lockScreen.style.display = "";

    if (el.unlockPin) {
      el.unlockPin.value = "";
      el.unlockPin.focus();
    }

    if (el.unlockError) {
      el.unlockError.textContent = "";
    }
  }

  function closeLockScreen() {
    if (!el.lockScreen) return;

    el.lockScreen.hidden = true;
    el.lockScreen.style.display = "none";
  }

  async function enableOrChangePIN() {
    const currentPIN = el.lockCurrentPin?.value.trim() || "";
    const newPIN = el.lockPin?.value.trim() || "";
    const confirmPIN = el.lockPinConfirm?.value.trim() || "";

    if (!validatePIN(newPIN)) {
      alert("PIN harus berupa angka dan minimal 4 digit.");
      return;
    }

    if (newPIN !== confirmPIN) {
      alert("Konfirmasi PIN tidak cocok.");
      return;
    }

    try {
      let dataToEncrypt = conversations;

      if (lockConfig) {
        if (!currentPIN) {
          alert("Masukkan PIN lama terlebih dahulu.");
          return;
        }

        const oldKey = await deriveKey(
          currentPIN,
          fromBase64(lockConfig.salt)
        );

        dataToEncrypt = await decryptData(getVault(), oldKey);
      } else {
        dataToEncrypt = readJSON(
          STORAGE.conversations,
          conversations
        );
      }

      const salt = randomBytes(16);
      const newKey = await deriveKey(newPIN, salt);

      const encrypted = await encryptData(dataToEncrypt, newKey);

      const newConfig = {
        version: 1,
        salt: toBase64(salt),
        iterations: PBKDF2_ITERATIONS
      };

      writeJSON(STORAGE.vault, encrypted);
      writeJSON(STORAGE.lock, newConfig);

      lockConfig = newConfig;
      encryptionKey = newKey;
      conversations = dataToEncrypt;
      historyUnlocked = true;

      localStorage.removeItem(STORAGE.conversations);
      localStorage.removeItem(STORAGE.currentChat);

      currentConversation = conversations[0] || null;

      updateLockUI();
      renderHistory();

      if (el.lockCurrentPin) el.lockCurrentPin.value = "";
      if (el.lockPin) el.lockPin.value = "";
      if (el.lockPinConfirm) el.lockPinConfirm.value = "";

      alert("PIN berhasil disimpan.");
    } catch (error) {
      console.error(error);
      alert(
        lockConfig
          ? "PIN lama salah atau riwayat tidak dapat dibuka."
          : "Gagal mengaktifkan kunci riwayat."
      );
    }
  }

  async function disablePIN() {
    if (!lockConfig) {
      alert("Kunci riwayat belum aktif.");
      return;
    }

    const pin = el.lockCurrentPin?.value.trim() || "";

    if (!pin) {
      alert("Masukkan PIN saat ini.");
      return;
    }

    try {
      const key = await deriveKey(
        pin,
        fromBase64(lockConfig.salt)
      );

      const data = await decryptData(getVault(), key);

      conversations = Array.isArray(data) ? data : [];

      localStorage.removeItem(STORAGE.vault);
      localStorage.removeItem(STORAGE.lock);

      writeJSON(STORAGE.conversations, conversations);

      lockConfig = null;
      encryptionKey = null;
      historyUnlocked = true;

      currentConversation = conversations[0] || null;

      if (currentConversation) {
        localStorage.setItem(
          STORAGE.currentChat,
          currentConversation.id
        );
      }

      if (el.lockCurrentPin) el.lockCurrentPin.value = "";

      updateLockUI();
      renderHistory();

      alert("Kunci riwayat berhasil dinonaktifkan.");
    } catch (error) {
      alert("PIN salah. Kunci riwayat tidak dinonaktifkan.");
    }
  }

  async function unlockHistory(pin) {
    if (!lockConfig) return true;

    try {
      const key = await deriveKey(
        pin,
        fromBase64(lockConfig.salt)
      );

      const data = await decryptData(getVault(), key);

      if (!Array.isArray(data)) {
        throw new Error("Format riwayat tidak valid.");
      }

      conversations = data;
      encryptionKey = key;
      historyUnlocked = true;

      currentConversation = conversations[0] || null;

      closeLockScreen();
      updateLockUI();
      renderHistory();

      if (currentConversation) {
        loadConversation(currentConversation.id);
      } else {
        createNewChat();
      }

      return true;
    } catch {
      return false;
    }
  }

  async function initializeLock() {
    lockConfig = readJSON(STORAGE.lock, null);

    if (lockConfig) {
      historyUnlocked = false;
      encryptionKey = null;
      conversations = [];
      currentConversation = null;

      updateLockUI();
      renderHistory();
      return;
    }

    conversations = readJSON(STORAGE.conversations, []);
    historyUnlocked = true;

    const savedId = localStorage.getItem(STORAGE.currentChat);

    currentConversation =
      conversations.find(chat => chat.id === savedId) ||
      conversations[0] ||
      null;

    updateLockUI();
    renderHistory();

    if (currentConversation) {
      loadConversation(currentConversation.id);
    } else {
      createNewChat();
    }
  }

  /* =========================================
     SIDEBAR
  ========================================= */

  function openSidebar() {
    el.sidebar?.classList.add("open", "active");
    el.scrim?.classList.add("active");
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    el.sidebar?.classList.remove("open", "active");
    el.scrim?.classList.remove("active");
    document.body.classList.remove("sidebar-open");
  }

  el.menuButton?.addEventListener("click", openSidebar);
  el.closeSidebar?.addEventListener("click", closeSidebar);
  el.scrim?.addEventListener("click", closeSidebar);

  /* =========================================
     PAGE NAVIGATION
  ========================================= */

  function showPage(pageName) {
    const pageId = "page-" + pageName;

    ["chat", "settings", "about"].forEach(name => {
      const page = document.getElementById("page-" + name);
      if (!page) return;

      const active = page.id === pageId;

      page.hidden = !active;
      page.classList.toggle("active", active);
      page.classList.toggle("active-page", active);
      page.setAttribute("aria-hidden", String(!active));
    });

    $$("[data-page]").forEach(button => {
      const active = button.dataset.page === pageName;

      button.classList.toggle("active", active);

      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    closeSidebar();
  }

  $$("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

  el.topSettingsButton?.addEventListener("click", () => {
    showPage("settings");
  });

  el.openAbout?.addEventListener("click", () => {
    showPage("about");
  });

  /* =========================================
     CHAT DISPLAY
  ========================================= */

  function renderMarkdown(content) {
    const text = String(content ?? "");

    if (window.marked && window.DOMPurify) {
      const html = window.marked.parse(text);
      return window.DOMPurify.sanitize(html);
    }

    return escapeHTML(text).replace(/\n/g, "<br>");
  }

  function scrollToBottom() {
    if (el.chatContent) {
      el.chatContent.scrollTop = el.chatContent.scrollHeight;
    }

    if (el.messages) {
      el.messages.scrollTop = el.messages.scrollHeight;
    }
  }

  function createMessageElement(role, content = "") {
    const message = document.createElement("div");

    message.className =
      role === "user"
        ? "message user"
        : "message assistant";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    bubble.innerHTML = renderMarkdown(content);

    message.appendChild(bubble);

    return message;
  }

  function displayMessage(role, content) {
    if (!el.messages) return null;

    const message = createMessageElement(role, content);

    el.messages.appendChild(message);

    if (el.welcome) {
      el.welcome.style.display = "none";
    }

    scrollToBottom();

    return message;
  }

  function renderMessages() {
    if (!el.messages) return;

    el.messages.innerHTML = "";

    const messages = currentConversation?.messages || [];

    if (!messages.length) {
      if (el.welcome) el.welcome.style.display = "";
      return;
    }

    if (el.welcome) el.welcome.style.display = "none";

    messages.forEach(message => {
      const element = displayMessage(
        message.role,
        message.content
      );

      if (message.image && element) {
        const image = document.createElement("img");
        image.src = message.image;
        image.alt = "Gambar yang dikirim";
        image.className = "message-image";

        element.querySelector(".message-bubble")?.prepend(image);
      }
    });

    scrollToBottom();
  }

  /* =========================================
     CONVERSATION HISTORY
  ========================================= */

  function createNewChat() {
    if (lockConfig && !historyUnlocked) {
      alert("Buka kunci riwayat terlebih dahulu.");
      openLockScreen();
      return;
    }

    currentConversation = {
      id: makeId(),
      title: "Chat baru",
      messages: [],
      updatedAt: Date.now()
    };

    conversations.unshift(currentConversation);

    saveHistory();
    renderHistory();
    renderMessages();

    showPage("chat");

    if (el.chatInput) el.chatInput.focus();
  }

  function loadConversation(id) {
    const conversation = conversations.find(chat => chat.id === id);

    if (!conversation) return;

    currentConversation = conversation;

    if (!lockConfig) {
      localStorage.setItem(STORAGE.currentChat, id);
    }

    renderMessages();
    renderHistory();
    showPage("chat");
  }

  function deleteConversation(id) {
    const confirmed = confirm("Hapus percakapan ini?");
    if (!confirmed) return;

    conversations = conversations.filter(chat => chat.id !== id);

    if (currentConversation?.id === id) {
      currentConversation = null;

      if (conversations.length) {
        currentConversation = conversations[0];
      } else {
        createNewChat();
      }
    }

    saveHistory();
    renderHistory();
    renderMessages();
  }

  function renderHistory() {
    if (!el.history) return;

    el.history.innerHTML = "";

    if (lockConfig && !historyUnlocked) {
      updateLockUI();
      return;
    }

    conversations
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .forEach(conversation => {
        const item = document.createElement("div");
        item.className = "history-item";

        if (conversation.id === currentConversation?.id) {
          item.classList.add("active");
        }

        const title = document.createElement("button");
        title.type = "button";
        title.className = "history-title";
        title.textContent = conversation.title || "Chat baru";

        title.addEventListener("click", () => {
          loadConversation(conversation.id);
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "history-delete";
        remove.textContent = "×";
        remove.setAttribute("aria-label", "Hapus riwayat");

        remove.addEventListener("click", event => {
          event.stopPropagation();
          deleteConversation(conversation.id);
        });

        item.append(title, remove);
        el.history.appendChild(item);
      });

    updateLockUI();
  }

  el.newChat?.addEventListener("click", createNewChat);

  el.historyOpenButton?.addEventListener("click", openLockScreen);

  /* =========================================
     CHAT INPUT
  ========================================= */

  function updateConversationTitle() {
    if (!currentConversation) return;

    const firstUserMessage = currentConversation.messages.find(
      message => message.role === "user"
    );

    if (firstUserMessage) {
      currentConversation.title =
        firstUserMessage.content.slice(0, 38) || "Chat baru";
    }

    currentConversation.updatedAt = Date.now();
  }

  function setSending(value) {
    sending = value;

    if (el.sendButton) {
      el.sendButton.disabled = value;
    }

    if (el.chatInput) {
      el.chatInput.disabled = value;
    }
  }

  async function sendMessage(event) {
    event?.preventDefault();

    if (sending) return;

    if (lockConfig && !historyUnlocked) {
      openLockScreen();
      return;
    }

    const content = el.chatInput?.value.trim() || "";

    if (!content && !pendingImage) return;

    if (!window.ClassAI || typeof window.ClassAI.reply !== "function") {
      alert("AI belum siap. Periksa file js/ai.js.");
      return;
    }

    if (!currentConversation) {
      currentConversation = {
        id: makeId(),
        title: "Chat baru",
        messages: [],
        updatedAt: Date.now()
      };

      conversations.unshift(currentConversation);
    }

    const imageData = pendingImage;

    const userMessage = {
      role: "user",
      content: content || "Apa isi gambar ini?"
    };

    if (imageData) {
      userMessage.image = imageData;
    }

    currentConversation.messages.push(userMessage);

    displayMessage("user", userMessage.content);

    if (imageData) {
      const image = document.createElement("img");
      image.src = imageData;
      image.alt = "Gambar yang dikirim";
      image.className = "message-image";

      const lastMessage = el.messages?.lastElementChild;
      lastMessage?.querySelector(".message-bubble")?.prepend(image);
    }

    if (el.chatInput) {
      el.chatInput.value = "";
      el.chatInput.style.height = "";
    }

    clearImagePreview();

    updateConversationTitle();
    saveHistory();
    renderHistory();

    const assistantElement = displayMessage("assistant", "");
    const assistantBubble = assistantElement?.querySelector(
      ".message-bubble"
    );

    setSending(true);

    try {
      const messages = currentConversation.messages.map(message => ({
        role: message.role,
        content: message.content
      }));

      const preferences = {
        style: el.aiStyle?.value || getSettings().aiStyle || "normal"
      };

      const result = await window.ClassAI.reply(
        messages,
        fullText => {
          if (assistantBubble) {
            assistantBubble.innerHTML = renderMarkdown(fullText);
          }
          scrollToBottom();
        },
        imageData,
        preferences
      );

      const answer = result || "";

      currentConversation.messages.push({
        role: "assistant",
        content: answer
      });

      if (assistantBubble) {
        assistantBubble.innerHTML = renderMarkdown(answer);
      }

      updateConversationTitle();
      saveHistory();
      renderHistory();
    } catch (error) {
      console.error("CLASS-AI error:", error);

      const errorMessage =
        error.message || "Terjadi kesalahan saat menghubungi AI.";

      if (assistantBubble) {
        assistantBubble.textContent = errorMessage;
      }

      currentConversation.messages.push({
        role: "assistant",
        content: errorMessage
      });

      saveHistory();
    } finally {
      setSending(false);
      el.chatInput?.focus();
    }
  }

  el.chatForm?.addEventListener("submit", sendMessage);

  el.chatInput?.addEventListener("keydown", event => {
    const settings = getSettings();

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      settings.enterToSend !== false
    ) {
      event.preventDefault();
      el.chatForm?.requestSubmit();
    }
  });

  el.chatInput?.addEventListener("input", () => {
    el.chatInput.style.height = "auto";
    el.chatInput.style.height =
      Math.min(el.chatInput.scrollHeight, 180) + "px";
  });

  /* =========================================
     IMAGE UPLOAD
  ========================================= */

  function clearImagePreview() {
    pendingImage = null;

    if (el.imagePreview) {
      el.imagePreview.innerHTML = "";
      el.imagePreview.hidden = true;
    }

    if (el.imageInput) {
      el.imageInput.value = "";
    }
  }

  function showImagePreview(data) {
    if (!el.imagePreview) return;

    el.imagePreview.hidden = false;
    el.imagePreview.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "image-preview-item";

    const image = document.createElement("img");
    image.src = data;
    image.alt = "Pratinjau gambar";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Hapus gambar");

    remove.addEventListener("click", clearImagePreview);

    wrapper.append(image, remove);
    el.imagePreview.appendChild(wrapper);
  }

  el.imageInput?.addEventListener("change", event => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("File harus berupa gambar.");
      clearImagePreview();
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert("Ukuran gambar maksimal 8 MB.");
      clearImagePreview();
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      pendingImage = reader.result;
      showImagePreview(pendingImage);
    };

    reader.onerror = () => {
      alert("Gagal membaca gambar.");
    };

    reader.readAsDataURL(file);
  });

  /* =========================================
     SUGGESTIONS
  ========================================= */

  $$(".suggestion").forEach(button => {
    button.addEventListener("click", () => {
      const prompt = button.dataset.prompt || "";

      if (el.chatInput) {
        el.chatInput.value = prompt;
        el.chatInput.focus();
      }

      el.chatForm?.requestSubmit();
    });
  });

  /* =========================================
     SETTINGS
  ========================================= */

  function applyAppearance(value) {
    const appearance = value || "system";

    if (appearance === "system") {
      const dark = window.matchMedia?.(
        "(prefers-color-scheme: dark)"
      ).matches;

      document.documentElement.dataset.theme =
        dark ? "dark" : "light";

      document.body.classList.toggle("dark", Boolean(dark));
    } else {
      document.documentElement.dataset.theme = appearance;
      document.body.classList.toggle(
        "dark",
        appearance === "dark"
      );
    }
  }

  function initializeSettings() {
    const settings = getSettings();

    if (el.appearanceSelect) {
      el.appearanceSelect.value = settings.appearance || "system";
    }

    if (el.enterToSend) {
      el.enterToSend.checked = settings.enterToSend !== false;
    }

    if (el.aiStyle) {
      el.aiStyle.value = settings.aiStyle || "normal";
    }

    const profile = readJSON(STORAGE.profile, { name: "" });

    if (el.profileName) {
      el.profileName.value = profile.name || "";
    }

    applyAppearance(settings.appearance || "system");
  }

  el.appearanceSelect?.addEventListener("change", () => {
    const settings = getSettings();

    settings.appearance = el.appearanceSelect.value;

    saveSettings(settings);
    applyAppearance(settings.appearance);
  });

  el.enterToSend?.addEventListener("change", () => {
    const settings = getSettings();

    settings.enterToSend = el.enterToSend.checked;

    saveSettings(settings);
  });

  el.aiStyle?.addEventListener("change", () => {
    const settings = getSettings();

    settings.aiStyle = el.aiStyle.value;

    saveSettings(settings);
  });

  el.saveProfile?.addEventListener("click", () => {
    const name = el.profileName?.value.trim() || "";

    writeJSON(STORAGE.profile, { name });

    alert("Profil berhasil disimpan.");
  });

  /* =========================================
     LOCK SETTINGS BUTTONS
  ========================================= */

  el.enableLock?.addEventListener("click", enableOrChangePIN);

  el.disableLock?.addEventListener("click", disablePIN);

  el.unlockForm?.addEventListener("submit", async event => {
    event.preventDefault();

    const pin = el.unlockPin?.value.trim() || "";

    if (!validatePIN(pin)) {
      if (el.unlockError) {
        el.unlockError.textContent = "Masukkan PIN minimal 4 digit.";
      }
      return;
    }

    const success = await unlockHistory(pin);

    if (!success && el.unlockError) {
      el.unlockError.textContent = "PIN salah. Coba lagi.";
      el.unlockPin.value = "";
      el.unlockPin.focus();
    }
  });

  /* =========================================
     CLEAR HISTORY
  ========================================= */

  el.clearAllHistory?.addEventListener("click", async () => {
    const confirmed = confirm(
      "Yakin ingin menghapus semua riwayat percakapan?"
    );

    if (!confirmed) return;

    conversations = [];
    currentConversation = null;

    if (lockConfig && encryptionKey && historyUnlocked) {
      await saveEncryptedHistory();
    } else if (!lockConfig) {
      localStorage.removeItem(STORAGE.conversations);
      localStorage.removeItem(STORAGE.currentChat);
    }

    renderHistory();
    createNewChat();

    alert("Semua riwayat berhasil dihapus.");
  });

  /* =========================================
     MODAL CLOSE
  ========================================= */

  el.lockScreen?.addEventListener("click", event => {
    if (event.target === el.lockScreen) {
      closeLockScreen();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeSidebar();
    }
  });

  /* =========================================
     INITIALIZE
  ========================================= */

  async function initialize() {
    initializeSettings();

    if (!window.crypto?.subtle) {
      console.error(
        "Web Crypto tidak tersedia. Gunakan website melalui HTTPS."
      );
    }

    await initializeLock();

    if (el.lockScreen) {
      el.lockScreen.hidden = true;
      el.lockScreen.style.display = "none";
    }

    updateLockUI();

    console.log("CLASS-AI berhasil dimuat.");
  }

  initialize().catch(error => {
    console.error("CLASS-AI initialization error:", error);
  });

})();
