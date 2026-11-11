-- One-time restoration of the missing ADMIN editorial row from the published source.
-- Source: Atlasez/Atlasez01 main, src/content/articles/jpn/mathematics/overview/test-mathematics.md
-- Published source commit: 2026-09-13 07:07:29 UTC.
-- Apply manually only after PR review, a D1 backup, and confirming production lacks the row.
-- The guards avoid overwriting any document at this ID, article ID, or public path.
INSERT INTO editorial_documents (
  id, creator_kind, document_kind, source_article_id, subject, category, locale,
  slug, title, summary, concept_id, concept_is_new, body, writing_memo,
  latex_engine, status, created_by, updated_by, created_at, updated_at,
  reviewed_at, published_at, publication_review_round, locked_ranges,
  article_references
)
SELECT
  '2577d423-0979-4b3d-9a74-6f08bd2a00ce', 'organization', 'canonical',
  'ja-mathematics-overview-test-mathematics', 'mathematics', 'overview', 'ja',
  'test-mathematics', '【テスト記事】公開確認と枠表示確認',
  '数学分野の枠を含むテスト記事', 'math.overview.what-is-mathematics', 0,
  '# 枠のテスト
## 定義, 命題枠

:::defi タイトル$ab$ {#defi-id-test}

定義の本文
$$
\sum_{i=1}^ni=\frac{n(n+1)}{2}
$$
:::

:::prop タイトル$ab$ {#prop-id-test}

命題の本文
$$
\sum_{i=1}^ni=\frac{n(n+1)}{2}
$$
:::

::: proof

証明の内容

[[ref:defi-id-test]]を用いる

:::

:::lemma タイトル$ab$ {#lemma-id-test}

本文
$$
\sum_{i=1}^ni=\frac{n(n+1)}{2}
$$
:::

:::cor タイトル$ab$ {#cor-id-test}

本文
$$
\sum_{i=1}^ni=\frac{n(n+1)}{2}
$$
:::

:::defi foldingテスト {#defi-id-test2}

本文の中にfoldingが入る

::: folding タイトル

折り畳みの内容

:::

::: folding タイトル

折り畳みの内容

:::

::: folding タイトル

折り畳みの内容

:::

:::

::: remark
補足の内容
折りたためるようにする？
改行ができない
:::

# 図のテスト
## svg画像
**【要修正】画像のアップロードができません**![HE3KO02XwAEw8Wp.jpg](/images/editorial/2577d423-0979-4b3d-9a74-6f08bd2a00ce/HE3KO02XwAEw8Wp.jpg)

## 公開レンダリング回帰テスト

表示数式を挟んでも連番が継続するか確認します。

1. 数式前の項目
2. 数式前の項目

$$
x = y
$$

1. 数式後の項目

:::folding 通常のfoldingタイトル

指定のないタイトルは太字にしません。

:::

:::folding **明示的に太字のfoldingタイトル**

明示したタイトルだけ太字にします。

:::', '', 'katex', 'approved', 'ukyoukay0@gmail.com', 'ukyoukay0@gmail.com',
  '2026-08-30T00:00:00.000Z', '2026-09-13T07:07:29.000Z',
  '2026-09-13T07:07:29.000Z', '2026-09-13T07:07:29.000Z', 0, '[]', '[]'
WHERE NOT EXISTS (
  SELECT 1 FROM editorial_documents WHERE id='2577d423-0979-4b3d-9a74-6f08bd2a00ce'
     OR source_article_id='ja-mathematics-overview-test-mathematics'
     OR (locale='ja' AND subject='mathematics' AND category='overview' AND slug='test-mathematics')
);
