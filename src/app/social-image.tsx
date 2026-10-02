export function SocialImage() {
  return (
    <div
      style={{
        alignItems: "flex-start",
        background: "#f8f6f1",
        color: "#1c1714",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 80px",
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 18 }}>
        <div style={{ alignItems: "center", background: "#211b17", borderRadius: 18, color: "#fff", display: "flex", fontSize: 36, fontWeight: 700, height: 68, justifyContent: "center", width: 68 }}>S</div>
        <span style={{ fontFamily: "Georgia, serif", fontSize: 42 }}>Shotexa</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 900 }}>
        <span style={{ color: "#a8401a", fontFamily: "Arial, sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>Screenshot workspace</span>
        <span style={{ fontFamily: "Georgia, serif", fontSize: 68, letterSpacing: -2, lineHeight: 1.05 }}>Everything you need for screenshots.</span>
        <span style={{ color: "#5e554d", fontFamily: "Arial, sans-serif", fontSize: 27, lineHeight: 1.35 }}>Stitch, edit, protect, extract text and export — in your browser.</span>
      </div>
      <span style={{ color: "#5e554d", fontFamily: "Arial, sans-serif", fontSize: 20 }}>Processed locally · Files stay on your device</span>
    </div>
  );
}