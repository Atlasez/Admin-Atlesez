# 記事素材・LaTeX/TikZ運用

記事編集ワークスペースの「図・画像」パネルは、Overleafの素材パネルを参考にした小さな素材管理機能です。現在は記事ごとに画像をアップロードし、本文へ挿入して、査読プレビューで確認できます。

## 画像の流れ

1. 原稿を一度保存する。
2. 「画像をアップロード」からPNG、JPEG、WebP、GIFを選ぶ。
3. alt（画像の説明）を入力し、アップロードする。
4. 本文へ自動的に `![説明](asset://UUID)` が挿入される。
5. 編集画面のプレビューでは、認証済みの素材APIから画像を表示する。
6. 管理者が公開すると、Workerが画像を `public/images/editorial/<document-id>/` へGitHub反映し、Markdown内の参照を公開サイト用の相対URLへ変換する。

アップロードは1ファイル1.5MB以下に制限し、MIME typeだけでなく画像のマジックナンバーも検査します。SVG、HTML、外部URLは初期実装では受け付けません。これにより、SVG内のスクリプトや外部参照をそのまま公開するリスクを避けます。大きな画像や動画は、将来的にR2等のオブジェクトストレージへ分離します。

## TikZ / LaTeX

本文の「TikZテンプレートを挿入」から、次のような fenced blockを挿入できます。

````markdown
```tikz
\begin{tikzpicture}
  \draw[->] (0,0) -- (2,0) node[right] {$x$};
\end{tikzpicture}
```
````

TikZソースは原稿、版履歴、GitHub公開用Markdownに保存されます。現在のWorkerはTeXバイナリを実行しないため、編集画面ではソースを安全にプレビューします。実際の図の自動組版を有効にする場合は、Workerから呼び出す専用のLaTeXコンパイルサービスを追加します。コンパイルサービスは次の条件を満たす必要があります。

- コンテナまたはサンドボックス内で実行し、ネットワークを無効にする
- `\write18`、任意の `\input` / `\include`、shell escapeを禁止する
- CPU、メモリ、入力サイズ、実行時間を制限する
- 入力はTikZ図のソースだけに限定し、成果物はSVGまたはPNGだけ返す
- 返却するSVGをサニタイズし、外部URL・script・foreignObjectを除去する
- WorkerにはサービスURLだけを設定し、ユーザーが任意URLを指定できないようにする

この接続口を採用すれば、upLaTeX、LuaLaTeX、XeLaTeX等を選べる現在の `latex_engine` と、将来の図プレビューを同じ原稿に紐づけられます。

## 参考にした操作モデル

- [Overleaf: Uploading images](https://docs.overleaf.com/writing-and-editing/inserting-images/uploading-images)
- [Overleaf: Inserting images](https://www.overleaf.com/learn/latex/Inserting_Images)
- [Overleaf: TikZ package](https://www.overleaf.com/learn/latex/TikZ_package)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

## 将来の拡張

- 素材のドラッグ＆ドロップ、複数ファイルアップロード
- 画像の差し替え・削除・使用箇所検索
- 図のキャプション、ラベル、本文からの参照リンク
- R2へ画像を移し、D1にはメタデータだけを保存
- LaTeXコンパイル結果のキャッシュとエラー行表示
- GitHubへの本文・素材の単一コミット化
