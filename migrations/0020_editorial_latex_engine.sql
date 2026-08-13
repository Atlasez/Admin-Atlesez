-- 原稿ごとに、外部コンパイル時に使うLaTeXエンジンを記録する。
-- Cloudflare Worker本体はTeXバイナリを実行しないため、実コンパイル基盤は別途接続する。
ALTER TABLE editorial_documents ADD COLUMN latex_engine TEXT NOT NULL DEFAULT 'mathjax'
  CHECK (latex_engine IN ('uplatex', 'pdflatex', 'xelatex', 'lualatex', 'mathjax', 'katex'));
