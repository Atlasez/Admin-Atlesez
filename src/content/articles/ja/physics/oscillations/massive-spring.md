---
articleId: ja-physics-massive-spring
locale: ja
title: 質量のあるバネ
slug: massive-spring
subject: physics
category: oscillations
concepts:
  - id: physics.oscillations.massive-spring
authors:
  - atlas-physics-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 実際のバネは質量を持つ。質量のあるバネを鉛直方向に吊り下げると、自重の分、質量のないバネよりも伸びるはずだ。 …
difficulty: intermediate
estimatedMinutes: 10
tags:
  - 質量のあるバネ
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

実際のバネは質量を持つ。質量のあるバネを鉛直方向に吊り下げると、自重の分、質量のないバネよりも伸びるはずだ。 ここではその質量を無視せずに、質量のあるバネが釣り合いの位置にある時の自然長からの変位を計算してみよう。

Q. 「質量を持っている」ことをどうやってモデル化すれば良いだろうか？ バネの質量を $m$ 、バネ定数を $k$ 、求める自然長からの変位を $\Delta l$ とおく。バネの密度は均一であるとする。 （ヒント：質量のないバネにおもりを吊るしたものは簡単で見慣れているはずだ。）

A. 質量のあるバネを $N$ 等分し、その微小部分を質量のないバネと重りからなると考え、$N\to\infty$ の極限をとれば良い。

$N$ 個のバネ/おもりを区別するために、下から数えて「$n$ 番目のバネ/おもり」と呼ぶ。 この微小なバネのバネ定数は $Nk$ である。$n$ 番目のバネの自然長からの伸びを $x_n$ とおく。 $1$ から $n$ 番目までの $n$ 個のおもりを一体として見ると、これに働く重力と、$n$ 番目のバネからの弾性力とが釣り合っているので、

$$
 Nkx_n=n\frac{m}{N}g\iff x_n=n\frac{1}{N^2}\frac{mg}{k}
$$

となる。よって、

$$
 \begin{split} \Delta l&=\lim_{N\to\infty}\sum_{n=1}^Nx_n\\ &=\lim_{N\to\infty}\frac{1}{2}N(N+1)\frac{1}{N^2}\frac{mg}{k}\\ &=\lim_{N\to\infty}\frac{N+1}{N}\frac{mg}{2k}=\frac{mg}{2k} \end{split}
$$

と求まる。

### 結論

$k\Delta l=\frac{m}{2}g$ より、 「質量のあるバネの釣り合い位置は、その質量の $\frac{1}{2}$ のおもりを質量のないバネに吊るしたものと等しい。」 これはおもりがついている場合にも同様に成り立つ。
