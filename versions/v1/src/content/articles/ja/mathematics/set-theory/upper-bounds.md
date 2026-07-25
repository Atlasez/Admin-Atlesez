---
articleId: ja-mathematics-upper-bounds
locale: ja
title: 上界集合
slug: upper-bounds
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.upper-bounds
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 前順序集合の部分集合から定まる上方集合の一つとして上界集合を定義し、関連する概念やそれらの性質について概観する。 …
difficulty: intermediate
estimatedMinutes: 20
tags:
  - 上界集合
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

前順序集合の部分集合から定まる上方集合の一つとして上界集合を定義し、関連する概念やそれらの性質について概観する。

### 上界集合の定義

定義 1 (上界集合・下界集合). 前順序集合$P$の部分集合$A$について考える。

-

$$
\{x\in P \mid \forall a\in A\ a\leq x\}
$$

を上界集合という。$x\in P$が$A\subset P$の上界集合の元であるとき、$x$は$A$の上界(upper bound)であるという。

-

$$
\{x\in P \mid \forall a\in A\ x\leq a\}
$$

を下界集合という。$x\in P$が$A\subset P$の下界集合の元であるとき、$x$は$A$の下界(lower bound)であるという。

命題 2. $A$の上界集合は$A$の各元の主上方集合の共通部分に等しい。

$$
\{x\in P \mid \forall a\in A\ a\leq x\}=\bigcap_{a\in A}\uparrow a
$$

また$A$の下界集合は$A$の各元の主下方集合の共通部分に等しい。

$$
\{x\in P \mid \forall a\in A\ x\leq a\}=\bigcap_{a\in A}\downarrow a
$$

証明. 任意に$y\in \{x\in P \mid \forall a\in A\ (a\le x)\}$をとる。このとき定義より$\forall a\in A$について、$a\le y$すなわち $y\in{\uparrow a}$が成り立つ。よって$y\in\bigcap_{a\in A}{\uparrow a}$であり、$\{x\in P \mid \forall a\in A\ (a\le x)\}\subset\bigcap_{a\in A}{\uparrow a}$が従う。 任意に$z\in \bigcap_{a\in A}{\uparrow a}$をとる。このとき任意の$a\in A$について$z\in\uparrow a$、すなわち定義より$\forall a\in A$について$a\le z$が成り立つ。よって$z\in \{x\in P \mid \forall a\in A\ (a\le x)\}$であり、$\bigcap_{a\in A}{\uparrow a}\subset\{x\in P \mid \forall a\in A\ (a\le x)\}$が従う。 以上より$\{x\in P \mid \forall a\in A\ a\leq x\}=\bigcap_{a\in A}\uparrow a$が導かれる。下界集合については、逆順序について上の証明を適用することで同様に導かれる。 ◻

### 有界性

定義 3 (有界・非有界). 前順序集合$P$の部分集合$A$の上界が存在するとき、$A$は上に有界であるという。$A$の下界が存在するとき、$A$は下に有界であるという。上に有界かつ下に有界であるとき、単に有界であるとか$A$を有界集合という。有界でないことを非有界であるという。

### 最大元・最小元

定義 4 (最大元・最小元). 前順序集合$P$の部分集合$A$について考える。

- $A$の元かつ$A$の上界集合の元であるような元、すなわち

$$
\forall x\in A,\; x\leq a
$$

が成り立つ$a\in A$を$A$の最大元(maximum element)といい、$\max A$で表す。

- $A$の元かつ$A$の下界集合の元であるような元、すなわち

$$
\forall x\in A,\; a\leq x
$$

が成り立つ$a\in A$を$A$の最小元(minimum element)といい、$\min A$で表す。

命題 5. 前順序集合$P$の部分集合$A$に対して、最大元や最小元は存在すれば$x\sim y\iff (x\leq y \land y\leq x)$で定まる同値を除いて一意に定まる。

証明. $m,n\in A$ がともに $A$ の最大元であると仮定する．$n\in A$ であるから，最大元 $m$ の定義より$n \le m$が成り立つ．同様に $m\in A$ であるから，最大元 $n$ の定義より$m \le n$が成り立つ．したがって$m \le n \land n \le m$であり，$m\sim n$が従う．最小元についても同様にして示される。 ◻

### 上限・下限

定義 6 (上限・下限). 前順序集合$P$の部分集合$A$について考える。

- $A$の上界集合の最小元を$A$の上限(supremum)あるいは最小上界(least upper bound)といい、$\sup A$で表す。

- $A$の上界集合の最大元を$A$の下限(infimum)あるいは最大下界(greatest lower bound)といい、$\inf A$で表す。

命題 7. 前順序集合$P$の部分集合$A$に対して、上限や下限は存在すれば$x\sim y\iff (x\leq y \land y\leq x)$で定まる同値を除いて一意に定まる。特に、$A$の最大元や最小元が存在するとき、これらがそれぞれ$A$の上限や下限となる。

証明. 上限と下限の一意性はそれぞれ最小元と最大元の一意性から従う。 $m\in A$ が $A$ の最大元であるとする．最大元の定義より、任意の $a\in A$ に対して $a\le m$ が成り立つので、$m$ は $A$ の上界である．$u\in P$ を $A$ の任意の上界とすると、$m\in A$ であるから，上界の定義より $m\le u$ が成り立つ．よって任意の上界 $u$ に対して $m\le u$ が成り立つので，$m$ は $A$ の最小上界すなわち上限である．最小元は下限であることも同様にして示される。 ◻

---

©2025 Atlasez
