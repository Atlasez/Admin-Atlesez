# TikZ組版サービス

TikZはブラウザのTikZJaxではなく、`node-tikzjax`を使うNode.jsサービスでSVG化します。公開記事はAstroのビルド時にSVGを埋め込み、編集プレビューは管理Workerが同じサービスを中継するため、公開時とプレビューで描画エンジンが分かれません。

## ローカルで起動

```sh
npm run tikz:server
```

編集画面のプレビューをローカルで使う場合は、管理Workerの環境変数に次を設定します。

```sh
TIKZ_RENDERER_URL=http://127.0.0.1:8788/render
TIKZ_RENDERER_TOKEN=（任意。設定した場合は同じ値を組版サービスにも設定）
```

本番ではこのNodeプロセスをHTTPSで到達できる専用サービスに配置し、`TIKZ_RENDERER_URL`と、必要ならCloudflare Secretの`TIKZ_RENDERER_TOKEN`を設定してください。Cloudflare WorkerだけではNodeのWASM・ファイルシステム依存を実行できないため、組版サービスを別プロセスにしています。

追加料金を避ける場合、編集プレビューは組版サービスが未設定・停止中のときだけ公式TikZJaxへフォールバックします。TikZJaxはブラウザ内でSVGを生成するため無料で使えますが、このフォールバック時は公開ビルドで生成したSVGとバイト単位では一致しません。公開記事は引き続きビルド時のNode組版結果を使用します。Cloudflare ContainersはWorkers Freeでは利用できず、現在の無料構成では採用していません。

## 利用できるパッケージ

次のパッケージだけを許可しています。

`amsmath`, `amstext`, `amsfonts`, `amssymb`, `array`, `chemfig`, `circuitikz`, `pgfplots`, `tikz-3dplot`, `tikz-cd`

ライブラリは`arrows.meta`、`calc`、`positioning`、`matrix`など、組込み許可リストの24個を利用できます。TikZブロック内で、たとえば次のように宣言します。

```tex
\usepackage{pgfplots}
\usetikzlibrary{arrows.meta,calc}
\begin{tikzpicture}
  ...
\end{tikzpicture}
```

外部ファイル読込、シェル実行、外部URL、`documentclass`や`document`環境は拒否します。ソースは24,000文字、パッケージは8個、ライブラリは24個までです。許可リストを増やす場合は、実際に同梱TeX環境でテストしてから`src/lib/tikz-policy.mjs`を変更してください。
