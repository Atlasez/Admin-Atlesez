---
articleId: ja-mathematics-unit-groups
locale: ja
title: 単元群の定義
slug: unit-groups
subject: mathematics
category: ring-theory
concepts:
  - id: math.ring-theory.unit-groups
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  単元群の定義 命題 1 (単元群) 単位的環 の単元全体を と表す. このとき は環の乗法を演算として群をなす. を単元群(group of
  units)または乗法群(multiplicative group)と呼ぶ. …
difficulty: intermediate
estimatedMinutes: 15
tags:
  - 単元群の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 単元群の定義

命題 1 (単元群) 単位的環$R$の単元全体を$R^{\times}$と表す. このとき$R^{\times}$は環の乗法を演算として群をなす. $R^{\times}$を単元群(group of units)または乗法群(multiplicative group)と呼ぶ.

証明. $R$の単位元$1$について$1\in R^{\times}$であるから$R^{\times}$は空でない.

$x,y\in R^{\times}$とすると$x,y$の逆元$x^{-1},y^{-1}$が存在する. このとき

$$
\begin{align*} (xy)(y^{-1}x^{-1})=x(yy^{-1})x^{-1}=xx^{-1}=1 \end{align*}
$$

となるので$xy$は$y^{-1}x^{-1}$を逆元に持ち, $xy\in R^{\times}$が分かる.

$x\in R^{\times}$とすると$x^{-1}$は$x\in R$を逆元に持つので$x^{-1}\in R^{\times}$である.

結合法則は環の定義から従うため, $R^{\times}$は群をなすことが示された. ◻

単位的可換環の単元群はアーベル群である. また左単元全体を考えた場合, 積で閉じるが逆元が存在するとは限らない.

### 直積群の単元群

命題 2 (直積環の単元群) $\{R_{\lambda}\}_{\lambda\in\Lambda}$を単位的環とする. このとき

$$
\begin{align*} \left(\prod_{\lambda\in\Lambda}R_{\lambda}\right)^{\times} \cong \prod_{\lambda\in\Lambda}R_{\lambda}^{\times} \end{align*}
$$

が成り立つ.

証明. $\prod_{\lambda\in\Lambda}R_{\lambda}$の部分集合として両者が一致することを示せばよい.

$$
\begin{align*} &\mathbin{\phantom{=}}\left(\prod_{\lambda\in\Lambda}R_{\lambda}\right)^{\times} \\ &= \{(x_{\lambda})_{\lambda\in\Lambda}\mid \exists (y_{\lambda})_{\lambda\in\Lambda},\ (x_{\lambda})_{\lambda\in\Lambda}(y_{\lambda})_{\lambda\in\Lambda}=1\} \\ &= \{(x_{\lambda})_{\lambda\in\Lambda}\mid \exists (y_{\lambda})_{\lambda\in\Lambda},\ \forall \lambda\in\Lambda,\ x_{\lambda}y_{\lambda}=1\} \\ &= \prod_{\lambda\in\Lambda}R_{\lambda}^{\times} \end{align*}
$$

◻

### 単元群の例

例 3 (零環の単元群) 零環$\{0\}$の単元群は自明な群$\{0\}$である.

例 4 (体の単元群) 体$K$の単元群は$K\setminus \{0\}$である.

例 5 (一般線形群) 単位的環$R$に対して全行列環$\mathrm{M}_n(R)$の単元群を一般線形群(general linear group)といい$\mathrm{GL}_n(R)$で表す.

例 6 (整数環の単元群) $\mathbb{Z}$の単元は$\pm 1$である. よって$\mathbb{Z}$の単元群は$\{\pm 1\}\cong \mathbb{Z}/2\mathbb{Z}$である. また, ガウス整数環$\mathbb{Z}[i]$の単元は$\{\pm 1, \pm i\}$である. よって$\mathbb{Z}[i]$の単元群は$\{\pm 1, \pm i\}\cong \mathbb{Z}/4\mathbb{Z}$である.

### 関手性

環$R,S$とその間の単位的環準同型$f\colon R\to S$を考える. $f$を$R^{\times}$に制限することで群準同型$R^{\times}\to S^{\times}$が得られる. これを$f^{\times}$と書く. この対応により単位的環に対して単元群を対応させる共変関手$(-)^{\times}\colon \mathbf{Ring}\to \mathbf{Grp}$が得られる.

命題 7 (単元群の関手性) 単位的環準同型$f\colon R\to S$に対して, $f^{\times}\colon R^{\times}\to S^{\times}$は群準同型である. さらに, 単位的環準同型$R\xrightarrow{f} S\xrightarrow{g} T$に対して次が成り立つ.

- $(\mathrm{id}_R)^{\times}=\mathrm{id}_{R^{\times}}$.

- $(g\circ f)^{\times}=g^{\times}\circ f^{\times}$.

証明. $x\in R^{\times}$とすると$x$の逆元$x^{-1}$が存在する. このとき

$$
\begin{align*} f(x)f(x^{-1})=f(xx^{-1})=f(1)=1 \end{align*}
$$

となるので$f(x)$は$f(x^{-1})$を逆元に持ち, $f(x)\in S^{\times}$が分かる. $f^{\times}$が群準同型であることは$f$が単位的環準同型であることから従う.

$(\mathrm{id}_R)^{\times}=\mathrm{id}_{R^{\times}}$は明らかに成り立つ. また$(g\circ f)^{\times}=g^{\times}\circ f^{\times}$も$f^{\times}$が$f$の制限であることからただちに従う. ◻

命題 8 単位的環の同型$R\cong S$が成り立つならば, 群の同型$R^{\times}\cong S^{\times}$が成り立つ.

証明. 仮定より, 単位的環準同型$f\colon R \to S$, $g\colon S \to R$が存在して

$$
\begin{align*} g\circ f = \mathrm{id}_R,\quad f\circ g = \mathrm{id}_S \end{align*}
$$

が成り立つ. したがって, 群準同型$f^{\times}\colon R^{\times}\to S^{\times}$と$g^{\times}\colon S^{\times}\to R^{\times}$について[単元群の定義:命題 7]より

$$
\begin{align*} g^{\times}\circ f^{\times} = (g\circ f)^{\times} = (\mathrm{id}_R)^{\times} = \mathrm{id}_{R^{\times}} \\ f^{\times}\circ g^{\times} = (f\circ g)^{\times} = (\mathrm{id}_S)^{\times} = \mathrm{id}_{S^{\times}} \end{align*}
$$

が成り立つ. よって$f^{\times}$が群の同型$R^{\times}\cong S^{\times}$を与える. ◻
