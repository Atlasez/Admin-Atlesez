-- 運営者ごとのカスタムLaTeXプリセットを本人用ワークスペースに保存する。
ALTER TABLE editorial_personal_workspaces
  ADD COLUMN math_presets TEXT NOT NULL DEFAULT '[]';
