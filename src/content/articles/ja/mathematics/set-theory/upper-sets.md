---
articleId: ja-mathematics-upper-sets
locale: ja
title: 上方集合
slug: upper-sets
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.upper-sets
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary: 順序集合の部分構造として上方集合を定義し、関連する概念やそれらの性質について概観する。 …
difficulty: intermediate
estimatedMinutes: 25
tags:
  - 上方集合
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

順序集合の部分構造として上方集合を定義し、関連する概念やそれらの性質について概観する。

### 上方集合の定義

定義 1 (上方集合・下方集合). 前順序集合$(P,\leq)$について考える。

- $\leq$の始域についての部分集合 $U\subset P$への制限$\leq|_U$が$U$上の順序集合となるとき、すなわち

$$
\forall x,y\in P,\quad x\in U \land x\le y \Rightarrow y\in U
$$

が成り立つとき、上方集合（upper set）であるという。

- $\leq$の終域についての部分集合 $D\subset P$への制限$\leq|_D$が$D$上の順序集合となるとき、すなわち

$$
\forall x,y\in P,\quad x\in D \land y\le x \Rightarrow y\in D
$$

が成り立つとき、下方集合（lower set）であるという。定義から下方集合は双対順序集合における上方集合である。

例 2. 前順序集合$P$に対し、$P$と$\varnothing$は上方集合かつ下方集合である。

命題 3. 上方集合の補集合$U^c=P\setminus U$は下方集合であり、下方集合の補集合$D^c=P\setminus D$は上方集合である。

証明. 背理法で示す。$y \in U^c$ と $x \le y$ をとる。 $x \in U$ と仮定すると、$U$ は上方集合であるため、$x \le y$ より $y \in U$ となり、$y \in U^c$ に矛盾する。したがって $x \notin U$、すなわち $x \in U^c$ である。よって定義から、$U^c$ は下方集合である。後半部分は下方集合は双対順序集合における上方集合であることから従う。 ◻

命題 4. 前順序集合$P$の上方集合の族$\{U_i\}_{i\in I}$に対し、その共通部分$\bigcap_{i\in I}U_i$と和$\bigcup_{i\in I}U_i$は$P$の上方集合である。下方集合の族の共通部分と和は下方集合である。

証明. $x\in \bigcap_{i\in I}U_i$ と $x\le y$ をとる。このとき任意の $i\in I$ について $x\in U_i$ であり， 各 $U_i$ は上方集合なので $y\in U_i$ が従う。よって $y\in\bigcap_{i\in I}U_i$。 したがって $\bigcap_{i\in I}U_i$ は上方集合である。 $x\in \bigcup_{i\in I}U_i$ と $x\le y$ をとる。このときある $j\in I$ が存在して $x\in U_j$。 $U_j$ は上方集合なので $y\in U_j\subset\bigcup_{i\in I}U_i$。 よって $\bigcup_{i\in I}U_i$ は上方集合である。 下方集合についても下方集合は双対順序集合における上方集合であることから従う。 ◻

### 上方閉包

定義 5 (上方閉包・下方閉包). 前順序集合$P$の部分集合$A$について考える。

- $A$を含む最小の上方集合を$A$の上方閉包や$A$により生成される上方集合といい、$\uparrow A$などと表す。

- $A$を含む最小の下方集合を$A$の下方閉包や$A$により生成される下方集合といい、$\downarrow A$などと表す。

定義 6 (主上方集合・主下方集合). 単元集合$\{x\}\in P$によって生成される上方集合と下方集合をそれぞれ特に主上方集合・主下方集合といい、それぞれ$\uparrow x$、$\downarrow x$などと表す。

命題 7 (上方閉包・下方閉包のwell-defined性). 任意の$A\subset P$に対して、$A$を含む最小の上方集合と下方集合は存在して、それぞれ

$$
\bigcup_{x\in A}\uparrow x,\quad \bigcup_{x\in A}\downarrow x
$$

で与えられる。 ここで$x$の主上方集合と主下方集合はそれぞれ

$$
\{y\in P\mid x\leq y\},\quad \{y\in P\mid y\leq x\}
$$

で与えられる。

証明. まず主上方集合の定義より、$x\in {\uparrow x}$なので、$A\subset\bigcup_{x\in A}\uparrow x$である。また$\uparrow x$は上方集合であり、上方集合の和集合は上方集合であるので、$\bigcup_{x\in A}\uparrow x$は上方集合である。定義より$\uparrow A$は$A$を含む最小の上方集合であるので、$\uparrow A\subset\bigcup_{x\in A}\uparrow x$となる。 また、定義より$A\subset{\uparrow A}$であるので、任意の$x\in A$に対して$x\in{\uparrow A}$である。$\uparrow A$は上方集合なので、$\uparrow x$の最小性から$\uparrow x\subset{\uparrow A}$となる。これが任意の$x\in A$に対して成り立つことから、その和集合も$\uparrow A$に含まれる、すなわち$\bigcup_{x\in A}\uparrow x\subset{\uparrow A}$が従う。 以上より、$\uparrow A=\bigcup_{x\in A}\uparrow x$が導かれる。 最後に、主上方集合が$\{y\in P\mid x\leq y\}$によって与えられることを示す。まず、反射律$x \le x$ より、$x \in \{y\in P\mid x\leq y\}$ である。そして$z \in \{y\in P\mid x\leq y\}$ かつ $z \le w$ とすると、定義より $x \le z$ であり、推移律より $x \le w$ となる。よって $w \in \{y\in P\mid x\leq y\}$ が従い、$\{y\in P\mid x\leq y\}$は$x$を含む上方集合である。 任意の$x$を含む上方集合$U$をとる。定義より$x \in U$ かつ $x \le y$ ならば $y \in U$ であるので、$\{y\in P\mid x\leq y\}$ のすべての要素は $U$ に属する、すなわち$\{y\in P\mid x\leq y\} \subseteq U$ が従う。これが任意の$U$に対して成り立つので、$\{y\in P\mid x\leq y\}$は$x$を含む最小の上方集合であること、すなわち$\uparrow x=\{y\in P\mid x\leq y\}$が導かれる。 ◻

定義 8 (共終部分集合・共始部分集合). 前順序集合$P$の部分集合$A$について考える。

- $A$の上方閉包が$P$と一致する、すなわち$P=\uparrow A$が成り立つとき、これを共終部分集合という。

- $A$の下方閉包が$P$と一致する、すなわち$P=\downarrow A$が成り立つとき、これを共始部分集合という。

例 9. 通常の順序を入れた整数全体$\mathbb{Z}$に対し、偶数全体$2\mathbb{Z}$は共終部分集合かつ共始部分集合である。

---

©2025 Atlasez
