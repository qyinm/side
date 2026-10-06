import "./styles.css";

function publicUrl(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const downloadUrl = publicUrl(import.meta.env.VITE_DOWNLOAD_URL);
const productHuntUrl = publicUrl(import.meta.env.VITE_PRODUCT_HUNT_URL);
if (downloadUrl) {
  document.querySelectorAll("[data-download]").forEach((link) => {
    link.href = downloadUrl;
  });
}

if (productHuntUrl) {
  const link = document.querySelector("#product-hunt-link");
  link.href = productHuntUrl;
  link.hidden = false;
}

const examples = {
  writing: {
    question: "Make this warmer: “Please send the file today.”",
    answer: "“Could you send the file over today? I’d really appreciate it.”",
    note: "A little softer. Still clear about what you need.",
  },
  idea: {
    question: "A fresh angle for a neighborhood book club?",
    answer:
      "Try “one book, three places.” Meet at a different local spot for each part of the book, and let the setting start the conversation.",
    note: "The same story, with a new perspective each time.",
  },
  explain: {
    question: "Explain an API like I’m ordering coffee.",
    answer:
      "Think of an API as the menu and the counter. You ask for something in a way the café understands; the kitchen does the work and hands back your order.",
    note: "You don’t need to walk into the kitchen to get your coffee.",
  },
};

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    const example = examples[button.dataset.prompt];
    document
      .querySelectorAll("[data-prompt]")
      .forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
    document.querySelector("#demo-question").textContent = example.question;
    document.querySelector("#demo-answer").textContent = example.answer;
    document.querySelector("#demo-note").textContent = example.note;
  });
});
