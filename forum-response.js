async function readForumResponse(response) {
  const bytes = await response.arrayBuffer();
  const prefix = new TextDecoder().decode(bytes.slice(0, 2048));
  const header = response.headers.get("content-type") || "";
  const encoding = header.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ||
    prefix.match(/(?:<\?xml[^>]*encoding|<meta[^>]*charset)\s*=\s*["']?([\w-]+)/i)?.[1] || "utf-8";
  return new TextDecoder(encoding).decode(bytes);
}
