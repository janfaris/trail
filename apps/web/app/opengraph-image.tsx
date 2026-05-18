import { ImageResponse } from "next/og";
import { COLORS, Footer, OG_CONTENT_TYPE, OG_SIZE, ToolSvg, Wordmark, loadOgFonts } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Trail — Your AI coding work, recorded.";

const TOOLS = ["claude-code", "codex", "hermes", "copilot-cli", "copilot-chat", "cursor"];

export default async function Image() {
  const fonts = await loadOgFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.bg,
          display: "flex",
          flexDirection: "column",
          padding: 64,
          fontFamily: "Geist",
          position: "relative",
        }}
      >
        <Wordmark />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 78,
              fontWeight: 600,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              color: COLORS.text,
              maxWidth: 1000,
            }}
          >
            Your AI coding work, recorded.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              color: COLORS.textDim,
              letterSpacing: "-0.01em",
              maxWidth: 980,
              lineHeight: 1.3,
            }}
          >
            Captures every Claude Code, Codex, Hermes, Copilot, and Cursor session.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 56 }}>
            {TOOLS.map((t) => (
              <div key={t} style={{ display: "flex" }}>
                <ToolSvg name={t} size={40} color="#d4d4d8" />
              </div>
            ))}
          </div>
        </div>

        <Footer />
      </div>
    ),
    { ...size, fonts },
  );
}
