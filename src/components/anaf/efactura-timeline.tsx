"use client";

import { Check, CircleDashed, FileText, Hourglass, Send, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
import * as React from "react";
import { EASE_OUT } from "@/components/motion";
import { Tooltip } from "@/components/ui/popover";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type StepState = "done" | "active" | "failed" | "todo";

export type EfacturaTimelineInput = {
  efacturaStatus: string;
  issueDate: string;
  efacturaSentAt: string | null;
  efacturaUploadId: string | null;
  efacturaDownloadId: string | null;
  efacturaMessage?: string | null;
};

/** Stările pașilor: transmitere → prelucrare → rezultat. */
export function efacturaSteps(d: EfacturaTimelineInput): { sent: StepState; processing: StepState; result: StepState } {
  switch (d.efacturaStatus) {
    case "pending":
      return { sent: "active", processing: "todo", result: "todo" };
    case "processing":
      return { sent: "done", processing: "active", result: "todo" };
    case "ok":
      return { sent: "done", processing: "done", result: "done" };
    case "nok":
      return { sent: "done", processing: "done", result: "failed" };
    case "error":
      return d.efacturaUploadId ? { sent: "done", processing: "failed", result: "todo" } : { sent: "failed", processing: "todo", result: "todo" };
    default:
      return { sent: "todo", processing: "todo", result: "todo" };
  }
}

const segColor: Record<StepState, string> = {
  done: "bg-success",
  active: "bg-warning animate-pulse",
  failed: "bg-danger",
  todo: "bg-muted-foreground/20",
};

/** Indicator compact (3 segmente) pentru tabel. */
export function EfacturaProgress({ data, className }: { data: EfacturaTimelineInput; className?: string }) {
  const s = efacturaSteps(data);
  const items: [string, StepState][] = [
    ["Transmisă", s.sent],
    ["Prelucrare ANAF", s.processing],
    ["Rezultat", s.result],
  ];
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-hidden>
      {items.map(([label, st], i) => (
        <Tooltip key={label} content={`${label}: ${st === "done" ? "finalizat" : st === "active" ? "în curs" : st === "failed" ? "eșuat" : "în așteptare"}`}>
          <motion.span
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: 0.05 * i, ease: EASE_OUT }}
            className={cn("h-1.5 w-3.5 origin-left rounded-full", segColor[st])}
          />
        </Tooltip>
      ))}
    </div>
  );
}

const nodeStyle: Record<StepState, string> = {
  done: "bg-success text-white ring-success/20",
  active: "bg-warning text-white ring-warning/25",
  failed: "bg-danger text-white ring-danger/20",
  todo: "bg-card text-muted-foreground ring-border",
};

/** Cronologia completă a unei facturi în e-Factura (pentru panoul de detalii). */
export function EfacturaTimeline({ data, className }: { data: EfacturaTimelineInput; className?: string }) {
  const s = efacturaSteps(data);
  const steps: { key: string; title: string; desc: React.ReactNode; state: StepState; icon: React.ReactNode }[] = [
    { key: "issued", title: "Factură emisă", desc: formatDate(data.issueDate), state: "done", icon: <FileText /> },
    {
      key: "sent",
      title: s.sent === "failed" ? "Transmitere eșuată" : "Transmisă în SPV",
      desc: data.efacturaSentAt ? (
        <>
          {formatDateTime(data.efacturaSentAt)}
          {data.efacturaUploadId && (
            <>
              {" "}
              · index <span className="font-mono">{data.efacturaUploadId}</span>
            </>
          )}
        </>
      ) : s.sent === "failed" ? (
        "XML-ul nu a trecut validarea locală / încărcarea"
      ) : (
        "Încă netransmisă"
      ),
      state: s.sent,
      icon: <Send />,
    },
    {
      key: "processing",
      title: "Prelucrare ANAF",
      desc: s.processing === "active" ? "ANAF validează factura (de obicei câteva minute)" : s.processing === "done" ? "Prelucrare finalizată" : s.processing === "failed" ? "Eroare la verificarea stării" : "—",
      state: s.processing,
      icon: <Hourglass />,
    },
    {
      key: "result",
      title: s.result === "failed" ? "Respinsă de ANAF" : "Validată de ANAF",
      desc:
        s.result === "done" ? (
          <>
            Factura are valoare fiscală
            {data.efacturaDownloadId && (
              <>
                {" "}
                · id descărcare <span className="font-mono">{data.efacturaDownloadId}</span>
              </>
            )}
          </>
        ) : s.result === "failed" ? (
          "Corectează erorile și retrimite factura"
        ) : (
          "—"
        ),
      state: s.result,
      icon: <ShieldCheck />,
    },
  ];

  return (
    <ol className={cn("relative", className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const nextState = steps[i + 1]?.state;
        return (
          <li key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
            {!last && (
              <div className="absolute top-8 bottom-0 left-[15px] w-0.5 overflow-hidden rounded-full bg-border">
                <motion.div
                  className={cn("w-full origin-top", step.state === "done" && nextState !== "todo" ? "bg-success" : step.state === "failed" ? "bg-danger" : "bg-transparent")}
                  initial={{ height: 0 }}
                  animate={{ height: "100%" }}
                  transition={{ duration: 0.5, delay: 0.15 + i * 0.15, ease: EASE_OUT }}
                />
              </div>
            )}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, delay: i * 0.12, ease: EASE_OUT }}
              className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 [&_svg]:size-4", nodeStyle[step.state])}
            >
              {step.state === "done" ? <Check strokeWidth={3} /> : step.state === "failed" ? <X strokeWidth={3} /> : step.state === "todo" ? <CircleDashed /> : step.icon}
              {step.state === "active" && <span className="absolute inset-0 animate-ping rounded-full bg-warning/40" />}
            </motion.div>
            <div className="min-w-0 pt-1">
              <p className={cn("text-sm font-semibold", step.state === "todo" && "text-muted-foreground", step.state === "failed" && "text-danger")}>{step.title}</p>
              <p className="mt-0.5 text-[13px] break-words text-muted-foreground">{step.desc}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
