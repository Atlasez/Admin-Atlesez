---
articleId: ja-mathematics-group-action-properties
locale: ja
title: 群の作用の性質と例
slug: group-action-properties
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.group-action-properties
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  群の作用の性質 定義 1 (推移的な作用). 群 が集合 に作用しているとする. ある が存在して となるとき, すなわち
  となるときこの群作用は推移的(transitive)であるという. 定義 2 (忠実な作用). …
difficulty: intermediate
estimatedMinutes: 20
tags:
  - 群の作用の性質と例
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 群の作用の性質

定義 1 (推移的な作用). 群$G$が集合$X$に作用しているとする. ある$x\in X$が存在して$\operatorname{Orb}_G(x)=X$となるとき, すなわち

$$
\begin{align*} \forall x,y\in X,\,\exists g\in G,\, g.x=y \end{align*}
$$

となるときこの群作用は推移的(transitive)であるという.

定義 2 (忠実な作用). 群$G$が集合$X$に作用しているとする. その置換表現$\rho\colon G\to \mathop{\mathrm{Sym}}{X}$が単射であるとき, すなわち$g\in G$として

$$
\begin{align*} [\forall x\in X,\, g.x=x] \iff g=e \end{align*}
$$

が成り立つとき, 群作用は忠実(faithful)であるという.

定義 3 (自由な作用). 群$G$が集合$X$に作用しているとする. 単位元による作用以外に不動点を持たない, すなわち$g\in G$として

$$
\begin{align*} \forall x\in X,\, [g.x=x \iff g=e] \end{align*}
$$

が成り立つとき, 群作用は自由(free)であるという.

定義から分かるように群の作用が自由ならば忠実である.

定義 4 (正則作用). 群$G$が集合$X$に作用しているとする. その作用が自由かつ推移的であるとき, 群作用は正則(regular)であるという.

### 群の作用の例

例 5 (正則作用). $G$を群とする. $g,h\in G$として$G$は$G$自身に$g.h:=gh$によって左から作用する. この作用の置換表現$\rho\colon G\to \mathop{\mathrm{Sym}}(G)$は$\rho(g)\colon h\mapsto gh$でありこれを左正則作用(left regular action)という. Cayleyの[対称群の定義:定理 4]の証明で構成した準同型写像はこの左正則作用である.

また, $G$は$G$自身に$g.h:=hg^{-1}$によって左から作用する. この作用の置換表現$\rho\colon G\to \mathop{\mathrm{Sym}}(G)$は$\rho(g)\colon h\mapsto hg^{-1}$でありこれを右正則作用(right regular action)という.

左正則作用と右正則作用はともに正則な作用である.

例 6 (剰余群への作用). $G$を群, $H$をその部分群とする. $G$は剰余類$G/H$に

$$
\begin{align*} g.(xH):=(gx)H,\quad(g\in G, xH\in G/H) \end{align*}
$$

によって作用する. この作用はwell-definedである. つまり代表元$x$の取り方によらず定まる. 実際, $xH=yH$とすると$y^{-1}x\in H$であって

$$
\begin{align*} (gy)^{-1}(gx)=y^{-1}g^{-1}gx=y^{-1}x\in H \end{align*}
$$

なので$(gx)H=(gy)H$が成り立つ. この作用の置換表現$\rho\colon G\to \mathop{\mathrm{Sym}}(G/H)$は$\rho(g)\colon xH\mapsto (gx)H$である.

この作用は推移的であるが忠実な作用ではない.

この置換表現の核$\mathop{\mathrm{Ker}}\rho$を考える. $g\in \mathop{\mathrm{Ker}}\rho$であることは$\rho(g)$が恒等写像, すなわち任意の$x\in G$に対して$(gx)H=xH$が成り立つことなので

$$
\begin{align*} \mathop{\mathrm{Ker}}\rho=\bigcap_{x\in G}xHx^{-1}=H_G \end{align*}
$$

ここで$H_G$は$G$の正規核([正規核と正規閉包:定義 1])である. このことから$H_G$が$G$の正規部分群であることが分かる.

例 7 (対称群による作用). $X$を集合として対称群$\mathop{\mathrm{Sym}}(X)$は$X$に

$$
\begin{align*} f. x:=f(x),\quad (f\in \mathop{\mathrm{Sym}}(X),\,x\in X) \end{align*}
$$

によって作用する. この作用の置換表現$\rho\colon \mathop{\mathrm{Sym}}(X)\to \mathop{\mathrm{Sym}}(X)$は$\rho(f)\colon x\mapsto f(x)$である.

$|X|\geq 3$のとき, この作用は推移的かつ忠実な作用であるが自由な作用ではない.

例 8 (べき集合への作用). $G$が集合$X$に作用しているとする. このとき$X$の部分集合$Y\in 2^X$に対して

$$
\begin{align*} g.Y:=\{g.y\mid y\in Y\},\quad (g\in G) \end{align*}
$$

と表す. すると$G$の$2^X$への作用を$g.Y$で定めることができる. この作用の置換表現$\rho\colon G\to \mathop{\mathrm{Sym}}(2^X)$は$\rho(g)\colon Y\mapsto g.Y$である.

例 9 (行列群の作用). $GL(n,\mathbb{R})$を実数体上の$n$次正則行列全体の成す群とする. このとき$GL(n,\mathbb{R})$は$\mathbb{R}^n$に対して

$$
\begin{align*} A. \mathbf{x}:=A\mathbf{x},\quad (A\in GL(n,\mathbb{R}),\,\mathbf{x}\in \mathbb{R}^n) \end{align*}
$$

によって作用する. この作用の置換表現$\rho\colon GL(n,\mathbb{R})\to \mathop{\mathrm{Sym}}(\mathbb{R}^n)$は$\rho(A)\colon \mathbf{x}\mapsto A\mathbf{x}$である. このとき$\rho(A)$は線形写像である. このように線型空間への作用の置換表現のうち, 作用が線形写像として定まるものを線型表現(linear representation)という([群の線形表現:定義 1]).

この作用は忠実な作用である. 推移的, 自由な作用ではない. ただし原点を除いた$\mathbb{R}^n\setminus\{\mathbf{0}\}$への作用として考えると忠実な作用になる.
