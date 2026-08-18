-- 原稿内で \includegraphics{...} として再利用する素材名。
ALTER TABLE editorial_assets
  ADD COLUMN latex_name TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX editorial_assets_document_latex_name
  ON editorial_assets (document_id, lower(latex_name))
  WHERE latex_name <> '';
