import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session.ts";
import { listBlobs } from "@/lib/list-blobs.ts";
import { humanizeBytes } from "@/lib/format.ts";
import { getBlobToken, getViewerSessionSecret } from "@/lib/env.ts";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = verifySession(
    cookies().get("viewer_session")?.value,
    getViewerSessionSecret(),
  );
  if (!session) redirect("/login");

  const blobs = await listBlobs({ token: getBlobToken() });

  return (
    <main className="dashboard">
      <header>
        <h1>blob viewer</h1>
        <p>{blobs.length} file{blobs.length === 1 ? "" : "s"}</p>
      </header>
      {blobs.length === 0 ? (
        <p className="empty">
          No files yet. Run <code>blob upload &lt;file&gt;</code> from the CLI.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>pathname</th>
              <th className="num">size</th>
              <th>uploaded</th>
            </tr>
          </thead>
          <tbody>
            {blobs.map((b) => (
              <tr key={b.pathname}>
                <td>
                  <a href={`/${b.pathname}`}>{b.pathname}</a>
                </td>
                <td className="num">{humanizeBytes(b.size)}</td>
                <td title={b.uploadedAt.toISOString()}>
                  {b.uploadedAt.toISOString().slice(0, 19).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
