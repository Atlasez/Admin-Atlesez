---
articleId: ja-mathematics-quotient-groups
locale: ja
title: 剰余群の定義と部分群の対応
slug: quotient-groups
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.quotient-groups
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  剰余群の定義 定義 1 (剰余群). を群, をその正規部分群とする. このとき剰余集合 上の演算を に対して
  で定めることができる(well-defined). この演算による群 を の による剰余群(quotient…
difficulty: intermediate
estimatedMinutes: 20
tags:
  - 剰余群の定義と部分群の対応
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 剰余群の定義

定義 1 (剰余群). $G$を群, $N$をその正規部分群とする. このとき剰余集合$G/N$上の演算を$g_1N,g_2N\in G/N$に対して

$$
\begin{align*} (g_1N)\cdot(g_2N):=(g_1g_2)N \end{align*}
$$

で定めることができる(well-defined). この演算による群$G/N$を$G$の$N$による剰余群(quotient group)という.

$g_1N=g_1'N$かつ$g_2N=g_2'N$とする. すると$g_1'^{-1}g_1\in N$かつ$g_2'^{-1}g_2\in N$となる. このとき

$$
\begin{align*} (g_1'g_2')^{-1}g_1g_2 &= g_2'^{-1}g_1'^{-1}g_1g_2 \\ &= g_2^{-1}(g_2g_2'^{-1})(g_1'^{-1}g_1)g_2 \end{align*}
$$

であって$(g_2g_2'^{-1})(g_1'^{-1}g_1)\in N$と$N$は$G$の正規部分群であることより$(g_1'g_2')^{-1}g_1g_2\in N$つまり$g_1g_2N=g_1'g_2'N$. よって演算が代表元によらずに定まることが示された.

剰余群$G/N$の単位元は$e_GN=N$, $gN$の逆元は$g^{-1}N$である. また群$G/N$の位数は, 指数$(G:N)$に等しい.

$N$が正規部分群のときに$G/N$に自然な演算が定まり群となることを見たが, 逆は成り立つだろうか. つまり$G/H$に自然な演算が定まり群となるとき, $H$は必ず正規部分群であるだろうか.

命題 2 (剰余群が定まる必要条件). $G$を群, $H$をその部分群とする. 左剰余集合$G/H$に演算

$$
\begin{align*} (g_1H)\cdot(g_2H)=(g_1g_2)H \end{align*}
$$

がwell-definedに定まるとき$H$は$G$の正規部分群である.

証明. $g\in G$に対する逆元$g^{-1}\in G$に関して

$$
\begin{align*} (gH)\cdot(g^{-1}H)=e_GH=H \end{align*}
$$

となる. ここで任意の$h\in H$をとると$(gh)H=gH$が成り立つ. 演算のwell-defined性より

$$
\begin{align*} H &= (gH)\cdot(g^{-1}H) \\ &=((gh)H)\cdot(g^{-1}H) \\ &=(ghg^{-1})H \end{align*}
$$

よって任意の$g\in G,h\in H$に対して$ghg^{-1}\in H$が成り立つので$H$は正規部分群である. ◻

### 自然な射影

命題 3 (自然な射影は全射準同型写像). $G$を群, $N$をその正規部分群とする. このとき自然な射影

$$
\begin{align*} \pi\colon G\longrightarrow G/N,\quad g\longmapsto gN \end{align*}
$$

は全射準同型写像である. 特に$\mathop{\mathrm{Ker}}\pi =N$である.

証明. 任意の$g_1,g_2\in G$に対して

$$
\begin{align*} \pi(g_1g_2)=(g_1g_2)N=(g_1N)(g_2N)=\pi(g_1)\pi(g_2) \end{align*}
$$

であるから$\pi$は準同型写像である. また任意の$gN\in G/N$に対して$\pi(g)=gN$であるから$\pi$は全射である.

自然な射影の核について

$$
\begin{align*} \mathop{\mathrm{Ker}}\pi &= \{g\in G\mid gN=N\} \\ &= \{g\in G\mid g\in N\} \\ &= N \end{align*}
$$

である. ◻

### 部分群の対応定理

定理 4 (部分群の対応定理). $G$を群, $N$をその正規部分群とする. また, $\pi\colon G\to G/N$を自然な射影とする. $G/N$の部分群全体を$\mathbb{X}$, $G$の$N$を含む部分群全体を$\mathbb{Y}$とするとき二つの写像

$$
\begin{align*} \varphi&\colon \mathbb{X}\to \mathbb{Y},\quad H\longmapsto \pi^{-1}(H) \\ \psi&\colon \mathbb{Y}\to \mathbb{X},\quad K\longmapsto \pi(K)=K/N \end{align*}
$$

は互いに逆写像である.

証明. 準同型写像$\pi$による像と逆像は部分群になる([準同型写像の像と核:命題 1]). 特に$H\in \mathbb{X}$に対して$\varphi(H)=\pi^{-1}(H)\in \mathbb{Y}$, すなわち$\pi^{-1}(H)$が$N$を含むことを示す. 任意の$n\in N$に対して$\pi(n)=nN=e_{G/N}\in H$であるから$n\in \pi^{-1}(H)$である. よって$N\subset \pi^{-1}(H)$である.

次に$\varphi$と$\psi$が互いに逆写像であることを示す. $H\in \mathbb{X}$に対して

$$
\begin{align*} \psi(\varphi(H))=\psi(\pi^{-1}(H))=\pi(\pi^{-1}(H)) \end{align*}
$$

である. 特に$\pi$は全射であったから$\pi(\pi^{-1}(H))=H$である.

また$K\in \mathbb{Y}$に対して

$$
\begin{align*} \varphi(\psi(K))=\varphi(\pi(K))=\pi^{-1}(\pi(K)) \end{align*}
$$

である. 一般に$K \subseteq \pi^{-1}(\pi(K))$が成り立つ. 逆に$x\in \pi^{-1}(\pi(K))$をとると, $\pi(x)\in \pi(K)$であるから, ある$k\in K$に対して$\pi(x)=\pi(k)$となる. よって$k^{-1}x\in N$である. ここで$N\subset K$であるから$k^{-1}x\in K$であり, $x=k(k^{-1}x)\in K$となる. 以上より$\pi^{-1}(\pi(K))=K$である. ◻

さらに部分群の対応定理における対応は包含関係や正規性を保つ. つまり次のことが成り立つ.

命題 5 (部分群の対応における包含関係の保存). $G$を群, $N$をその正規部分群とする. また, $H_1,H_2$を$G$の部分群で$N$を含むものとする. このとき

$$
\begin{align*} H_1\subset H_2\iff H_1/N\subset H_2/N \end{align*}
$$

証明. $H_1\subset H_2$ならば, 任意の$h_1N\in H_1/N$に対して$h_1\in H_2$であるから$h_1N\in H_2/N$であり, $H_1/N\subset H_2/N$である.

逆に$H_1/N\subset H_2/N$ならば, 任意の$h_1\in H_1$に対して$h_1N\in H_1/N\subset H_2/N$である. すなわちある$h_2\in H_2$に対して$h_1N=h_2N$となる. よって$h_2^{-1}h_1\in N\subset H_2$であるから$h_1=h_2(h_2^{-1}h_1)\in H_2$であり, $H_1\subset H_2$である. ◻

命題 6 (部分群の対応における正規性の保存). $G$を群, $N$をその正規部分群とする. また, $H$を$G$の部分群で$N$を含むものとする. このとき

$$
\begin{align*} H\vartriangleleft G\iff H/N\vartriangleleft G/N \end{align*}
$$

証明. $\pi\colon G\to G/N$を自然な射影とする. $H\vartriangleleft G$とする. $H/N=\pi(H)$は$\pi$が全射であるので, [準同型写像の像と核:命題 1]より$H/N$は$G/N$の正規部分群である.

$H/N\vartriangleleft G/N$とする. $H=\pi^{-1}(H/N)$について, 逆像は正規性を保つ([準同型写像の像と核:命題 1])ことより$H$は$G$の正規部分群である. ◻
