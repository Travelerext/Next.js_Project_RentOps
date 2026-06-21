import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS, CONTRACT_STATUS, EQUIPMENT_STATUS, RECEIVABLE_STATUS } from "@/lib/constants";

const variant = (s: string, map: Record<string, string>) => (map[s] ?? "default") as "success"|"warning"|"danger"|"info"|"default";

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge variant={variant(status, { IN_PROGRESS:"success", OVERDUE:"danger", SUBMITTED:"info", CONFIRMED:"success", COMPLETED:"default", CANCELLED:"default" })}>{ORDER_STATUS[status] ?? status}</Badge>;
}
export function ContractStatusBadge({ status }: { status: string }) {
  return <Badge variant={variant(status, { ACTIVE:"success", SIGNED:"info", TERMINATED:"danger", FROZEN:"danger" })}>{CONTRACT_STATUS[status] ?? status}</Badge>;
}
export function EquipmentStatusBadge({ status }: { status: string }) {
  return <Badge variant={variant(status, { IN_STOCK:"success", RENTED:"info", IN_MAINTENANCE:"warning", LOCKED:"danger", SCRAPPED:"default" })}>{EQUIPMENT_STATUS[status] ?? status}</Badge>;
}
export function ReceivableStatusBadge({ status }: { status: string }) {
  return <Badge variant={variant(status, { PAID:"success", UNPAID:"warning", OVERDUE:"danger", PARTIAL:"info" })}>{RECEIVABLE_STATUS[status] ?? status}</Badge>;
}
