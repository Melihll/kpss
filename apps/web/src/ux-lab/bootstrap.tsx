import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { UxLab } from "./UxLab";
import "./lab.css";
import "./coach-v2.css";
import "./coach-production-fusion.css";
import "./coach-top-navigation.css";

document.title = "KPSS Koçu · UX Lab";
document.documentElement.lang = "tr";
createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><UxLab /></BrowserRouter></StrictMode>,
);
