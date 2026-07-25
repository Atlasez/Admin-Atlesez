# 公開手順（mitukx/Atlasez01）

コミットまで済んでいます。あとは下の 3 ステップだけです。

公開先URL: **https://mitukx.github.io/Atlasez01/**
学習サイト: **https://mitukx.github.io/Atlasez01/atlas/ja/**

---

## 1. 先に GitHub Pages を有効化する（push より先に）

https://github.com/mitukx/Atlasez01/settings/pages を開き、

- **Source** を `Deploy from a branch` ではなく **`GitHub Actions`** に変更

これを先にやらないと、初回の CI がデプロイ工程で失敗します。

## 2. push する

ターミナルで：

```bash
cd ~/Downloads/atlasez-web-main
git push -u origin main
```

初回は GitHub の認証を求められます。パスワード欄には
[Personal Access Token](https://github.com/settings/tokens)（`repo` と `workflow` にチェック）
を貼ってください。GitHub CLI を入れている場合は `gh auth login` を先に済ませておけば聞かれません。

## 3. CI の完了を待つ

https://github.com/mitukx/Atlasez01/actions

`verify` → `deploy` の順に走ります。verify は 5〜10 分ほどかかります（E2E と Lighthouse を含むため）。
緑になれば公開完了です。

---

## 設定について

`.github/workflows/ci.yml` はリポジトリ名から自動的にパスを決めます。

```yaml
SITE_URL: https://mitukx.github.io
BASE_PATH: /Atlasez01
```

リポジトリ名を変えるとURLも自動で追従するので、この部分を手で書き換える必要はありません。

## 独自ドメインに移す場合

1. `public/CNAME` を作り、ドメイン名だけを 1 行書く
2. `.github/workflows/ci.yml` の `SITE_URL` を `https://<ドメイン>`、`BASE_PATH` を `/` に固定
3. DNS で GitHub Pages 向けのレコードを設定

## push 前に手元で確認したいとき

```bash
cd ~/Downloads/atlasez-web-main
npm ci
npm run dev          # http://localhost:4321/atlas/ja/
```

本番と同じパスで確認する場合：

```bash
BASE_PATH=/Atlasez01 SITE_URL=https://mitukx.github.io npm run build
npm run preview
```

## 初回 CI がコケたら

考えられるのは E2E（Playwright + axe）だけです。こちらの環境では Chromium が入らず未実行でした。
落ちた場合はログを見せていただければ直します。急ぎで公開を優先するなら、
`ci.yml` の E2E と Lighthouse の step に `continue-on-error: true` を足せば通ります。
