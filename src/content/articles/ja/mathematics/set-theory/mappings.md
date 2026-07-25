---
articleId: ja-mathematics-mappings
locale: ja
title: 写像
slug: mappings
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.mappings
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  写像の定義 定義 1 (写像の定義). 上の2項関係 であって、左全域的かつ右一意的であるもの、すなわち任意の の元に対して
  の元がただ1つ定められるものを から への写像という。これを や元の間の関係も含めて 、 などと表す。 …
difficulty: intermediate
estimatedMinutes: 35
tags:
  - 写像
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 写像の定義

定義 1 (写像の定義). $X,Y$上の2項関係$(X,Y,R_f)$であって、左全域的かつ右一意的であるもの、すなわち任意の$X$の元に対して$Y$の元がただ1つ定められるものを$X$から$Y$への写像という。これを$f:X\to Y$や元の間の関係も含めて$f:X\to Y;x\mapsto y$、$y=f(x)$などと表す。 $X$を始域、$Y$を終域といい、それぞれ$\mathop{\mathrm{dom}}(f),\mathop{\mathrm{codom}}(f)$などと表す。写像$(X,Y,R_f)$は有向二部グラフであるので、その意味でこれを写像のグラフともいう。

例 2 (恒等写像). $X$上の恒等関係は写像であり、これを特に恒等写像という。$\mathop{\mathrm{id}}_X$や$\mathop{\mathrm{id}}$などと表す。

例 3 (空写像). 始域が$\varnothing$であるような写像$f:\varnothing\to Y$はただ1つ存在する。これを空写像という。終域が$\varnothing$であるような写像$f:X\to\varnothing$は始域が$\varnothing$のときのみただ1つ存在する。

証明. 始域が$\varnothing$であるとき、$\varnothing\times Y=\varnothing$より、$\varnothing,Y$上に定まる関係は空関係のみである。これは左全域性と右一意性を満たす。よって空写像は一意に存在する。 終域が$\varnothing$であるとき、同様に$X,\varnothing$上に定まる関係は空関係のみであるが、$X\neq\varnothing$であったらこれは右一意性を持たない。$X=\varnothing$のときこれは空写像である。 ◻

定義 4 (制限写像). 写像$f:X\to Y$の始域$X$についての$A$への制限$f|_A$は写像となる。これを制限写像という。

定義 5 (多変数写像). 写像$f:X\to Y$について、$X=\prod_{i\in I} X_i,\ |I|>1$であるとき、これを多変数写像という。

### 写像の合成

定義 6 (写像の合成). 2つの写像$f:X\to\prod_{i\in I}Y_i;x\mapsto (y_i)_{i\in I},g:\prod_{j\in J}Y_j\to Z;(y_j)_{j\in J}\mapsto z$に対し、$K\subset I\cap J$についての関係としての合成$g\circ_K f$を特に写像の合成といい、これも写像となる。すなわち写像$f,g$の$K$についての合成は

$$
g\circ_K f:X\times\prod_{i^\prime\in I\setminus K}Y_{i^\prime}\to Z\times\prod_{j^\prime\in J\setminus K}Y_{j^\prime}:(x,(y_i^\prime)_{i^\prime\in I\setminus K})\mapsto (z,(y_j^\prime)_{j^\prime\in J\setminus K})
$$

である。$K=I=J$のときこれを単に$g\circ f$と書く。

### 単射・全射・全単射

定義 7 (単射・全射・全単射). 写像$f:X\to Y;x\mapsto y$について考える。

- 左一意的な写像、すなわち任意の$y\in Y$に対して$f(x)=y$なる$x\in X$が多くとも1つ存在するものを単射という。

- 右全域的な写像、すなわち任意の$y\in Y$に対して$f(x)=y$なる$x\in X$が少なくとも1つ存在するものを全射という。

- 単射かつ全射である写像、すなわち任意の$y\in Y$に対して$f(x)=y$なる$x\in X$がただ1つ存在するものを全単射あるいは一対一対応という。

定義 8 (左逆写像・右逆写像). 写像$f:X\to Y;x\mapsto y$について考える。

- $g\circ f=\mathop{\mathrm{id}}_X$なる$g$が存在するとき、これを$f$の左逆写像という。

- $f\circ g=\mathop{\mathrm{id}}_Y$なる$g$が存在するとき、これを$f$の右逆写像という。

命題 9.

- $f$の左逆写像が存在する$\iff$ $f$が単射である

- $f$の右逆写像が存在する$\iff$ $f$が全射である

証明. 左逆写像が存在するとき、$f(x_1)=f(x_2)$ならば両辺に左から$g$をかけることで$x_1=x_2$。すなわち任意の$y\in Y$に対して$f(x)=y$なる$x\in X$は高々1つ存在し、$f$は単射である。 逆に$f$が単射であるとき、$g$を$y\in f(X)$に対して$f(x)=y$なる$x$を用いて$g(y)=x$,$y\not\in f(X)$に対しては各$y$に対して任意の$x_0$を選んで$g(y)=x_0$とすれば、この$g$は$g\circ f=\mathop{\mathrm{id}}_X$を満たし、$f$は左逆写像を持つ。 右逆写像が存在するとき、任意の$y\in Y$に対し、$h(y)=x$の両辺に左から$f$をかけることで$y=f(x)$。すなわち任意の$y\in Y$に対して$f(x)=y$なる$x=h(y)\in X$が少なくとも1つ存在し、$f$は全射である。 逆に$f$が全射であるとき、$Y=\varnothing$の場合は$X=\varnothing$と$f$が空写像であることが従い、空写像$h:Y\to X$は$f\circ h=\mathop{\mathrm{id}}_Y$を満たすので、$f$は右逆写像を持つ。 また$Y\neq\varnothing$の場合は任意の$y\in Y$に対してその逆像$f^{-1}(y)$が存在して$\{f^{-1}(y)\}_{y\in Y}$は非空集合族となるので、選択公理によって各$y$に対して$f^{-1}(y)$から元を同時に1つ選ぶ選択関数$h(y)$が存在する。これは$f\circ h=\mathop{\mathrm{id}}_Y$を満たし、$f$は右逆写像を持つ。 ◻

定義 10 (逆写像). 写像$f$の逆関係が写像となるのは、$f$が全単射であるときまたその時に限る。このとき、逆関係$f^{-1}$を逆写像という。

証明. 関係と逆関係の一意性や全域性の左右は互いに逆なので、写像が左一意性と右全域性を持つこととその逆関係が左全域性と右一意性を持つことは同値である。 ◻

命題 11. 逆写像は左逆写像かつ右逆写像である。すなわち、

$$
f^{-1}\circ f=\mathop{\mathrm{id}_Y},\ f\circ f^{-1}=\mathop{\mathrm{id}_X}
$$

を満たす。

証明. 命題と命題より従う。 ◻

定義 12 (モノ射・エピ射). 写像$f:X\to Y;x\mapsto y$について考える。

-

$$
\forall A\,\forall g_1,g_2:A\to X\ (f\circ g_1=f\circ g_2\Longrightarrow g_1=g_2)
$$

が成り立つとき、$f$はモノ射であるという。

-

$$
\forall B\,\forall h_1,h_2:Y\to B\ (h_1\circ f=h_2\circ f\Longrightarrow h_1=h_2)
$$

が成り立つとき、$f$はエピ射であるという。

命題 13.

- $f$がモノ射である$\iff$ $f$が単射である

- $f$はエピ射である$\iff$ $f$が全射である

証明. $f$がモノ射であるとする。$f(x_1)=f(x_2)$ となる任意の $x_1, x_2 \in X$ をとり、写像 $g_1, g_2: \{ * \} \to X$ を$g_1(*) = x_1,\,g_2(*) = x_2$によって定義する。このとき、$(f \circ g_1)(*) = f(x_1)$ および $(f \circ g_2)(*) = f(x_2)$ である。仮定より $f(x_1) = f(x_2)$ であるから、$f \circ g_1 = f \circ g_2$ が成り立つ。$f$ はモノ射であるから $g_1 = g_2$ となり、よって $g_1(*) = g_2(*)$、すなわち $x_1 = x_2$ である。したがって $f$ は単射である。 $f$が単射であるとする。$f \circ g_1 = f \circ g_2$ を満たす任意の $g_1,g_2: A \to X$ を考える。任意の $a \in A$ に対して、

$$
f(g_1(a)) = (f \circ g_1)(a) = (f \circ g_2)(a) = f(g_2(a))
$$

が成り立つ。$f$ は単射であるから、$g_1(a) = g_2(a)$ である。これが全ての $a \in A$ で成り立つので、$g_1 = g_2$ 。したがって $f$ はモノ射である。 $f: X \to Y$ をエピ射とする。$h_1, h_2: Y \to \{0, 1\}$ を

$$
h_1(y) = 1\ (\forall y \in Y),\ h_2(y) = \begin{cases} 1 & (y \in \mathop{\mathrm{Im}}(f)) \\ 0 & (y \notin \mathop{\mathrm{Im}}(f)) \end{cases}
$$

によって定める。任意の $x \in X$ について $f(x) \in \mathop{\mathrm{Im}}(f)$ なので、 $h_1(f(x)) = 1 = h_2(f(x))$ すなわち $h_1 \circ f = h_2 \circ f$ が成り立つ。$f$ はエピ射なので、 $h_1 = h_2$ である。これより全ての $y \in Y$ について $h_2(y)=h_1(y)=1$であるので、$Y=\mathop{\mathrm{Im}}(f)$が導かれる。したがって $f$ は全射である。 $f$ を全射とし、$h_1 \circ f = h_2 \circ f$ を満たす任意の $h_1, h_2: Y \to B$ を考える。任意の $y \in Y$ に対して、$f$ が全射であることから $f(x) = y$ となる $x \in X$ が存在する。このとき、

$$
h_1(y) = h_1(f(x)) = (h_1 \circ f)(x) = (h_2 \circ f)(x) = h_2(f(x)) = h_2(y)
$$

が全ての$y\in Y$について成り立つので、$h_1 = h_2$ が導かれる。したがって $f$ はエピ射である。 ◻

### 写像の像・逆像・定義域・値域

定義 14 (写像の像・逆像). 写像$f:X\to Y,A\subset X,B\subset Y$に対して、その関係の像

$$
f(A)=\{f(x)\mid x\in A\}
$$

を特に写像$f$による$A$の像という。また、逆関係の像

$$
f^{-1}(B)={\{x\mid f(x)\in B\}}
$$

を特に写像$f$による$B$の逆像という。

定義 15 (写像の定義域・値域). 写像$f:X\to Y,A\subset X,B\subset Y$に対して、その関係の定義域 $\mathop{\mathrm{dom}}(f)=f^{-1}(Y)$ を特に写像$f$の定義域という。また、関係の値域 $\mathrm{range}(f)=f(X)$ を写像$f$の値域という。値域のことを写像$f$の像といって$\mathop{\mathrm{Im}}(f)$で表すこともある。

写像の定義より、写像の定義域は始域と一致するので、用語も記号も実用上区別する必要はない。

---

©2025 Atlasez
