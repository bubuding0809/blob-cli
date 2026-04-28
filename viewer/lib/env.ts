function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

export function getBlobToken(): string {
  return required("BLOB_READ_WRITE_TOKEN");
}

export function getViewerPassword(): string {
  return required("VIEWER_PASSWORD");
}

export function getViewerSessionSecret(): string {
  return required("VIEWER_SESSION_SECRET");
}
