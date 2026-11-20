import "../styles.css";
import { createRoot } from "react-dom/client";
import { AdminAccessMatrix } from "@/components/AdminAccessMatrix";

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto w-full max-w-6xl p-2 sm:p-4">
    <AdminAccessMatrix />
  </main>,
);
