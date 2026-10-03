import React from "react";
import { createRoot } from "react-dom/client";
import { DashboardApp } from "@/components/dashboard-app";
import { Providers } from "@/app/providers";
import "@/app/globals.css";
const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <Providers>
        <DashboardApp userName="Visitor" />
      </Providers>
    </React.StrictMode>,
  );
}
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(console.error));
}
