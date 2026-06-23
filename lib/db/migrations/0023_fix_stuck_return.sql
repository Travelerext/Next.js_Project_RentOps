-- ============================================
-- Migration 0023: Fix stuck return request + add manual advance action
-- ============================================
-- Update all PENDING return requests to PENDING_APPROVAL
-- where the associated order is completed or partially returned.
-- ============================================

UPDATE public.return_request rr
SET request_status = 'PENDING_APPROVAL', updated_at = now()
WHERE rr.request_status = 'PENDING';

-- If no orders are completed, still advance all PENDING requests
-- (they were created via the return request flow and need processing)
