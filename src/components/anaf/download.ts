"use client";

import { toast } from "sonner";

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) return decodeURIComponent(star[1]);
  return header.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function saveText(text: string, name: string, type = "application/xml") {
  saveBlob(new Blob([text], { type: `${type};charset=utf-8` }), name);
}

/**
 * Descarcă un fișier dintr-un route handler. Erorile (JSON `{ error }`) devin toast-uri prietenoase.
 * Returnează blob-ul descărcat (sau null la eroare).
 */
export async function fetchFile(url: string, init?: RequestInit): Promise<{ blob: Blob; name: string | null } | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(body?.error ?? `Operațiunea a eșuat (cod ${res.status}).`);
      return null;
    }
    return { blob: await res.blob(), name: filenameFromDisposition(res.headers.get("content-disposition")) };
  } catch {
    toast.error("Eroare de rețea. Verifică conexiunea și încearcă din nou.");
    return null;
  }
}

export async function downloadFile(url: string, fallbackName: string, init?: RequestInit) {
  const r = await fetchFile(url, init);
  if (!r) return false;
  saveBlob(r.blob, r.name ?? fallbackName);
  return true;
}
