---
articleId: ja-mathematics-subgroup-examples
locale: ja
title: 部分群の例
slug: subgroup-examples
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.subgroup-examples
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  例 1 (自明な部分群). 任意の群 に対して はともに の部分群である. これらを の自明な部分群という. 例 2 (特殊線形群, 直交群,
  特殊直交群). 体 上の 次特殊線形群(special linear gro…
difficulty: intermediate
estimatedMinutes: 15
tags:
  - 部分群の例
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

例 1 (自明な部分群). 任意の群$G$に対して$\{e\},G$はともに$G$の部分群である. これらを$G$の自明な部分群という.

例 2 (特殊線形群, 直交群, 特殊直交群). 体$\mathbb{K}$上の$n$次特殊線形群(special linear group)とは

$$
\begin{align*} \mathop{\mathrm{\mathit{SL}}}(n,\mathbb{K}):=\{A\in \mathop{\mathrm{\mathit{GL}}}(n,\mathbb{K})\mid \det A=1\} \end{align*}
$$

である. これは$\mathop{\mathrm{\mathit{GL}}}(n,\mathbb{K})$の部分群になる. また$n$次直交群(orthogonal group)および特殊直交群(special orthogonal group)はそれぞれ次のように定義される. 特に特殊直交群は回転群とも呼ばれる.

$$
\begin{align*} \mathop{\mathrm{\mathit{O}}}(n)&:=\{A\in \mathop{\mathrm{\mathit{GL}}}(n,\mathbb{R})\mid A^TA=AA^T=I\} \\ \mathop{\mathrm{\mathit{SO}}}(n)&:=\{A\in \mathop{\mathrm{\mathit{O}}}(n,\mathbb{R})\mid \det A=1\} \end{align*}
$$

例 3 (置換群). 集合$X$の対称群$\mathop{\mathrm{Sym}}(X)$の部分群は置換群(permutation group)という. 例えば集合$X$の部分集合$Y$が与えられたとき, その対称群$\mathop{\mathrm{Sym}}(Y)$は$\mathop{\mathrm{Sym}}(X)$の部分群である.

例 4 (交代群). $n$次対称群$S_n$に対し$S_n$の偶置換全体を$A_n$で表す. $A_n$は位数$n!/2$の$S_n$の部分群で, これを$n$次交代群(alternating group)という.

例 5 ($\mathbb{Z}$の部分群). 加法群$(\mathbb{Z},+)$部分群$H$は, ある$m\in\mathbb{Z}$を用いて$H=m\mathbb{Z}=\{mx\mid x\in\mathbb{Z}\}$と表される.

証明. $H$を$\mathbb{Z}$の部分群とする. $H=\{0\}$なら$H=0\mathbb{Z}$なので$H\neq \{0\}$としておく. $H$の元で正のもののうち最小のものが存在するのでそれを$m$をする. 任意の$n\in H$に対して$n$を$m$で割った余りを考えれば

$$
\begin{align*} n=mx+r,\quad(x,r\in\mathbb{Z},\,0\leq r<m) \end{align*}
$$

となる$x,r$が存在する. すると$n,m\in H$より$r=n-mx\in H$であるが, 条件$0\leq r<m$と$m$の最小性よりこれを満たす$r$は$r=0$に限られる. 以上より任意の$n\in H$に対してある$x\in \mathbb{Z}$を用いて$n=mx$と書けることが分かったので$H=m\mathbb{Z}$. ◻

例 6 ($\mathbb{C}^{\times}$の部分群). 乗法群$\mathbb{C}^{\times}$([群の例:例 7])の部分群を考える. 複素平面上の単位円

$$
\begin{align*} S^1:=\{\zeta\in\mathbb{C}^{\times}\mid |\zeta|=1\} \end{align*}
$$

について, $1\in S^1$であり, $\zeta,\eta\in S^1$とすると$|\zeta\eta^{-1}|=|\zeta||\eta|^{-1}=1$なので, [部分群の定義:命題 5]より$\mathbb{C}^{\times}$の部分群である.

さらに1の$n$乗根全体の集合を$C_n:=\{\zeta\in S^1\mid \zeta^n=1\}$とすると$C_n$は$S^1$の部分群となる. 実際$1\in C_n$であり, $\zeta,\eta\in C_n$とすると

$$
\begin{align*} (\zeta\eta^{-1})^n=\zeta^n\eta^{-n}=1,\quad (\zeta^{-1})^n \end{align*}
$$

なので[部分群の定義:命題 5]より$C_n$は$S^1$の部分群であることが分かる. $\zeta_n:=\exp\frac{2\pi i}{n}$とすると

$$
\begin{align*} C_n=\{1,\zeta_n,\zeta_n^2,\ldots,\zeta_n^{n-1}\} \end{align*}
$$

と表され, $C_n$は位数$n$の有限群であることが分かる.
