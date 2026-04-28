export default function LoginPage() {
  return (
    <main style={{ maxWidth: 360, margin: "8rem auto", fontFamily: "ui-monospace, monospace" }}>
      <h1>blob viewer</h1>
      <form method="post" action="/api/login">
        <label>
          Password
          <input
            type="password"
            name="password"
            autoFocus
            required
            style={{ width: "100%", marginTop: 4, padding: 6 }}
          />
        </label>
        <button type="submit" style={{ marginTop: 12, padding: "6px 14px" }}>
          Sign in
        </button>
      </form>
    </main>
  );
}
