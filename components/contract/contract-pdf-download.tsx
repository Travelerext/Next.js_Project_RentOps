"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function esc(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatCurrency(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  if (isNaN(n)) return "¥0.00";
  return `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(val: string | null | undefined) {
  if (!val) return "________";
  return new Date(val).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

interface Props {
  contractId: string;
}

export function ContractPdfDownload({ contractId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generatePdf = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const { data: contract, error: cErr } = await supabase
        .from("rental_contract")
        .select("*, customer:customer_id(name, contact_name)")
        .eq("id", contractId)
        .maybeSingle();

      if (cErr || !contract) {
        setError("合同数据获取失败");
        setLoading(false);
        return;
      }

      const { data: items } = await supabase
        .from("rental_contract_item")
        .select("*")
        .eq("contract_id", contractId);

      if (!items?.length) {
        setError("合同没有设备明细");
        setLoading(false);
        return;
      }

      const { data: order } = contract.order_id
        ? await supabase
            .from("rental_order")
            .select("order_no")
            .eq("id", contract.order_id)
            .maybeSingle()
        : { data: null };

      // Build printable HTML
      const itemRows = items
        .map(
          (item) => `
        <tr>
          <td class="td">${esc(item.equipment_no_snapshot)}</td>
          <td class="td">${esc(item.equipment_name_snapshot)}</td>
          <td class="td right">${formatCurrency(item.rent_unit_price)}</td>
          <td class="td right">${formatCurrency(item.deposit_amount)}</td>
          <td class="td right">${formatCurrency(item.rent_amount)}</td>
        </tr>`
        )
        .join("");

      const extraSection =
        contract.remark || contract.special_terms
          ? `
        <h2>六、其他约定</h2>
        ${contract.remark ? `<p>${esc(contract.remark)}</p>` : ""}
        ${contract.special_terms ? `<p>${esc(contract.special_terms)}</p>` : ""}
      `
          : "";

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${esc(contract.contract_no)}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif; font-size: 12px; color: #222; line-height: 1.8; }
    h1 { text-align: center; font-size: 20px; margin-bottom: 24px; }
    h2 { font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 18px; }
    p { margin: 2px 0; }
    .info { background: #f9fafb; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; }
    .info p { font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
    th { background: #f0f0f0; text-align: left; padding: 5px 6px; font-size: 10px; }
    td { border-bottom: 1px solid #eee; padding: 5px 6px; font-size: 10px; }
    .right { text-align: right; }
    .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
    .sig { width: 45%; }
    .sig p { margin: 6px 0; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <h1>机械设备租赁合同</h1>

  <div class="info">
    <p>合同编号：${esc(contract.contract_no)}</p>
    ${order ? `<p>关联订单：${esc(order.order_no)}</p>` : ""}
    <p>签订日期：${formatDate(contract.signed_at)}</p>
    <p>生效日期：${formatDate(contract.effective_at)}</p>
  </div>

  <h2>合同双方</h2>
  <p>甲方（出租方）：机械设备租赁有限公司</p>
  <p>乙方（承租方）：${esc(contract.customer?.name ?? "________")}</p>
  ${contract.customer?.contact_name ? `<p>乙方联系人：${esc(contract.customer.contact_name)}</p>` : ""}

  <h2>一、租赁设备清单</h2>
  <table>
    <thead><tr><th>设备编号</th><th>设备名称</th><th class="right">租金单价</th><th class="right">押金</th><th class="right">小计</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <h2>二、租赁期限</h2>
  <p>起始日期：${formatDate(contract.start_at)}</p>
  <p>结束日期：${formatDate(contract.end_at)}</p>

  <h2>三、租金及押金</h2>
  <p>租金总额：${formatCurrency(contract.total_rent_amount)}</p>
  <p>押金总额：${formatCurrency(contract.deposit_amount)}</p>

  <h2>四、设备使用与维护</h2>
  <p>1. 乙方应按照设备操作规程正确使用设备，不得超负荷或违规操作。</p>
  <p>2. 设备的日常保养由乙方负责，包括但不限于清洁、润滑、紧固等基础维护工作。</p>
  <p>3. 设备的大修及故障维修由甲方负责，但因乙方操作不当导致的损坏除外。</p>
  <p>4. 因乙方原因造成的设备损坏（非正常磨损），维修费用由乙方承担。</p>

  <h2>五、违约责任</h2>
  <p>1. 乙方逾期支付租金的，每逾期一日按应付租金的0.5%向甲方支付违约金。</p>
  <p>2. 乙方未经甲方书面同意，不得转租、出借或抵押租赁设备。</p>
  <p>3. 租赁期满，乙方应按时归还设备。逾期归还的，按日租金的1.5倍计收超期使用费。</p>
  <p>4. 任何一方擅自解除合同的，应赔偿对方因此遭受的全部损失。</p>

  ${extraSection}

  <div class="signatures">
    <div class="sig">
      <p>甲方（盖章）：_______________</p>
      <p>授权代表签字：_______________</p>
      <p>日期：_______________</p>
    </div>
    <div class="sig">
      <p>乙方（盖章）：_______________</p>
      <p>授权代表签字：_______________</p>
      <p>日期：_______________</p>
    </div>
  </div>
</body>
</html>`;

      const w = window.open("", "_blank");
      if (!w) {
        setError("请允许弹出窗口以生成PDF");
        setLoading(false);
        return;
      }

      w.document.write(html);
      w.document.close();

      // Wait for content to render, then print
      w.onload = () => {
        setTimeout(() => {
          w.print();
          setLoading(false);
        }, 400);
      };

      // If onload doesn't fire (already loaded), trigger after a short delay
      setTimeout(() => {
        if (loading) {
          w.print();
          setLoading(false);
        }
      }, 800);
    } catch (e) {
      console.error("PDF generation error:", e);
      setError("PDF生成失败");
      setLoading(false);
    }
  }, [contractId, loading]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={generatePdf}
        disabled={loading}
      >
        {loading ? (
          <><Loader2 className="h-4 w-4 animate-spin" />生成中...</>
        ) : (
          <><Download className="h-4 w-4" />下载PDF</>
        )}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </>
  );
}
