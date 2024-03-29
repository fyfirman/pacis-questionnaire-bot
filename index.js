const puppeteer = require("puppeteer");
const fs = require("fs");
const ocr = require("./ocr");
require("dotenv").config();

const nilaiDosen = process.env.NILAI_DOSEN || 7;
const pausUsername = process.env.PAUS_USERNAME;
const pausPassword = process.env.PAUS_PASSWORD;

puppeteer
  .launch({ headless: false })
  .then(async (browser) => {
    // Initialize
    const page = await browser.newPage();
    page.setViewport({
      width: 1200,
      height: 800,
    });

    await page
      .goto("https://paus.unpad.ac.id/oauth/sign-in", {
        waitUntil: ["networkidle2", "domcontentloaded"],
      })
      .then(() => console.log("Menunggu login..."));

    async function fillSignInForm() {
      // Insert username
      await page.evaluate(
        () => (document.querySelector("input[name = username]").value = "")
      );
      const username = await page.$("input[name = username]");
      await username.type(pausUsername);

      // Insert password
      const pass = await page.$("input[name = password]");
      await pass.type(pausPassword);
    }

    async function captchaSolve() {
      // Prepare captcha image
      const IMAGE_SELECTOR = ".captcha-img > img";
      let imageHref = await page.evaluate((sel) => {
        return document.querySelector(sel).getAttribute("src");
      }, IMAGE_SELECTOR);

      const imgPage = await browser.newPage();
      var viewSource = await imgPage.goto(imageHref);
      fs.writeFile("a.jpeg", await viewSource.buffer(), function (err) {
        if (err) return console.log(err);
      });
      imgPage.close();

      const captchaText = await ocr.captchaOCR();
      const captcha = await page.$("input[name = captcha]");
      await captcha.type(captchaText);

      // Click sign in button
      const button = await page
        .$(".ui.form .right.aligned.field .button:last-child")
        .catch((error) => console.error(error));
      await button.evaluate((b) => b.click());
    }

    async function interceptSignIn() {
      page
        .waitForSelector(".ui.error.message", { visible: true })
        .then(async () => {
          await fillSignInForm();
          await captchaSolve();
        });
    }

    await fillSignInForm();

    // If credentials not yet configured, skip captcha autosolver
    if (ocr.isConfigured()) {
      page.on("load", interceptSignIn);
      await captchaSolve();
    }

    // Redirecting to permission page & accept it
    page.waitForSelector(".account-name", { visible: true }).then(async () => {
      console.log("Berhasil sign in");
      page.off("load", interceptSignIn);
      await page
        .goto("https://students.unpad.ac.id/pacis/mhs_home", {
          waitUntil: ["networkidle2", "domcontentloaded"],
        })
        .then(() => console.log("Berhasil masuk ke halaman beranda"));

      // Click approve button
      const button = await page
        .$(".btn-approve")
        .catch((error) => console.error(error));
      await button
        .evaluate((b) => b.click())
        .then(() => console.log("Izin telah diterima."));
    });

    // If tagihan prompt still exists
    page.waitForSelector("#next", { visible: true }).then(async () => {
      await page.$eval(
        "#next",
        (b) => b.click()
      );
    }).catch ((error) => {
      console.log("Lompat ke transkrip nilai page");
    });

    // Redirecting to transkrip nilai page
    page.waitForSelector("#menu", { visible: true }).then(async () => {
      const urlHalamanTranskrip =
        "https://students.unpad.ac.id/pacis/akademik/transkrip_nilai";
      await page
        .goto(urlHalamanTranskrip, {
          waitUntil: ["networkidle2", "domcontentloaded"],
        })
        .then(() => console.log("Berhasil ke halaman transkrip."));

      const links = await page.$$eval(".tombol", (link) =>
        link.map((a) => a.href)
      );

      for (let link of links) {
        const newTab = await browser.newPage();
        await newTab.goto(link);

        await newTab
          .waitForSelector("#formdata")
          .then("Memasuki halaman kuisoner");

        // Fill form
        for (let i = 0; i < 9; i++) {
          await newTab
            .click(`#pilih_${174 + i}${nilaiDosen}`)
            .then(() =>
              console.log(
                `--> Memilih nilai ${nilaiDosen} untuk pertanyaan ${i + 1}`
              )
            );
        }

        await newTab.$eval("#simpan", (b) => b.click());
        setTimeout(async () => {
          await newTab.$eval(
            ".ui-button.ui-widget.ui-state-default.ui-corner-all.ui-button-text-only",
            (b) => b.click()
          );
          console.log("Berhasil mengisi kuisoner");
          newTab.close();
        }, 2000); // Here is disadvantage. The program have to wait button confirmation apperead, but i can't solve it cause  questionnaire is already filled. Haha
      }

      page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });

      console.log(`====================================`);
      console.log(`${links.length} kuisoner telah diisi`);
      console.log(`Have a good day! -fyfirman`);
    });
  })
  .catch((error) => {
    console.error(error);
  });
