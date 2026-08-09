import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 118,
          background: "#111313",
          color: "#F6F7F3",
          fontSize: 214,
          fontWeight: 700,
          letterSpacing: "-24px",
          paddingRight: 24,
        }}
      >
        f<span style={{ color: "#8BDDF0" }}>.</span>
      </div>
    ),
    size,
  );
}
