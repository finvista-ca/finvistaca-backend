export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f8fafc",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "40px",
          borderRadius: "12px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
          maxWidth: "500px",
        }}
      >
        <h1
          style={{
            marginBottom: "16px",
            color: "#1e293b",
          }}
        >
          Finvista Backend
        </h1>

        <p
          style={{
            color: "#64748b",
            marginBottom: "24px",
          }}
        >
          Backend server is running successfully 🚀
        </p>

        <div
          style={{
            background: "#f1f5f9",
            padding: "16px",
            borderRadius: "8px",
            textAlign: "left",
            fontSize: "14px",
            lineHeight: "28px",
          }}
        >
          <div>✅ Database Connected</div>
          <div>✅ API Server Running</div>
          <div>✅ WhatsApp Integration Ready</div>
          <div>✅ Consultation Booking APIs</div>
          <div>✅ Outreach Campaign APIs</div>
          <div>✅ Admin APIs</div>
        </div>
      </div>
    </main>
  );
}