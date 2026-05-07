import { createRoot } from "react-dom/client";
import { SpeedInsights } from "@vercel/speed-insights/react";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
	<>
		<App />
		<SpeedInsights />
	</>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("/sw.js");
	});
}
