-- ============================================
-- Migration 0014: Fix approval RLS — include APPROVER role
-- ============================================
-- The approval_request SELECT RLS policy only allowed SYSTEM_ADMIN,
-- SALES_MANAGER, FINANCE_MANAGER, and GENERAL_MANAGER to view all
-- approvals. Users with APPROVER role could only see their own
-- applications, making the /approval/pending page empty for them.
-- ============================================

-- approval_request SELECT — add APPROVER
DROP POLICY IF EXISTS "Users can view own approvals" ON public.approval_request;
CREATE POLICY "Users can view own approvals" ON public.approval_request
  FOR SELECT USING (
    applicant_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'APPROVER'
    )
  );

-- approval_request UPDATE — add APPROVER
DROP POLICY IF EXISTS "Managers can update approvals" ON public.approval_request;
CREATE POLICY "Managers can update approvals" ON public.approval_request
  FOR UPDATE USING (
    public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'APPROVER'
    )
  );

-- approval_step_record SELECT — add APPROVER
DROP POLICY IF EXISTS "Users can view approval steps" ON public.approval_step_record;
CREATE POLICY "Users can view approval steps" ON public.approval_step_record
  FOR SELECT USING (
    approval_id IN (
      SELECT id FROM public.approval_request
      WHERE applicant_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    )
    OR public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'APPROVER'
    )
  );
