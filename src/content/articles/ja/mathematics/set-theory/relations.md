---
articleId: ja-mathematics-relations
locale: ja
title: 関係
slug: relations
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.relations
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  関係の定義 定義 1 (関係). 集合族 に対して、これらの直積集合の部分集合 を考える. このとき, 組 を
  上の関係(relation)という. 特に が濃度 の有限集合であるとき、 項関係( -ary relati…
difficulty: intermediate
estimatedMinutes: 30
tags:
  - 関係
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 関係の定義

定義 1 (関係). 集合族$\{X_i\}_{i\in I}$に対して、これらの直積集合の部分集合

$$
\begin{align*} R\subset \prod_{i\in I}X_i \end{align*}
$$

を考える. このとき, 組$(\{X_i\}_{i\in I},R)$を$\{X_i\}_{i\in I}$上の関係(relation)という. 特に$I$が濃度$n$の有限集合であるとき、$n$項関係($n$-ary relation), $n=1$の場合は単項関係という. また$\forall i\in I\ X_i=X$の場合は$X$上の関係といい, 特に$X$上の2項関係は自己関係(endrelation)ともいう.

$(x_i)_{i\in I}\in R$を満たすとき, $(x_i)_{i\in I}$は関係$R$を持つといい, これを$R(x_i)_{i\in I}$と表す。特に$I$が有限集合のとき$Rx_1x_2\ldots x_n$、2項関係は$x_1Rx_2$などとも表す.

$\{X_i\}_{i\in I}$上の関係であることが文脈上明らかで誤解が生じない場合は, 集合族を明示せずに単に関係$R$と言うこともある.

例 2 (空関係). $(\{X_i\}_{i\in I},\varnothing)$は定義より$\{X_i\}_{i\in I}$上の関係となる。これを空関係という。

例 3 (全体関係). $(\{X_i\}_{i\in I},\{X_i\}_{i\in I})$は定義より$\{X_i\}_{i\in I}$上の関係となる。これを全体関係という。

例 4 (0項関係). $|I|=0$のとき$\prod_{i\in I}X_i=\{*\}\ (\{*\}は1点集合)$となるので、$0$項関係は$\varnothing$または$\{*\}$の2つのみである。

例 5 (1項関係). $A\subset X$に対し、$(X,A)$は$X$上の$1$項関係である。

### 関係の和集合・共通部分

定義 6 (関係の和集合・共通部分). 2つの$\{X_i\}_{i\in I}$上の関係$R,S$に対し, これらの和集合$R\cup S$, 共通部分$R\cap S$も$\{X_i\}_{i\in I}$上の関係である.

証明. $R,S\subset \prod_{i\in I}X_i$なので、部分集合の性質より$R\cup S\subset \prod_{i\in I}X_i,\ R\cap S\subset \prod_{i\in I}X_i$。よって関係の定義より、$R\cup S,\,R\cap S$は$\{X_i\}_{i\in I}$上の関係である. ◻

### 関係の射影・拡張

定義 7 (関係の射影). $\{X_i\}_{i\in I}$上の関係$R$と$J\subset I$に対し、

$$
\pi_{I,J}:\prod_{i\in I}X_i\to \prod_{j\in J}X_j;x\mapsto x|_J
$$

を$\prod_{j\in J}X_j$への射影といい、$\pi_{I,J}(R)$を関係$R$の$\prod_{j\in J}X_j$への射影などという。

定義 8 (関係の拡張). $\{X_j\}_{j\in J}$上の関係$R^\prime$と$J\subset I$に対し、射影の逆関係$\pi_{I,J}^{-1}$を$\prod_{i\in I}X_i$への拡張といい、

$$
\pi^{-1}_{I,J}(R^\prime)=\{x\in \prod_{i\in I}X_i\mid x|_J\in R^\prime\}
$$

を関係$R^\prime$の$\prod_{i\in I}X_i$への拡張などという。

### 関係の合成

定義 9 (関係の合成). $\{X_i\}_{i\in I}$上の関係$R$と$\{X_j\}_{j\in J}$上の関係$S$に対し、$K\subset I\cap J$をとる。それぞれの$\prod_{l\in I\cup J}X_l$への拡張の共通部分の$\prod_{h\in (I\cup J)\setminus K}X_h$への射影

$$
\pi_{I\cup J,(I\cup J)\setminus K}\left(\pi^{-1}_{I\cup J,I}(R)\cap \pi^{-1}_{I\cup J,J}(S)\right)
$$

は、$\{X_h\}_{h\in (I\cup J)\setminus K}$上の関係となる. これを関係$R$と$S$の$\{X_k\}_{k\in K}$についての合成といい,$S\circ_{\{X_k\}_{k\in K}} R$や$R;_{\{X_k\}_{k\in K}}S$、あるいは簡単に$S\circ_K R$や$R;_K S$などと表す.

$K$が文脈上明らかで誤解が生じない場合は, 単に関係$S\circ R$や$R;S$と書くこともある.

定義 10 (関係の制限). $\{X_i\}_{i\in I}$上の関係$R$と$X_{i^\prime}\ (i^\prime\in I)$上の1項関係$(X_{i^\prime},A)$の$i^\prime$についての合成を関係の制限といい、$R|_A$などと表す。

### 2項関係の性質

定義 11 (始域と終域). $X,Y$上の2項関係$(X,Y,R)$に対し,$X$を始域、$Y$を終域という。それぞれ$\mathop{\mathrm{dom}}(R),\mathop{\mathrm{codom}}(R)$で表す。

定義 12 (逆関係). $X,Y$上の2項関係$(X,Y,R)$に対し,$R^{-1}:=\{(y,x)\in Y\times X\mid (x,y)\in R\}$を定める.すると$(Y,X,R^{-1})$は$Y,X$上の2項関係であり,これを$R$の逆関係という.定義より、$(R^{-1})^{-1}=R$である。

定義 13 (像と逆像). $X,Y$上の2項関係$(X,Y,R)$と$A\subset X$に対し,

$$
R(A)=\{y\in Y\mid \exists x\in A\ xRy\}
$$

を関係$R$による$A$の像という。$B\subset Y$に対し,逆関係$R^{-1}$の像

$$
R^{-1}(B)=\{x\in X\mid \exists y\in B\ xRy\}
$$

を関係$R$による$B$の逆像という。

定義 14 (定義域と値域). $X,Y$上の2項関係$(X,Y,R)$に対し,終域の逆像$R^{-1}(Y)$を関係$R$の定義域、始域の像$R(X)$を関係$R$の値域という。それぞれ$\mathop{\mathrm{dom}}(R),\mathop{\mathrm{range}}(R)$で表す。値域のことを関係$R$の像といって$\mathop{\mathrm{Im}}(R)$で表すこともある。

定義域の記号は始域の記号と同じなので、これらが一致せずまた文脈上明らかでないときは明示的に区別する必要がある。

定義 15 (一意性). $X,Y$上の2項関係$(X,Y,R)$に対し,

- $R^{-1}\circ R\subset R^0_X$すなわち$\forall x_1,x_2\in X,\ y\in Y\ (x_1Ryかつx_2Ry\Longrightarrow x_1=x_2)$が成り立つとき, 関係$R$は左一意的あるいは単射であるという.

- $R\circ R^{-1}\subset R^0_Y$すなわち$\forall x\in X,\ y_1,y_2\in Y\ (xRy_1かつxRy_2\Longrightarrow y_1=y_2)$が成り立つとき, 関係$R$は右一意的あるいは関数的であるという.

- 関係$R$が左一意的かつ右一意的であるとき, 一対一であるという.

定義 16 (全域性).

- 定義域が始域と一致する、すなわち$\forall x\in X\exists y\in Y,\ xRy$が成り立つとき, 関係$R$は左全域的であるという.

- 値域が終域と一致する、すなわち$\forall y\in Y,\ \exists x\in X\ xRy$が成り立つとき, 関係$R$は右全域的あるいは全射であるという.

- 関係$R$が左全域的かつ右全域的であるとき, 対応であるという.

### 自己関係の性質

定義 17 (自己関係). 2項関係のうち始域と終域が等しいもの$(X,X,R)$を$X$上の自己関係という。

例 18. $X$の対角集合$\{(x,x)\mid x\in X\}$は$X$上の自己関係となる。これを恒等関係といい、$R^0_X$や単に$R^0$などと表す。

定義 19 (自己関係の合成). $X$上の自己関係$R,S$の合成は、特に断らない限り$R$の終域と$S$の始域についてのものとし、これを単に$S\circ R$と表す。合成の位置をこのように固定することで、逆関係を用いれば$R,S$の非自明な合成を全て表現することができる。

定義 20 (自己関係の冪). 自己関係の冪を以下のように恒等関係と自己関係の合成を用いて定める.

$$
\begin{align*} \begin{cases} R^0 = \{ (x, x) \mid x \in X \} \\ R^{n+1} = R \circ R^n \quad (n \ge 0) \end{cases} \end{align*}
$$

定義 21 (反射性).

- $R^0\subset R$すなわち$\forall x\in X \ xRx$が成り立つとき, 関係$R$は反射的であるという.

- $R^0\cap R=\varnothing$すなわち$\forall x\in X \ \lnot(xRx)$が成り立つとき, 関係$R$は非反射的であるという.

- $R^0\supset R$すなわち$\forall x,y\in X \ (xRy\Longrightarrow x=y)$が成り立つとき, 関係$R$は余反射的であるという.

定義 22 (推移性).

- $R\subset R^2$すなわち$\forall x,y,z\in X \ (xRy\land yRz\Longrightarrow xRz)$が成り立つとき, 関係$R$は推移的であるという.

- $R\not\subset R^2$すなわち$\exists x, y, z \in X \ (xRy \land yRz \land \neg xRz)$が成り立つとき, 関係$R$は非推移的であるという.

- $R\cap R^2=\varnothing$すなわち$\forall x, y, z \in X \ (xRy \land yRz \implies \neg xRz)$が成り立つとき, 関係$R$は反推移的であるという.

定義 23 (対称性).

- $R^{-1}=R$すなわち$\forall x,y \in X,\ (xRy \implies yRx)$が成り立つとき, 関係$R$は対称的であるという.

- $R\cap R^{-1}=\varnothing$すなわち$\forall x,y \in X,\ (xRy \implies \neg(yRx))$が成り立つとき, 関係$R$は非対称的であるという.

- $R\cap R^{-1}\subset R^0$すなわち$\forall x, y \in X,\ ((xRy \land yRx) \implies x = y)$が成り立つとき, 関係$R$は反対称的であるという.
