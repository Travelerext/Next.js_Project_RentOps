-- RentOps clean initial seed.
--
-- Purpose:
-- 1. Keep user, role, permission and organization data.
-- 2. Delete all other public table data.
-- 3. Recreate baseline warehouses, stations, equipment catalog, equipment,
--    customers and spare parts.
-- 4. Ensure all equipment starts as IN_STOCK and all customers start with
--    good credit.
--
-- Run manually with the Supabase SQL editor, or with psql:
--   psql "$DATABASE_URL" -f supabase/seed.sql

BEGIN;

DO $$
DECLARE
  keep_tables text[] := ARRAY[
    'profiles',
    'role',
    'permission',
    'profile_role',
    'role_permission',
    'data_scope_rule',
    'department'
  ];
  truncate_sql text;
BEGIN
  SELECT
    'TRUNCATE TABLE ' ||
    string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename) ||
    ' RESTART IDENTITY CASCADE'
  INTO truncate_sql
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename <> ALL (keep_tables);

  IF truncate_sql IS NOT NULL THEN
    EXECUTE truncate_sql;
  END IF;
END $$;

-- Warehouses and service stations.
INSERT INTO public.warehouse (id, name, address) VALUES
  ('a0000000-0000-0000-0000-000000000001', '总仓库（城北）', '北京市朝阳区北辰路188号'),
  ('a0000000-0000-0000-0000-000000000002', '城南分仓', '北京市大兴区黄村工业园3号'),
  ('a0000000-0000-0000-0000-000000000003', '上海分仓', '上海市浦东新区金桥路600号')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address;

INSERT INTO public.station (id, name, address) VALUES
  ('b0000000-0000-0000-0000-000000000001', '北京服务站', '北京市朝阳区北辰路188号'),
  ('b0000000-0000-0000-0000-000000000002', '上海服务站', '上海市浦东新区金桥路600号')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address;

-- Equipment catalog.
INSERT INTO public.equipment_category (id, name, description) VALUES
  ('c0000000-0000-0000-0000-000000000001', '液压挖掘机', '各吨位液压挖掘机，适用于土方开挖'),
  ('c0000000-0000-0000-0000-000000000002', '装载机', '轮式/履带装载机'),
  ('c0000000-0000-0000-0000-000000000003', '汽车起重机', '25T-200T 汽车吊'),
  ('c0000000-0000-0000-0000-000000000004', '压路机', '振动/静压压路机'),
  ('c0000000-0000-0000-0000-000000000005', '高空作业平台', '剪叉式、臂式升降车'),
  ('c0000000-0000-0000-0000-000000000006', '推土机', '履带式推土机'),
  ('c0000000-0000-0000-0000-000000000007', '混凝土泵车', '臂架泵车/车载泵'),
  ('c0000000-0000-0000-0000-000000000008', '叉车', '内燃/电动叉车')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO public.equipment_model (
  id,
  category_id,
  model_name,
  brand,
  specification,
  tonnage,
  standard_monthly_rent,
  standard_daily_rent,
  standard_deposit
) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'SY215C', '三一重工', '21.5T 液压挖掘机', 21.5, 35000, 1500, 50000),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'EC210D', '沃尔沃', '21T 液压挖掘机', 21.0, 38000, 1600, 55000),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'PC200-8', '小松', '20T 液压挖掘机', 20.0, 36000, 1550, 50000),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'ZL50CN', '柳工', '5T 轮式装载机', 5.0, 18000, 800, 25000),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'SEM660D', '山工', '6T 轮式装载机', 6.0, 20000, 900, 28000),
  ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', 'QY25K5', '徐工', '25T 汽车起重机', 25.0, 55000, 2500, 80000),
  ('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000003', 'STC500', '三一重工', '50T 汽车起重机', 50.0, 85000, 3500, 120000),
  ('d0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000004', 'XS223J', '徐工', '22T 振动压路机', 22.0, 25000, 1100, 35000),
  ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000005', 'GTJZ0608', '星邦', '6M 剪叉式升降机', NULL, 8000, 400, 10000),
  ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000005', 'GTBZ20J', '星邦', '20M 臂式升降机', NULL, 22000, 1000, 30000),
  ('d0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000008', 'CPCD30', '合力', '3T 内燃叉车', 3.0, 8000, 400, 10000),
  ('d0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000008', 'CPD15', '杭叉', '1.5T 电动叉车', 1.5, 6000, 300, 8000)
ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  model_name = EXCLUDED.model_name,
  brand = EXCLUDED.brand,
  specification = EXCLUDED.specification,
  tonnage = EXCLUDED.tonnage,
  standard_monthly_rent = EXCLUDED.standard_monthly_rent,
  standard_daily_rent = EXCLUDED.standard_daily_rent,
  standard_deposit = EXCLUDED.standard_deposit;

-- Equipment starts available in warehouse.
INSERT INTO public.equipment (
  id,
  equipment_no,
  name,
  category_id,
  model_id,
  brand,
  specification,
  tonnage,
  condition_level,
  warehouse_id,
  station_id,
  standard_rent,
  standard_deposit,
  status,
  purchase_date,
  purchase_price,
  depreciation_years
) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'EQ-215-001', '三一SY215C液压挖掘机', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '三一重工', 'SY215C-9', 21.5, 'A', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 35000, 50000, 'IN_STOCK', '2022-03-15', 850000, 8),
  ('e0000000-0000-0000-0000-000000000002', 'EQ-215-002', '三一SY215C液压挖掘机', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '三一重工', 'SY215C-9', 21.5, 'B', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 35000, 50000, 'IN_STOCK', '2022-05-20', 820000, 8),
  ('e0000000-0000-0000-0000-000000000003', 'EQ-210-001', '沃尔沃EC210D挖掘机', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', '沃尔沃', 'EC210D', 21.0, 'A', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 38000, 55000, 'IN_STOCK', '2023-01-10', 920000, 8),
  ('e0000000-0000-0000-0000-000000000004', 'EQ-200-001', '小松PC200-8挖掘机', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', '小松', 'PC200-8', 20.0, 'C', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 36000, 50000, 'IN_STOCK', '2021-08-01', 780000, 8),
  ('e0000000-0000-0000-0000-000000000005', 'EQ-LD-001', '柳工ZL50CN装载机', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004', '柳工', 'ZL50CN', 5.0, 'A', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 18000, 25000, 'IN_STOCK', '2023-06-20', 380000, 8),
  ('e0000000-0000-0000-0000-000000000006', 'EQ-LD-002', '柳工ZL50CN装载机', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004', '柳工', 'ZL50CN', 5.0, 'B', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 18000, 25000, 'IN_STOCK', '2023-08-15', 370000, 8),
  ('e0000000-0000-0000-0000-000000000007', 'EQ-LD-003', '山工SEM660D装载机', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000005', '山工', 'SEM660D', 6.0, 'A', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 20000, 28000, 'IN_STOCK', '2024-01-05', 420000, 8),
  ('e0000000-0000-0000-0000-000000000008', 'EQ-CR-001', '徐工QY25K5汽车吊', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000006', '徐工', 'QY25K5', 25.0, 'A', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 55000, 80000, 'IN_STOCK', '2022-11-01', 1450000, 10),
  ('e0000000-0000-0000-0000-000000000009', 'EQ-CR-002', '三一STC500汽车吊', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000007', '三一重工', 'STC500', 50.0, 'A', 'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 85000, 120000, 'IN_STOCK', '2023-04-10', 2600000, 10),
  ('e0000000-0000-0000-0000-000000000010', 'EQ-RL-001', '徐工XS223J压路机', 'c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000008', '徐工', 'XS223J', 22.0, 'B', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 25000, 35000, 'IN_STOCK', '2023-03-01', 560000, 8),
  ('e0000000-0000-0000-0000-000000000011', 'EQ-AP-001', '星邦6M剪叉式升降机', 'c0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000009', '星邦', 'GTJZ0608', NULL, 'A', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 8000, 10000, 'IN_STOCK', '2024-02-20', 85000, 6),
  ('e0000000-0000-0000-0000-000000000012', 'EQ-AP-002', '星邦20M臂式升降机', 'c0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000010', '星邦', 'GTBZ20J', NULL, 'A', 'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 22000, 30000, 'IN_STOCK', '2024-03-10', 280000, 8),
  ('e0000000-0000-0000-0000-000000000013', 'EQ-FC-001', '合力3T内燃叉车', 'c0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000011', '合力', 'CPCD30', 3.0, 'A', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 8000, 10000, 'IN_STOCK', '2024-05-15', 72000, 6),
  ('e0000000-0000-0000-0000-000000000014', 'EQ-FC-002', '合力3T内燃叉车', 'c0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000011', '合力', 'CPCD30', 3.0, 'A', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 8000, 10000, 'IN_STOCK', '2024-05-15', 72000, 6),
  ('e0000000-0000-0000-0000-000000000015', 'EQ-FC-003', '杭叉1.5T电动叉车', 'c0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000012', '杭叉', 'CPD15', 1.5, 'A', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 6000, 8000, 'IN_STOCK', '2024-06-01', 55000, 6)
ON CONFLICT (id) DO UPDATE SET
  equipment_no = EXCLUDED.equipment_no,
  name = EXCLUDED.name,
  category_id = EXCLUDED.category_id,
  model_id = EXCLUDED.model_id,
  brand = EXCLUDED.brand,
  specification = EXCLUDED.specification,
  tonnage = EXCLUDED.tonnage,
  condition_level = EXCLUDED.condition_level,
  warehouse_id = EXCLUDED.warehouse_id,
  station_id = EXCLUDED.station_id,
  standard_rent = EXCLUDED.standard_rent,
  standard_deposit = EXCLUDED.standard_deposit,
  status = 'IN_STOCK',
  current_order_id = NULL,
  current_contract_id = NULL,
  current_customer_id = NULL,
  current_location_type = 'WAREHOUSE',
  current_responsible_user_id = NULL,
  current_operator_id = NULL,
  purchase_date = EXCLUDED.purchase_date,
  purchase_price = EXCLUDED.purchase_price,
  depreciation_years = EXCLUDED.depreciation_years,
  updated_at = now();

-- Customers start active with good credit.
INSERT INTO public.customer (
  id,
  customer_no,
  name,
  short_name,
  contact_name,
  contact_phone,
  customer_type,
  credit_level,
  credit_limit,
  risk_level,
  status
) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'CUS-KH001', '北京城建集团有限公司', '北京城建', '张建国', '13801001234', 'ENTERPRISE', 'A', 500000, 'LOW', 'ACTIVE'),
  ('f0000000-0000-0000-0000-000000000002', 'CUS-KH002', '中铁十二局集团第三工程有限公司', '中铁十二局三公司', '李明辉', '13901012345', 'ENTERPRISE', 'A', 300000, 'LOW', 'ACTIVE'),
  ('f0000000-0000-0000-0000-000000000003', 'CUS-KH003', '上海建工集团股份有限公司', '上海建工', '王志强', '13701023456', 'ENTERPRISE', 'A', 400000, 'LOW', 'ACTIVE'),
  ('f0000000-0000-0000-0000-000000000004', 'CUS-KH004', '恒大建筑工程有限公司', '恒大建筑', '赵伟', '13601034567', 'ENTERPRISE', 'A', 100000, 'LOW', 'ACTIVE'),
  ('f0000000-0000-0000-0000-000000000005', 'CUS-KH005', '深圳市鹏程建设有限公司', '鹏程建设', '刘洋', '13501045678', 'ENTERPRISE', 'A', 200000, 'LOW', 'ACTIVE'),
  ('f0000000-0000-0000-0000-000000000006', 'CUS-KH006', '陈老板（个体）', '陈老板', '陈大伟', '15801056789', 'INDIVIDUAL', 'A', 50000, 'LOW', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET
  customer_no = EXCLUDED.customer_no,
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  contact_name = EXCLUDED.contact_name,
  contact_phone = EXCLUDED.contact_phone,
  customer_type = EXCLUDED.customer_type,
  credit_level = 'A',
  credit_limit = EXCLUDED.credit_limit,
  risk_level = 'LOW',
  status = 'ACTIVE',
  updated_at = now();

INSERT INTO public.customer_contact (customer_id, name, phone, position, is_primary) VALUES
  ('f0000000-0000-0000-0000-000000000001', '张建国', '13801001234', '项目经理', true),
  ('f0000000-0000-0000-0000-000000000001', '李雪', '13801001235', '材料员', false),
  ('f0000000-0000-0000-0000-000000000002', '李明辉', '13901012345', '设备部长', true),
  ('f0000000-0000-0000-0000-000000000003', '王志强', '13701023456', '物资部长', true),
  ('f0000000-0000-0000-0000-000000000005', '刘洋', '13501045678', '总经理', true);

INSERT INTO public.spare_part (
  id,
  part_no,
  part_name,
  specification,
  current_stock,
  safety_stock,
  unit,
  unit_price,
  warehouse_id
) VALUES
  ('ab000000-0000-0000-0000-000000000001', 'SP-001', '挖掘机斗齿', 'SY215适配', 50, 20, 'PIECE', 120, 'a0000000-0000-0000-0000-000000000001'),
  ('ab000000-0000-0000-0000-000000000002', 'SP-002', '液压油滤芯', '通用型', 30, 10, 'PIECE', 350, 'a0000000-0000-0000-0000-000000000001'),
  ('ab000000-0000-0000-0000-000000000003', 'SP-003', '发动机机油滤清器', '沃尔沃EC210适配', 20, 8, 'PIECE', 280, 'a0000000-0000-0000-0000-000000000001'),
  ('ab000000-0000-0000-0000-000000000004', 'SP-004', '履带板总成', 'PC200-8适配', 8, 4, 'SET', 8500, 'a0000000-0000-0000-0000-000000000002'),
  ('ab000000-0000-0000-0000-000000000005', 'SP-005', '轮胎 23.5-25', '装载机通用', 12, 6, 'PIECE', 3200, 'a0000000-0000-0000-0000-000000000001'),
  ('ab000000-0000-0000-0000-000000000006', 'SP-006', '钢丝绳 18mm', '起重机用', 200, 50, 'METER', 45, 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO UPDATE SET
  part_no = EXCLUDED.part_no,
  part_name = EXCLUDED.part_name,
  specification = EXCLUDED.specification,
  current_stock = EXCLUDED.current_stock,
  safety_stock = EXCLUDED.safety_stock,
  unit = EXCLUDED.unit,
  unit_price = EXCLUDED.unit_price,
  warehouse_id = EXCLUDED.warehouse_id,
  status = 'ACTIVE';

-- Final guards for any manually added records that survived because the keep
-- list changes in the future.
UPDATE public.equipment
SET
  status = 'IN_STOCK',
  current_order_id = NULL,
  current_contract_id = NULL,
  current_customer_id = NULL,
  current_location_type = 'WAREHOUSE',
  current_responsible_user_id = NULL,
  current_operator_id = NULL,
  updated_at = now();

UPDATE public.customer
SET
  credit_level = 'A',
  risk_level = 'LOW',
  status = 'ACTIVE',
  updated_at = now();

COMMIT;
