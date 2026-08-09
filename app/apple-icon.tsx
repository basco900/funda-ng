import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 42,
          background: "#111313",
          color: "#F6F7F3",
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: "-9px",
          paddingRight: 9,
        }}
      >
        f<span style={{ color: "#8BDDF0" }}>.</span>
      </div>
    ),
    size,
  );
}
