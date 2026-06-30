import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { EQUIPMENT_STATUS } from "@/lib/constants";
import { ActionLink } from "@/components/data/action-link";
import { Search } from "lucide-react";

export default async function AvailableEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; keyword?: string; categoryId?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const keyword = sp.keyword || "";
  const categoryId = sp.categoryId || "";
  const perPage = 20;

  const [{ data: categories }, eqResult] = await Promise.all([
    supabase.from("equipment_category").select("id, name").order("sort_order"),
    (async () => {
      let q = supabase
        .from("equipment")
        .select("*, category:category_id(name)", { count: "exact" })
        .eq("status", "IN_STOCK")
        .eq("scrapped", false)
        .is("deleted_at", null)
        .order("equipment_no");

      if (keyword)
        q = q.or(`name.ilike.%${keyword}%,equipment_no.ilike.%${keyword}%`);
      if (categoryId) q = q.eq("category_id", categoryId);

      return q.range((page - 1) * perPage, page * perPage - 1);
    })(),
  ]);

  const equipment = eqResult.data ?? [];
  const count = eqResult.count ?? 0;
  const totalPages = Math.ceil(count / perPage);

  const cols: Column<Record<string, unknown>>[] = [
    {
      id: "no",
      header: "设备编号",
      cell: (e) => (
        <span className="font-mono text-sm">{e.equipment_no as string}</span>
      ),
    },
    {
      id: "name",
      header: "名称",
      cell: (e) => <span className="font-medium">{e.name as string}</span>,
    },
    {
      id: "category",
      header: "类别",
      cell: (e) => ((e.category as unknown as { name: string })?.name ?? "-"),
    },
    {
      id: "brand",
      header: "品牌",
      cell: (e) => ((e.brand as string) ?? "-"),
      hideOnMobile: true,
    },
    {
      id: "rent",
      header: "月租",
      cell: (e) => formatCurrency((e.standard_rent as string) ?? "0"),
      className: "tabular-nums",
    },
    {
      id: "deposit",
      header: "押金",
      cell: (e) => formatCurrency((e.standard_deposit as string) ?? "0"),
      className: "tabular-nums",
      hideOnMobile: true,
    },
    {
      id: "condition",
      header: "成色",
      cell: (e) => (
        <Badge variant={(e.condition_level as string) === "A" ? "success" : "info"}>
          {(e.condition_level as string)}级
        </Badge>
      ),
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "状态",
      cell: (e) => (
        <Badge variant="success">
          {EQUIPMENT_STATUS[e.status as string] ?? (e.status as string)}
        </Badge>
      ),
    },
    {
      id: "action",
      header: "",
      cell: (e) => (
        <ActionLink href={`/sales/orders/new?equipmentId=${e.id}`}>
          加入开单
        </ActionLink>
      ),
    },
  ];

  return (
    <DataPage
      title="可租设备查询"
      subtitle={`共 ${count} 台可租设备`}
      pagination={
        totalPages > 1
          ? { page, totalPages, baseUrl: "/sales/available-equipment", query: keyword ? `keyword=${keyword}${categoryId ? `&categoryId=${categoryId}` : ""}` : categoryId ? `categoryId=${categoryId}` : undefined }
          : undefined
      }
      empty={false}
    >
      <form className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            name="keyword"
            defaultValue={keyword}
            placeholder="搜索设备名称或编号..."
            className="pl-9"
          />
        </div>
        <Select
          name="categoryId"
          defaultValue={categoryId}
          options={[
            { value: "", label: "全部分类" },
            ...(categories ?? []).map((c) => ({
              value: c.id,
              label: c.name,
            })),
          ]}
        />
        <Button type="submit" variant="outline">
          <Search className="mr-1 h-4 w-4" />
          搜索
        </Button>
      </form>
      <DataTable
        columns={cols}
        data={equipment as Record<string, unknown>[]}
        keyExtractor={(e) => e.id as string}
        rowHref={(e) => `/equipment/catalog/${e.id}`}
        emptyMessage="暂无可租设备"
      />
    </DataPage>
  );
}
