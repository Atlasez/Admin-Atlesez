-- 応募時点の運営通知先を固定し、commit後の受付処理を継続照合できるようにする。
-- 既存queueがある応募はその保存済み宛先だけを復元する。履歴queueがない応募は
-- 当時の通知先を推測せずNULLのままにし、現在の設定との誤比較を避ける。
ALTER TABLE atlasez_member_applications
  ADD COLUMN operator_notification_recipients_json TEXT;

ALTER TABLE atlasez_member_applications
  ADD COLUMN intake_reconciliation_required INTEGER NOT NULL DEFAULT 0
  CHECK (intake_reconciliation_required IN (0,1));

UPDATE atlasez_member_applications AS a
   SET operator_notification_recipients_json = (
     SELECT json_group_array(lower(trim(e.recipient_email)))
       FROM atlasez_application_email_deliveries AS e
      WHERE e.application_id = a.id
        AND e.kind = 'operator_notification'
   )
 WHERE EXISTS (
   SELECT 1 FROM atlasez_application_email_deliveries AS e
    WHERE e.application_id = a.id
      AND e.kind = 'operator_notification'
 );

CREATE INDEX idx_atlasez_member_applications_intake_reconciliation
  ON atlasez_member_applications(created_at)
  WHERE intake_reconciliation_required = 1;
