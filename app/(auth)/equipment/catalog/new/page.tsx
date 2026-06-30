"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createEquipment } from "@/lib/actions/equipment";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { PackagePlus, Loader2 } from "lucide-react";

export default function NewEquipmentPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<{ id: string; model_name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("equipment_category").select("id, name").order("sort_order").then(({ data }) => setCategories(data ?? []));
    supabase.from("equipment_model").select("id, model_name").order("model_name").then(({ data }) => setModels(data ?? []));
    supabase.from("warehouse").select("id, name").order("name").then(({ data }) => setWarehouses(data ?? []));
    supabase.from("station").select("id, name").order("name").then(({ data }) => setStations(data ?? []));
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const categoryId = formData.get("categoryId") as string;
    const result = await createEquipment(categoryId, formData);
    if (result.success) {
      router.push(`/equipment/catalog/${result.data.id}`);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="新建设备" subtitle="登记新设备资产信息" backUrl="_back" />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5" />设备信息</CardTitle></CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="name" name="name" label="设备名称 *" placeholder="例如：履带式挖掘机 XE200" required autoFocus />

          <div className="grid grid-cols-2 gap-4">
            <Select id="categoryId" name="categoryId" label="设备类别 *"
              options={[{ value: "", label: "请选择类别" }, ...categories.map(c => ({ value: c.id, label: c.name }))]} />
            <Select id="modelId" name="modelId" label="型号"
              options={[{ value: "", label: "请选择型号" }, ...models.map(m => ({ value: m.id, label: m.model_name }))]} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input id="brand" name="brand" label="品牌" placeholder="例如：徐工、三一" />
            <Input id="specification" name="specification" label="规格型号" placeholder="例如：XE200" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input id="tonnage" name="tonnage" label="吨位 (吨)" type="number" step="0.01" placeholder="0" />
            <Select id="conditionLevel" name="conditionLevel" label="成色等级"
              options={[
                { value: "A", label: "A级 - 优" }, { value: "B", label: "B级 - 良" },
                { value: "C", label: "C级 - 中" }, { value: "D", label: "D级 - 差" },
              ]} />
            <Select id="depreciationYears" name="depreciationYears" label="折旧年限"
              options={[
                { value: "5", label: "5年" }, { value: "8", label: "8年" },
                { value: "10", label: "10年" }, { value: "15", label: "15年" }, { value: "20", label: "20年" },
              ]} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input id="standardRent" name="standardRent" label="月租标准 (元)" type="number" step="0.01" defaultValue="0" />
            <Input id="standardDeposit" name="standardDeposit" label="押金标准 (元)" type="number" step="0.01" defaultValue="0" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input id="purchaseDate" name="purchaseDate" label="购买日期" type="date" />
            <Input id="purchasePrice" name="purchasePrice" label="购买价格 (元)" type="number" step="0.01" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select id="warehouseId" name="warehouseId" label="所属仓库"
              options={[{ value: "", label: "请选择仓库" }, ...warehouses.map(w => ({ value: w.id, label: w.name }))]} />
            <Select id="stationId" name="stationId" label="所属站点"
              options={[{ value: "", label: "请选择站点" }, ...stations.map(s => ({ value: s.id, label: s.name }))]} />
          </div>

          <Input id="remark" name="remark" label="备注" placeholder="设备备注信息..." />

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400" role="alert">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" type="button" onClick={() => router.back()}>取消</Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />创建中...</> : "创建设备"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
