"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  submitContractForSigning,
  signContract,
  freezeContract,
  unfreezeContract,
  terminateContract,
} from "@/lib/actions/contract";
import { ActivateContractButton } from "./activate-button";
import { ContractPdfDownload } from "@/components/contract/contract-pdf-download";
import { FileSignature, Pen, Loader2, Snowflake, Flame } from "lucide-react";

export function ContractActions({ contractId, status }: { contractId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  // Dialog state for freeze/terminate (both require a reason)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"freeze" | "terminate" | "">("");
  const [dialogReason, setDialogReason] = useState("");

  async function handleSubmit() {
    if (!confirm("确认提交合同等待客户签署？")) return;
    setLoading("submit");
    setError("");
    const r = await submitContractForSigning(contractId);
    if (r.success) router.refresh();
    else setError(r.error);
    setLoading("");
  }

  async function handleSign() {
    if (!confirm("确认签章？签章后合同即生效。")) return;
    setLoading("sign");
    setError("");
    const r = await signContract(contractId);
    if (r.success) router.refresh();
    else setError(r.error);
    setLoading("");
  }

  async function handleFreeze() {
    setLoading("freeze");
    setError("");
    const r = await freezeContract(contractId, dialogReason);
    if (r.success) router.refresh();
    else setError(r.error);
    setLoading("");
    setDialogOpen(false);
    setDialogReason("");
  }

  async function handleUnfreeze() {
    if (!confirm("确认解冻此合同？")) return;
    setLoading("unfreeze");
    setError("");
    const r = await unfreezeContract(contractId);
    if (r.success) router.refresh();
    else setError(r.error);
    setLoading("");
  }

  async function handleTerminate() {
    setLoading("terminate");
    setError("");
    const r = await terminateContract(contractId, dialogReason);
    if (r.success) router.refresh();
    else setError(r.error);
    setLoading("");
    setDialogOpen(false);
    setDialogReason("");
  }

  function openDialog(action: "freeze" | "terminate") {
    setDialogAction(action);
    setDialogReason("");
    setDialogOpen(true);
  }

  return (
    <div className="flex items-center gap-2">
      {/* Status-based action buttons */}
      {status === "DRAFT" && (
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={loading === "submit"}>
          {loading === "submit" ? (
            <><Loader2 className="h-4 w-4 animate-spin" />提交中...</>
          ) : (
            <><FileSignature className="h-4 w-4" />提交签章</>
          )}
        </Button>
      )}
      {status === "PENDING_SIGN" && (
        <Button variant="primary" size="sm" onClick={handleSign} disabled={loading === "sign"}>
          {loading === "sign" ? (
            <><Loader2 className="h-4 w-4 animate-spin" />签章中...</>
          ) : (
            <><Pen className="h-4 w-4" />签章确认</>
          )}
        </Button>
      )}
      {status === "SIGNED" && <ActivateContractButton contractId={contractId} />}

      {/* Freeze / Terminate — only on ACTIVE contracts */}
      {status === "ACTIVE" && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openDialog("freeze")}
            disabled={loading === "freeze"}
          >
            {loading === "freeze" ? (
              <><Loader2 className="h-4 w-4 animate-spin" />冻结中...</>
            ) : (
              <><Snowflake className="h-4 w-4" />冻结</>
            )}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => openDialog("terminate")}
            disabled={loading === "terminate"}
          >
            {loading === "terminate" ? (
              <><Loader2 className="h-4 w-4 animate-spin" />终止中...</>
            ) : (
              <><Flame className="h-4 w-4" />终止合同</>
            )}
          </Button>
        </>
      )}

      {/* Unfreeze / Terminate — only on FROZEN contracts */}
      {status === "FROZEN" && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnfreeze}
            disabled={loading === "unfreeze"}
          >
            {loading === "unfreeze" ? (
              <><Loader2 className="h-4 w-4 animate-spin" />解冻中...</>
            ) : (
              "解冻"
            )}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => openDialog("terminate")}
            disabled={loading === "terminate"}
          >
            {loading === "terminate" ? (
              <><Loader2 className="h-4 w-4 animate-spin" />终止中...</>
            ) : (
              <><Flame className="h-4 w-4" />终止合同</>
            )}
          </Button>
        </>
      )}

      {/* PDF download — client-side generation, always visible */}
      <ContractPdfDownload contractId={contractId} />

      {error && <span className="text-sm text-red-600">{error}</span>}

      {/* Confirmation dialog for freeze/terminate (requires reason) */}
      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogAction === "freeze" ? "冻结合同" : "终止合同"}
        message={
          <div className="space-y-2">
            <p>
              {dialogAction === "freeze"
                ? "确认冻结此合同？冻结期间合同暂停履行。"
                : "确认终止此合同？此操作不可撤销，设备将全部归还入库。"}
            </p>
            <textarea
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
              placeholder="请填写原因"
              rows={3}
              value={dialogReason}
              onChange={(e) => setDialogReason(e.target.value)}
            />
          </div>
        }
        confirmLabel={dialogAction === "freeze" ? "确认冻结" : "确认终止"}
        variant="destructive"
        loading={loading === "freeze" || loading === "terminate"}
        onConfirm={dialogAction === "freeze" ? handleFreeze : handleTerminate}
      />
    </div>
  );
}
