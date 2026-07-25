---
articleId: ja-mathematics-group-examples
locale: ja
title: 群の例
slug: group-examples
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.group-examples
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  例 1 (自明な群). 一点集合 は演算 により群をなす. 単位元は で, の逆元も である. これを自明群, 自明な群(trivial
  group)という. 例 2. は加法に関して群をなす. 単位元は で, の逆元は…
difficulty: intermediate
estimatedMinutes: 20
tags:
  - 群の例
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

例 1 (自明な群). 一点集合$\{e\}$は演算$e\cdot e=e$により群をなす. 単位元は$e$で, $e$の逆元も$e$である. これを自明群, 自明な群(trivial group)という.

例 2. $\mathbb{R}$は加法に関して群をなす. 単位元は$0$で, $x\in \mathbb{R}$の逆元は$-x$である. 同様にして$\mathbb{Z},\mathbb{Q}$も加法に関して群をなす. この群はアーベル群かつ無限群である. 一方で$\mathbb{Z}_{>0}=\{1,2,\ldots\}$は加法に関して結合法則は成り立つが単位元が存在しないので群ではない.

例 3. $\mathbb{R}\setminus\{0\}$は乗法に関して群をなす. 単位元は$1$で, $x\in\mathbb{R}\setminus\{0\}$の逆元は$1/x$である. この群はアーベル群かつ無限群である. 一方で$\mathbb{R}$は乗法によってモノイドであるが群にならない. これは$0\in\mathbb{R}$の逆元が$\mathbb{R}$内に存在しないからである.

例 4. もちろん, 集合として同じでも異なる演算が入っている群を作ることが可能である. $\mathbb{R}$上の二項演算$*$を

$$
\begin{align*} x*y:=x+y+1 \end{align*}
$$

と定義すれば結合法則が成り立ち, 単位元は$-1$, $x\in\mathbb{R}$の逆元は$-x-2\in\mathbb{R}$である.

例 5 (対称群). 集合$\{1,2,\ldots ,n\}$からそれ自身への全単射全体は写像の合成を演算として群をなす. 単位元は恒等写像である. この群を$S_n$で表し$n$次対称群(symmetric group)という. $\sigma\in S_n$を次のように表す.

$$
\begin{align*} \sigma= \begin{pmatrix} 1 & 2 & \cdots & n-1 & n \\ \sigma(1) & \sigma(2) & \cdots & \sigma(n-1) & \sigma(n) \end{pmatrix} \end{align*}
$$

例えば$\sigma\in S_3$が$\sigma(1)=2,\,\sigma(2)=3,\,\sigma(3)=1$となる全単射であるときは

$$
\begin{align*} \sigma=\begin{pmatrix} 1 & 2 & 3 \\ 2 & 3 & 1 \end{pmatrix} \end{align*}
$$

と表す. $S_n$は位数$n!$の有限群で$n\geq 3$のとき非アーベル群である.

例 6 (一般線形群). 体$\mathbb{K}$上の可逆な$n\times n$行列全体$\mathop{\mathrm{\mathit{GL}}}(n,\mathbb{K})$は行列の乗法によって群をなす. 単位元は$n\times n$単位行列$I$で, $A\in \mathop{\mathrm{\mathit{GL}}}(n,\mathbb{K})$の逆元は逆行列$A^{-1}$である. この群を一般線形群(general linear group)という. 行列の積は一般に可換ではないため, 一般線形群は非アーベル群である.

例 7 (乗法群). モノイド$M$においては逆元が存在するとは限らない. $x\in M$に対し$x^{-1}\in M$が存在して

$$
\begin{align*} xx^{-1}=x^{-1}x=e \end{align*}
$$

となる$x$を可逆元(invertible element), 単元(unit)という. $M$の可逆元全体はモノイドの演算によって群をなし, これを$G^{\times}$とかき乗法群(multiplicative group), 単元群(group of units)という. 特に$\mathbb{Q},\mathbb{R},\mathbb{C}$はいずれも乗法$\times$に関してモノイドをなし, その乗法群はそれぞれ

$$
\begin{align*} (\mathbb{Q}\setminus\{0\},\times),\quad(\mathbb{R}\setminus\{0\},\times),\quad(\mathbb{C}\setminus\{0\},\times) \end{align*}
$$

であり, これらは演算を省略して単に$\mathbb{Q}^{\times},\mathbb{R}^{\times},\mathbb{C}^{\times}$などと書かれることが多い.

例 8 (二面体群). 正$n$角形とその中心Oを考える. この正$n$角形は次の操作によって不変である.

- Oを中心とした$360^{\circ}\times k/n$(ただし$k=0,1,\ldots ,n-1$)の$n$個の回転.

- 正$n$角形の$n$本の対称軸を中心とした鏡映.

正$n$角形の対称軸は具体的には次の$n$本である. $n$が奇数の場合, 正$n$角形の頂点とそれと向かい合う辺の中点を結ぶ直線. $n$が偶数の場合, 向かい合う2つの頂点を結ぶ直線が$n/2$本と, 向かい合う2つの辺の中点を結ぶ直線が$n/2$本の合計$n$本の直線.

以上の回転と鏡映の操作の集合を$D_n$としたとき, $D_n$は操作の合成を演算として群となる. これを二面体群(dihedral group)という. $0^{\circ}$の回転が二面体群の単位元である. $D_n$は位数$2n$の有限群で$n\geq 3$のとき非アーベル群である.
