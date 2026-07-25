---
articleId: ja-mathematics-directed-sets
locale: ja
title: 有向性
slug: directed-sets
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.directed-sets
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 順序集合のうち、特定のクラスの部分集合が必ず上界(下界)を持つことによって特徴づけられるものを考える。 …
difficulty: intermediate
estimatedMinutes: 15
tags:
  - 有向性
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

順序集合のうち、特定のクラスの部分集合が必ず上界(下界)を持つことによって特徴づけられるものを考える。

### 有向集合の定義

定義 1 (上有向集合・下有向集合). 前順序集合$P$の非空な有限部分集合全体の族$\mathcal{C}\subset \mathcal{P}(P)$について考える。

- 任意の$A\in\mathcal{C}$に対しその上界$u\in P$が存在するとき$P$を上有向集合あるいは単に有向集合という。

- 任意の$A\in\mathcal{C}$に対しその下界$d\in P$が存在するとき$P$を下有向集合という。

上の定義はより簡潔な条件と同値である。

命題 2. 前順序集合$P$の部分集合$A$について考える。

- $P$が上有向集合$\iff\forall x,y\in P,\;\exists z\in P\ (x\leq z \land y\leq z)$

- $P$が下有向集合$\iff\forall x,y\in P,\;\exists z\in P\ (z\leq x \land z\leq y)$

証明. $P$が上有向集合であると仮定する。任意に$x,y\in P$をとると$\{x,y\}$は$P$の有限部分集合であるから、仮定より$A$の上界$z\in P$が存在する。すなわち$x\leq z$かつ$y\leq z$である。

次に$\forall x,y\in P\;\exists z\in P\ (x\leq z \land y\leq z)$を仮定し、任意の有限部分集合$A\subseteq P$に対して$A$の上界が存在することを示す。 $A=\varnothing$なら、任意の$z\in P$は$\forall a\in A,\ a\leq z$を満たすので上界である。 $A\neq\varnothing$とし、$A=\{a_1,\dots,a_n\}$（$n\ge1$）と書く。 仮定を用いて帰納的に$z_1,\dots,z_n\in P$を次で定める： $z_1:=a_1$、および$k\ge2$に対し $a_k\le z_k$かつ$z_{k-1}\le z_k$を満たす$z_k\in P$を取る。 このとき各$k$について、$a_1,\dots,a_k\le z_k$が成り立つことを$k$についての帰納法で示せる。 よって$a_i\le z_n$（$i=1,\dots,n$）であり、$z_n$は$A$の上界である。以上より$P$は上有向集合である。

下有向集合についても同様にして示される。 ◻

定義 3 (有向部分集合). 前順序集合$P$に対し、その部分集合$A\subset P$が$P$の順序によって(上/下)有向集合となるとき、$A$を(上/下)有向部分集合という。

### イデアル・フィルター

定義 4 (イデアル・フィルター). 前順序集合$P$の部分集合$A$について考える。

- $A$が上有向部分集合かつ下方集合であるとき、これをイデアルという。

- $A$が下有向部分集合かつ上方集合であるとき、これをフィルターという。
