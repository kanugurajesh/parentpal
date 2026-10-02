import { Platform } from "react-native";
import { color } from "@/theme/tokens";

/**
 * Web-only global CSS. Keyboard focus gets a clear ring via :focus-visible, while mouse and
 * touch clicks don't leave an outline behind. Native platforms use the system focus.
 */
export function installWebStyles() {
  if (Platform.OS !== "web" || typeof document === "undefined" || document.getElementById("pp-web")) return;
  const el = document.createElement("style");
  el.id = "pp-web";
  el.textContent = `
    [tabindex]:focus-visible, button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible {
      outline: 2px solid ${color.moss} !important;
      outline-offset: 2px;
    }
    [tabindex]:focus:not(:focus-visible) { outline: none; }
  `;
  document.head.appendChild(el);
}
