import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

function hideSplash() {
  const s = document.getElementById("app-splash");
  if (s) {
    s.classList.add("hide");
    setTimeout(() => s.remove(), 450);
  }
}

createRoot(document.getElementById("root")).render(<App />);

// Remove the splash once mounted. Several triggers so it can never get stuck:
setTimeout(hideSplash, 600);          // normal case
window.addEventListener("load", hideSplash);
