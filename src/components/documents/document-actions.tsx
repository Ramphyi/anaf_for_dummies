"use client";

import {
  Ban,
  Banknote,
  ChevronDown,
  Copy,
  FileCheck2,
  FileCode2,
  FileDown,
  FileMinus2,
  FileOutput,
  Mail,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Printer,
  RefreshCw,
  Send,
  Trash2,
  Truck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox, Switch } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import type { DocKind } from "@/lib/db/schema";
import { formatMoney, formatNumber, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  cancelDocumentAction,
  convertToInvoiceAction,
  createCreditNoteAction,
  deleteDraftAction,
  duplicateDocumentAction,
  issueDocumentAction,
  refreshSpvStatusAction,
  retractSimulatedSendAction,
  sendDocumentEmailAction,
  sendToSpvAction,
} from "./actions";
import { PaymentDialog, type InvoiceOption } from "./payment-dialog";
import { KIND_META, parseNum } from "./shared";

export type ActionDoc = {
  id: string;
  kind: DocKind;
  status: string;
  efacturaStatus: string;
  /** Transmisă doar în modul simulare — nu a ajuns la ANAF. */
  efacturaSimulated: boolean;
  isCreditNote: boolean;
  fullNumber: string;
  total: number;
  paidAmount: number;
  remaining: number;
  currency: string;
  editable: boolean;
};

export type CreditLine = { id: string; name: string; unit: string; quantity: number; unitPrice: number };

/** Acțiunile SPV (trimitere / verificare status) — partajate de toolbar și cardul e-Factura. */
export function useSpvActions(id: string) {
  const { run, pending } = useAction();
  const send = () =>
    run(() => sendToSpvAction(id), {
      success: (d) => (d.simulated ? "Trimisă în modul simulare — factura NU a ajuns la ANAF" : `Factura a fost transmisă în SPV (index ${d.uploadId})`),
    });
  const check = () =>
    run(() => refreshSpvStatusAction(id), {
      success: "",
      onSuccess: (r) => {
        if (r.state === "ok") toast.success("Factura a fost validată de ANAF");
        else if (r.state === "processing") toast.info("Factura este încă în prelucrare la ANAF. Revino în câteva minute.");
        else toast.error(`Factura a fost respinsă de ANAF${r.message ? `: ${r.message}` : ""}`);
      },
    });
  const retract = () => run(() => retractSimulatedSendAction(id));
  return { send, check, retract, pending };
}

export function DocumentActions({
  doc,
  lines,
  canAnaf,
  smtpConfigured,
  email,
  invoiceOption,
}: {
  doc: ActionDoc;
  lines: CreditLine[];
  canAnaf: boolean;
  smtpConfigured: boolean;
  email: { to: string; subject: string; message: string };
  invoiceOption: InvoiceOption | null;
}) {
  const router = useRouter();
  const meta = KIND_META[doc.kind];
  const { run, pending } = useAction();
  const spv = useSpvActions(doc.id);
  const [dialog, setDialog] = React.useState<null | "pay" | "email" | "storno" | "convert" | "cancel" | "delete">(null);
  const close = () => setDialog(null);

  const isDraft = doc.status === "draft";
  const closed = ["cancelled", "storned", "converted"].includes(doc.status);
  const inSpv = ["processing", "pending"].includes(doc.efacturaStatus);
  const isInvoice = doc.kind === "invoice";

  const can = {
    issue: isDraft,
    edit: doc.editable,
    pay: isInvoice && !doc.isCreditNote && ["issued", "partially_paid"].includes(doc.status) && doc.remaining > 0,
    spv: canAnaf && isInvoice && !isDraft && doc.status !== "cancelled" && ["none", "nok", "error"].includes(doc.efacturaStatus),
    check: canAnaf && isInvoice && inSpv,
    xml: isInvoice && !isDraft,
    email: !isDraft && doc.status !== "cancelled",
    storno: isInvoice && !doc.isCreditNote && !isDraft && !["cancelled", "storned"].includes(doc.status),
    // Ce a ajuns în SPV-ul ANAF se corectează doar prin storno; o transmitere simulată nu contează.
    cancel: !isDraft && !closed && doc.paidAmount <= 0 && (doc.efacturaSimulated || (doc.efacturaStatus !== "ok" && !inSpv)),
    convert: !isInvoice && !isDraft && !closed,
    etransport: doc.kind === "notice" && !isDraft && doc.status !== "cancelled",
    delete: isDraft,
  };

  const issue = () =>
    run(() => issueDocumentAction(doc.id), {
      success: (d) => `${meta.one} ${d.fullNumber} a fost emis${doc.kind === "notice" ? "" : "ă"}`,
    });
  const duplicate = () =>
    run(() => duplicateDocumentAction(doc.id), {
      onSuccess: (d) => router.push(`${KIND_META[d.kind].path}/${d.id}/editare`),
    });

  const editHref = `${meta.path}/${doc.id}/editare`;
  const printHref = `/print/document/${doc.id}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {can.issue && (
        <>
          {can.edit && (
            <Button variant="outline" asChild>
              <Link href={editHref}>
                <Pencil /> Editează
              </Link>
            </Button>
          )}
          <Button variant="gradient" onClick={issue} loading={pending}>
            {!pending && <FileCheck2 />} Emite {doc.kind === "notice" ? "avizul" : meta.article}
          </Button>
        </>
      )}
      {can.pay && (
        <Button variant="success" onClick={() => setDialog("pay")}>
          <Banknote /> Încasează
        </Button>
      )}
      {can.convert && (
        <Button variant="gradient" onClick={() => setDialog("convert")}>
          <FileOutput /> Transformă în factură
        </Button>
      )}
      {can.spv && (
        <Button variant="soft" onClick={spv.send} loading={spv.pending}>
          {!spv.pending && <Send />} {doc.efacturaStatus === "none" ? "Trimite în SPV" : "Retrimite în SPV"}
        </Button>
      )}
      {can.check && (
        <Button variant="soft" onClick={spv.check} loading={spv.pending}>
          {!spv.pending && <RefreshCw />} Verifică status SPV
        </Button>
      )}
      {!isDraft && (
        <Button variant="outline" asChild>
          <a href={printHref} target="_blank" rel="noopener">
            <Printer /> <span className="hidden sm:inline">Tipărește / PDF</span>
          </a>
        </Button>
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={isDraft ? "icon" : "default"} aria-label="Mai multe acțiuni">
            <MoreHorizontal />
            {!isDraft && (
              <>
                <span className="hidden sm:inline">Mai multe</span>
                <ChevronDown className="hidden opacity-60 sm:block" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuLabel>{doc.fullNumber}</DropdownMenuLabel>
          {can.edit && !isDraft && (
            <DropdownMenuItem asChild>
              <Link href={editHref}>
                <Pencil /> Editează
              </Link>
            </DropdownMenuItem>
          )}
          {isDraft && (
            <DropdownMenuItem asChild>
              <a href={printHref} target="_blank" rel="noopener">
                <Printer /> Previzualizare tipărire
              </a>
            </DropdownMenuItem>
          )}
          {can.email && (
            <DropdownMenuItem onSelect={() => setDialog("email")}>
              <Mail /> Trimite pe email
            </DropdownMenuItem>
          )}
          {can.xml && (
            <>
              <DropdownMenuItem asChild>
                <a href={`/api/documents/${doc.id}/xml`} download>
                  <FileCode2 /> Descarcă XML (UBL)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/documents/${doc.id}/anaf-pdf`} target="_blank" rel="noopener">
                  <FileDown /> PDF ANAF
                </a>
              </DropdownMenuItem>
            </>
          )}
          {can.etransport && (
            <DropdownMenuItem asChild>
              <Link href={`/etransport/nou?document=${doc.id}`}>
                <Truck /> Declară în e-Transport
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={duplicate}>
            <Copy /> Duplică
          </DropdownMenuItem>
          {(can.storno || can.cancel || can.delete) && <DropdownMenuSeparator />}
          {can.storno && (
            <DropdownMenuItem onSelect={() => setDialog("storno")} destructive>
              <FileMinus2 /> Stornează
            </DropdownMenuItem>
          )}
          {can.cancel && (
            <DropdownMenuItem onSelect={() => setDialog("cancel")} destructive>
              <Ban /> Anulează
            </DropdownMenuItem>
          )}
          {can.delete && (
            <DropdownMenuItem onSelect={() => setDialog("delete")} destructive>
              <Trash2 /> Șterge ciorna
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {invoiceOption && <PaymentDialog invoices={[invoiceOption]} invoiceId={doc.id} open={dialog === "pay"} onOpenChange={(o) => !o && close()} />}
      <EmailDialog
        open={dialog === "email"}
        onOpenChange={(o) => !o && close()}
        docId={doc.id}
        defaults={email}
        smtpConfigured={smtpConfigured}
        attachXml={isInvoice ? `${doc.fullNumber}.xml` : null}
      />
      {can.storno && <CreditNoteDialog open={dialog === "storno"} onOpenChange={(o) => !o && close()} doc={doc} lines={lines} />}
      {can.convert && <ConvertDialog open={dialog === "convert"} onOpenChange={(o) => !o && close()} docId={doc.id} kind={doc.kind} />}
      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && close()}
        title={`Anulezi ${meta.article} ${doc.fullNumber}?`}
        description={
          isInvoice
            ? "Factura rămâne în evidență cu statusul „Anulată”, iar stocul descărcat se reface. Dacă a fost comunicată clientului, preferă stornarea."
            : "Documentul rămâne în evidență cu statusul „Anulat”."
        }
        confirmLabel="Anulează documentul"
        destructive
        onConfirm={() => new Promise<void>((resolve) => run(() => cancelDocumentAction(doc.id), { onSuccess: () => resolve(), onError: () => resolve() }))}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && close()}
        title="Ștergi ciorna?"
        description="Ciorna se șterge definitiv. Nu se consumă niciun număr din serie."
        confirmLabel="Șterge ciorna"
        destructive
        onConfirm={() =>
          new Promise<void>((resolve) =>
            run(() => deleteDraftAction(doc.id), {
              onSuccess: () => {
                resolve();
                router.push(meta.path);
              },
              onError: () => resolve(),
            }),
          )
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EmailDialog({
  open,
  onOpenChange,
  docId,
  defaults,
  smtpConfigured,
  attachXml,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  docId: string;
  defaults: { to: string; subject: string; message: string };
  smtpConfigured: boolean;
  attachXml: string | null;
}) {
  const { run, pending } = useAction();
  const [to, setTo] = React.useState(defaults.to);
  const [subject, setSubject] = React.useState(defaults.subject);
  const [message, setMessage] = React.useState(defaults.message);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      setTo(defaults.to);
      setSubject(defaults.subject);
      setMessage(defaults.message);
      setErrors({});
    }
  }, [open, defaults]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => sendDocumentEmailAction(docId, { to, subject, message }), {
      onSuccess: () => onOpenChange(false),
      onError: (_e, fe) => setErrors(fe ?? {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Trimite pe email</DialogTitle>
            <DialogDescription>Clientul primește un rezumat al documentului{attachXml ? " și fișierul XML e-Factura atașat" : ""}.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {!smtpConfigured && (
              <div className="rounded-xl border border-warning/30 bg-warning-soft p-3.5 text-sm text-warning-soft-foreground">
                Serverul de email (SMTP) nu este configurat. Completează datele în{" "}
                <Link href="/setari" className="font-medium underline underline-offset-2">
                  Setări → Email
                </Link>{" "}
                pentru a putea trimite documente.
              </div>
            )}
            <Field label="Către" required hint="Mai mulți destinatari: separă cu virgulă." error={errors.to || null}>
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="contabilitate@client.ro" type="text" />
            </Field>
            <Field label="Subiect">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Mesaj">
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} />
            </Field>
            {attachXml && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <Paperclip className="size-3.5" /> {attachXml} <span className="opacity-70">· UBL 2.1 CIUS-RO</span>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Renunță
            </Button>
            <Button type="submit" loading={pending} disabled={!smtpConfigured}>
              {!pending && <Send />} Trimite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreditNoteDialog({ open, onOpenChange, doc, lines }: { open: boolean; onOpenChange: (o: boolean) => void; doc: ActionDoc; lines: CreditLine[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [mode, setMode] = React.useState<"full" | "partial">("full");
  const [issueDate, setIssueDate] = React.useState(todayIso());
  const [reason, setReason] = React.useState("");
  const [picked, setPicked] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      setMode("full");
      setIssueDate(todayIso());
      setReason("");
      setPicked({});
    }
  }, [open]);

  const partialLines = Object.entries(picked)
    .map(([lineId, q]) => ({ lineId, quantity: parseNum(q) }))
    .filter((l) => l.quantity > 0);
  const partialTotal = partialLines.reduce((a, l) => {
    const line = lines.find((x) => x.id === l.lineId);
    return a + (line ? line.unitPrice * l.quantity : 0);
  }, 0);

  const submit = () =>
    run(() => createCreditNoteAction(doc.id, { issueDate, reason, lines: mode === "partial" ? partialLines : undefined }), {
      onSuccess: (r) => {
        onOpenChange(false);
        router.push(`/facturi/${r.id}`);
      },
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Stornează factura {doc.fullNumber}</DialogTitle>
          <DialogDescription>Se emite o factură storno cu valori negative, legată de factura originală.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "full", label: "Stornare totală" },
              { value: "partial", label: "Stornare parțială" },
            ]}
          />
          <AnimatePresence mode="wait" initial={false}>
            {mode === "full" ? (
              <motion.div
                key="full"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-xl border border-border bg-subtle p-4 text-sm"
              >
                Toate cele {lines.length} linii vor fi stornate, în valoare totală de{" "}
                <strong className="tabular">−{formatMoney(doc.total, doc.currency)}</strong>. Factura originală va primi statusul „Stornată”.
              </motion.div>
            ) : (
              <motion.div
                key="partial"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="overflow-hidden rounded-xl border border-border"
              >
                {lines.map((l) => {
                  const on = picked[l.id] !== undefined;
                  const over = parseNum(picked[l.id]) > Math.abs(l.quantity);
                  return (
                    <div key={l.id} className={cn("flex items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-0", on && "bg-primary-soft/40")}>
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) =>
                          setPicked((p) => {
                            const n = { ...p };
                            if (v === true) n[l.id] = String(Math.abs(l.quantity)).replace(".", ",");
                            else delete n[l.id];
                            return n;
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground tabular">
                          {formatNumber(Math.abs(l.quantity))} {l.unit} × {formatMoney(l.unitPrice, doc.currency)}
                        </p>
                      </div>
                      <Input
                        inputMode="decimal"
                        disabled={!on}
                        value={picked[l.id] ?? ""}
                        onChange={(e) => setPicked((p) => ({ ...p, [l.id]: e.target.value }))}
                        aria-invalid={over || undefined}
                        className="h-8 w-24 text-right tabular"
                        placeholder="Cant."
                      />
                    </div>
                  );
                })}
                <div className="flex justify-between bg-subtle px-3.5 py-2.5 text-sm">
                  <span className="text-muted-foreground">Valoare stornată (fără TVA)</span>
                  <span className="font-semibold tabular">−{formatMoney(partialTotal, doc.currency)}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <Field label="Data stornării">
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
            <Field label="Motiv" hint="Apare în mențiunile facturii storno.">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: retur marfă, eroare de facturare" />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Renunță
          </Button>
          <Button variant="destructive" onClick={submit} loading={pending} disabled={mode === "partial" && !partialLines.length}>
            {!pending && <FileMinus2 />} Emite factura storno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertDialog({ open, onOpenChange, docId, kind }: { open: boolean; onOpenChange: (o: boolean) => void; docId: string; kind: DocKind }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [issueDate, setIssueDate] = React.useState(todayIso());
  const [issue, setIssue] = React.useState(true);

  const submit = () =>
    run(() => convertToInvoiceAction(docId, { issueDate, issue }), {
      success: issue ? "Factura a fost emisă" : "Ciorna facturii a fost creată",
      onSuccess: (r) => {
        onOpenChange(false);
        router.push(issue ? `/facturi/${r.id}` : `/facturi/${r.id}/editare`);
      },
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Transformă în factură</DialogTitle>
          <DialogDescription>
            Liniile, clientul și moneda se preiau din {kind === "proforma" ? "proformă" : "aviz"}.
            {kind === "notice" ? " Stocul nu se mai descarcă a doua oară." : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Data facturii">
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3.5">
            <span className="text-sm">
              <span className="block font-medium">Emite direct</span>
              <span className="text-xs text-muted-foreground">Altfel se creează o ciornă pe care o poți modifica.</span>
            </span>
            <Switch checked={issue} onCheckedChange={setIssue} />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Renunță
          </Button>
          <Button variant="gradient" onClick={submit} loading={pending}>
            {!pending && <FileOutput />} {issue ? "Emite factura" : "Creează ciorna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
