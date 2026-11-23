window.FakeFF = {
  init() {
    const canvas = document.querySelector("#ffCanvas");
    const ctx = canvas.getContext("2d");

    const nameInput = document.querySelector("#ffName");
    const tagInput = document.querySelector("#ffTag");
    const colorInput = document.querySelector("#ffColor");

    const enterButton = document.querySelector("#renderFf");
    const downloadButton = document.querySelector("#downloadFf");
    const previewPanel = document.querySelector("#ffPreviewPanel");

    let currentImage = null;
    let generated = false;
    let lastNumber = 0;

    // Sembunyikan hasil sebelum tombol ditekan
    previewPanel.hidden = true;

    function drawResult() {
      if (!currentImage) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        currentImage,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const name =
        nameInput.value.trim().slice(0, 22) || "PLAYER";

      const tag =
        tagInput.value.trim().slice(0, 24);

      const color = colorInput.value;

      ctx.save();
      ctx.textAlign = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 8;

      ctx.font = "800 29px Arial";
      ctx.fillStyle = color;
      ctx.fillText(
        name,
        canvas.width * 0.51,
        canvas.height * 0.807,
        canvas.width * 0.62
      );

      ctx.font = "bold 13px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        tag,
        canvas.width * 0.51,
        canvas.height * 0.825,
        canvas.width * 0.55
      );

      ctx.restore();
    }

    function generatePhoto() {
      enterButton.disabled = true;
      enterButton.textContent = "MEMBUAT FOTO...";

      let randomNumber;

      // Hindari mendapat foto yang sama dua kali berturut-turut
      do {
        randomNumber = Math.floor(Math.random() * 6) + 2;
      } while (randomNumber === lastNumber);

      const image = new Image();

      image.onload = () => {
        currentImage = image;
        lastNumber = randomNumber;
        generated = true;

        drawResult();

        previewPanel.hidden = false;

        enterButton.disabled = false;
        enterButton.textContent = "✦ Buat Foto";
      };

      image.onerror = () => {
        enterButton.disabled = false;
        enterButton.textContent = "✦ Buat Foto";

        alert(
          "Foto gagal dimuat. Periksa folder assets/fake-ff dan nama fotonya."
        );
      };

      image.src = `/assets/fake-ff/${randomNumber}.jpg`;
    }

    enterButton.addEventListener("click", generatePhoto);

    [nameInput, tagInput, colorInput].forEach((input) => {
      input.addEventListener("input", () => {
        if (generated) drawResult();
      });

      input.addEventListener("change", () => {
        if (generated) drawResult();
      });
    });

    downloadButton.addEventListener("click", () => {
      if (!generated) {
        alert("Tekan Buat Foto terlebih dahulu!");
        return;
      }

      drawResult();

      const link = document.createElement("a");
      link.download = "for-class-ix-fake-ff.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  }
};
