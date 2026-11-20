function App() {
  return (
    <main
      style={{
        fontFamily: "system-ui",
        maxWidth: "720px",
        margin: "0 auto",
        padding: "48px 24px",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", marginBottom: "8px" }}>MailPilot AI</h1>
      <p
        style={{
          color: "#4b5563",
          fontSize: "1.125rem",
          marginBottom: "32px",
        }}
      >
        AI email automation with specialized agents.
      </p>
      <ul style={{ lineHeight: 1.9 }}>
        <li>Connect multiple Gmail accounts</li>
        <li>Classify, summarize, and prioritize email</li>
        <li>Draft replies you approve before sending</li>
      </ul>
    </main>
  );
}

export default App;
