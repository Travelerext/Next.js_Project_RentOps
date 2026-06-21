import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { EQUIPMENT_STATUS } from "@/lib/constants";
import Link from "next/link";
import { Plus } from "lucide-react";

// ─── Badge variant per equipment status ─────────────────────────────

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  IN_STOCK: "success",
  RENTED: "info",
  PENDING_INSPECTION: "warning",
  IN_MAINTENANCE: "warning",
  IN_TRANSFER: "info",
  LOCKED: "danger",
  SCRAPPED: "default",
};

// ─── Location type labels ──────────────────────────────────────────

const LOCATION_LABELS: Record<string, string> = {
  WAREHOUSE: "仓库",
  STATION: "站点",
  CUSTOMER: "客户现场",
  PROJECT_SITE: "项目现场",
  TRANSIT: "运输中",
};

// ─── Status filter options ─────────────────────────────────────────

const statusOptions = [
  { value: "", label: "全部状态" },
  ...Object.entries(EQUIPMENT_STATUS).map(([k, v]) => ({ value: k, label: v })),
];

// ═════════════════════════════════════════════════════════════════════

export default async function EquipmentCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    keyword?: string;
    status?: string;
    categoryId?: string;
    stationId?: string;
  }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const kw = sp.keyword || "";
  const status = sp.status || "";
  const categoryId = sp.categoryId || "";
  const stationId = sp.stationId || "";

  // ── Fetch lookup data for filter dropdowns ─────────────────────────

  const [{ data: categories }, { data: stations }] = await Promise.all([
    supabase.from("equipment_category").select("id, name").order("sort_order", { ascending: true }),
    supabase.from("station").select("id, name").order("name"),
  ]);

  const uniqueCategories = Array.from(
    new Map((categories ?? []).map((c) => [c.id, c])).values(),
  );

  const categoryOptions = [
    { value: "", label: "全部分类" },
    ...uniqueCategories.map((c) => ({ value: c.id as string, label: c.name as string })),
  ];

  const stationOptions = [
    { value: "", label: "全部站点" },
    ...(stations ?? []).map((s) => ({ value: s.id as string, label: s.name as string })),
  ];

  // ── Build equipment query with filters ─────────────────────────────

  let query = supabase
    .from("equipment")
    .select("*, category:category_id(name), station:station_id(name)", { count: "exact" })
    .is("deleted_at", null);

  if (kw) {
    query = query.or(`equipment_no.ilike.%${kw}%,name.ilike.%${kw}%,brand.ilike.%${kw}%`);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }
  if (stationId) {
    query = query.eq("station_id", stationId);
  }

  const { data, count } = await query
    .range((page - 1) * 20, page * 20 - 1)
    .order("created_at", { ascending: false });

  const totalPages = Math.ceil((count ?? 0) / 20);
  const equipmentList = (data ?? []) as Record<string, unknown>[];

  // ── Build filter query string for pagination links ─────────────────

  const filterParams = new URLSearchParams();
  if (kw) filterParams.set("keyword", kw);
  if (status) filterParams.set("status", status);
  if (categoryId) filterParams.set("categoryId", categoryId);
  if (stationId) filterParams.set("stationId", stationId);
  const filterQuery = filterParams.toString();

  // ── Column definitions ─────────────────────────────────────────────

  const columns: Column<Record<string, unknown>>[] = [
    {
      id: "equipment_no",
      header: "设备编号",
      cell: (e) => e.equipment_no as string,
      shareIdentity: (e) => `equip-${e.id}`,
    },
    {
      id: "name",
      header: "名称",
      cell: (e) => <span className="font-medium">{e.name as string}</span>,
    },
    {
      id: "category",
      header: "分类",
      cell: (e) => {
        const cat = e.category as unknown as { name: string } | null;
        return cat?.name ?? "-";
      },
    },
    {
      id: "brand",
      header: "品牌",
      cell: (e) => (e.brand as string) ?? "-",
    },
    {
      id: "status",
      header: "状态",
      cell: (e) => (
        <Badge variant={statusVariant[e.status as string] ?? "default"}>
          {EQUIPMENT_STATUS[e.status as string] ?? String(e.status)}
        </Badge>
      ),
    },
    {
      id: "current_location",
      header: "当前位置",
      cell: (e) => {
        const locLabel = LOCATION_LABELS[e.current_location_type as string] ?? (e.current_location_type as string) ?? "-";
        const sta = e.station as unknown as { name: string } | null;
        return sta?.name ? `${sta.name} / ${locLabel}` : locLabel;
      },
      hideOnMobile: true,
    },
    {
      id: "standard_rent",
      header: "月租标准",
      cell: (e) => formatCurrency(e.standard_rent as string),
      className: "tabular-nums",
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <DataPage
      title=""
      pagination={
        totalPages > 1
          ? { page, totalPages, baseUrl: "/equipment/catalog", query: filterQuery || undefined }
          : undefined
      }
      empty={false}
      fab={{ href: "/equipment/catalog/new", label: "新建设备" }}
    >
      <PageHeader
        title="设备台账"
        actions={
          <Link href="/equipment/catalog/new">
            <Button variant="primary">
              <Plus className="h-4 w-4" />
              新建设备
            </Button>
          </Link>
        }
      />

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 pb-4 mb-4 border-b border-zinc-200 dark:border-zinc-700"
      >
        <Input
          name="keyword"
          defaultValue={kw}
          placeholder="设备编号 / 名称 / 品牌"
          label="关键字"
        />
        <Select
          name="status"
          options={statusOptions}
          label="状态"
          defaultValue={status}
        />
        <Select
          name="categoryId"
          options={categoryOptions}
          label="分类"
          defaultValue={categoryId}
        />
        <Select
          name="stationId"
          options={stationOptions}
          label="站点"
          defaultValue={stationId}
        />
        <Button variant="default" type="submit">
          筛选
        </Button>
        {filterQuery && (
          <Link
            href="/equipment/catalog"
            className="inline-flex h-10 items-center px-2 text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            重置
          </Link>
        )}
      </form>

      {/* ── Data table ──────────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={equipmentList}
        keyExtractor={(e) => e.id as string}
        rowHref={(e) => `/equipment/catalog/${e.id}`}
        emptyMessage={
          filterQuery
            ? "未找到匹配的设备，请调整筛选条件"
            : "暂无设备数据"
        }
      />
    </DataPage>
  );
}
