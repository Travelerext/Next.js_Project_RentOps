"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addOrderItem } from "@/lib/actions/rental-order";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";

interface EquipmentOption {
  id: string;
  equipment_no: string;
  name: string;
  standard_rent: string;
  standard_deposit: string;
}

export function AddItemForm({ orderId }: { orderId: string }) {
  // Stable client — created once
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);
  const [error, setError] = useState("");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;

    async function load() {
      const { data } = await supabase
        .from("equipment")
        .select("id, equipment_no, name, standard_rent, standard_deposit")
        .eq("status", "IN_STOCK")
        .is("deleted_at", null)
        .order("equipment_no");
      setEquipment(data ?? []);
    }
    load();

    return () => {
      loadedRef.current = false;
    };
  }, [open, supabase]);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = await addOrderItem(orderId, formData);

    if (!result.success) {
      setError(result.error);
    } else {
      setOpen(false);
    }
    setLoading(false);
  }, [orderId]);

  const equipmentOptions = useMemo(
    () =>
      equipment.map((e) => ({
        value: e.id,
        label: `${e.equipment_no} - ${e.name}`,
      })),
    [equipment]
  );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        添加设备
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <form onSubmit={handleSubmit} className="space-y-3">
        <h3 className="font-medium">添加设备明细</h3>
        <Select
          id="equipmentId"
          name="equipmentId"
          label="选择设备"
          options={equipmentOptions}
          required
        />
        <div className="grid grid-cols-3 gap-3">
          <Select
            id="pricingMode"
            name="pricingMode"
            label="计费方式"
            options={[
              { value: "MONTHLY", label: "月租" },
              { value: "DAILY", label: "日租" },
              { value: "HOURLY", label: "时租" },
              { value: "FIXED", label: "固定" },
            ]}
          />
          <Input
            id="unitPrice"
            name="unitPrice"
            label="单价"
            type="number"
            defaultValue="0"
          />
          <Input
            id="quantity"
            name="quantity"
            label="数量"
            type="number"
            defaultValue="1"
          />
        </div>
        <Input
          id="depositAmount"
          name="depositAmount"
          label="押金"
          type="number"
          defaultValue="0"
        />

        {error && (
          <div className="rounded bg-red-50 p-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            type="button"
            size="sm"
            onClick={() => setOpen(false)}
          >
            取消
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={loading}>
            {loading ? "添加中..." : "添加"}
          </Button>
        </div>
      </form>
    </div>
  );
}
