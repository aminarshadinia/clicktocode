"use client";
/**
 * @clicktocode/next — click an element in your running Next.js app and hand it
 * to a coding agent. Works with both the App Router and the Pages Router.
 *
 * Two pieces are needed in a Next app (Next has no Vite config to hook):
 *   1. Start the bridge server once at dev startup — see
 *      `@clicktocode/next/instrumentation` (add 3 lines to instrumentation.ts).
 *   2. Load the picker in the browser — render <ClickToCode /> (this file).
 *
 * The picker reads the React fiber, so it grabs DOM rendered by CLIENT
 * components. In the App Router, Server Component DOM has no client fiber, so
 * a grab resolves to the nearest "use client" component boundary. The Pages
 * Router has no Server Components, so everything is grabbable.
 */
import { useEffect } from "react";
import type { OpenCodeAdapterOptions } from "@clicktocode/react";

export interface ClickToCodeProps {
  /** Bridge server URL. Default http://127.0.0.1:6567. */
  serverUrl?: string;
  /**
   * OpenCode options passed on every prompt (agent, model, …). `serverUrl` is
   * omitted here — set it via the top-level `serverUrl` prop so there's one
   * canonical place for the bridge URL.
   */
  opencode?: Omit<OpenCodeAdapterOptions, "serverUrl">;
  /** Also run a clipboard picker on ⌘C. Default true. */
  clipboard?: boolean;
}

/**
 * Dev-only picker for Next.js. Render once, high in the tree (root layout for
 * App Router, or _app for Pages Router). No-ops in production — the dynamic
 * import sits under a NODE_ENV guard so it is dropped from the prod bundle.
 *
 * ```tsx
 * // app/layout.tsx (stays a Server Component)
 * import { ClickToCode } from "@clicktocode/next";
 * // …
 * {process.env.NODE_ENV !== "production" && <ClickToCode />}
 * ```
 */
export function ClickToCode(props: ClickToCodeProps): null {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    let dispose: (() => void) | undefined;
    let cancelled = false;

    import("@clicktocode/react").then(({ clickToCode, opencodeAdapter, clipboardAdapter }) => {
      if (cancelled) return;
      const adapter = opencodeAdapter({
        serverUrl: props.serverUrl,
        ...props.opencode,
      });
      const pickers = [clickToCode({ adapter })];
      if (props.clipboard !== false) {
        pickers.push(
          clickToCode({ adapter: clipboardAdapter(), hotkey: ["Meta", "c"], holdDuration: 500 })
        );
      }
      (window as unknown as { __opencodeProvider?: unknown }).__opencodeProvider = adapter.provider;
      dispose = () => {
        pickers.forEach((p) => p.destroy());
        delete (window as unknown as { __opencodeProvider?: unknown }).__opencodeProvider;
      };
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// Re-export the framework-neutral surface for advanced use.
export {
  opencodeAdapter,
  clipboardAdapter,
  cursorAdapter,
  createOpenCodeAgentProvider,
  captureContext,
  formatPrompt,
} from "@clicktocode/react";
export type {
  OpenCodeAdapterOptions,
  ClickAdapter,
  ClickContext,
  AgentEvent,
  AgentStatus,
} from "@clicktocode/react";
