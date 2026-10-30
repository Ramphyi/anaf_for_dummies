"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Rulează o server action cu stare de încărcare + toast-uri automate.
 *   const { run, pending } = useAction();
 *   run(() => saveInvoice(data), { success: "Factura a fost salvată", onSuccess: (id) => router.push(...) })
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = useCallback(
    <T,>(
      fn: () => Promise<Result<T>>,
      opts?: {
        success?: string | ((data: T) => string);
        onSuccess?: (data: T) => void;
        onError?: (error: string, fieldErrors?: Record<string, string>) => void;
        refresh?: boolean;
      },
    ) => {
      startTransition(async () => {
        try {
          const r = await fn();
          if (r.ok) {
            const msg = typeof opts?.success === "function" ? opts.success(r.data) : (opts?.success ?? r.message);
            if (msg) toast.success(msg);
            opts?.onSuccess?.(r.data);
            if (opts?.refresh) router.refresh();
          } else {
            toast.error(r.error);
            opts?.onError?.(r.error, r.fieldErrors);
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Eroare de rețea");
        }
      });
    },
    [router],
  );

  return { run, pending };
}
