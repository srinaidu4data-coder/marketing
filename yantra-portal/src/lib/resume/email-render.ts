export function renderEmailTemplate(
  template: string,
  ctx: Record<string, string>
) {
  let out = template;
  out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) =>
    ctx[key] ? inner.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), ctx[key]) : ""
  );
  for (const [k, v] of Object.entries(ctx)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v ?? "");
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), v ?? "");
  }
  return out;
}
