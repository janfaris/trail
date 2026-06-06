"use client";

import { useEffect } from "react";

/**
 * Deep-link helper. When the page loads (or the hash changes) with a fragment
 * like `#event-12` or `#proof` that lives inside a collapsed `<details>`, native
 * hash navigation will NOT open the `<details>`, leaving the target invisible.
 *
 * This walks up from the target element and opens every ancestor `<details>`,
 * then scrolls the target into view. Renders nothing.
 */
export function OpenDetailsOnHash() {
  useEffect(() => {
    function openForHash() {
      const hash = window.location.hash;
      if (!hash || hash.length < 2) return;

      let target: Element | null = null;
      try {
        target = document.querySelector(hash);
      } catch {
        return;
      }
      if (!target) return;

      let node: Element | null = target;
      while (node) {
        if (node instanceof HTMLDetailsElement) node.open = true;
        node = node.parentElement;
      }
      target.scrollIntoView({ block: "start" });
    }

    openForHash();
    window.addEventListener("hashchange", openForHash);
    return () => window.removeEventListener("hashchange", openForHash);
  }, []);

  return null;
}
