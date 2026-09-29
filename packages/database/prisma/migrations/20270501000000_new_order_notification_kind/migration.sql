-- Final pass, Phase 1 (ORD-1): staff are told about new orders. The enum
-- value is added on its own so the next migration can use it (a value added
-- in a transaction can't be used until that transaction commits).
ALTER TYPE "StaffNotificationKind" ADD VALUE 'NEW_ORDER';
