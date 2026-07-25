---
articleId: ja-mathematics-homomorphisms
locale: ja
title: 準同型写像の定義
slug: homomorphisms
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.homomorphisms
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  準同型写像の定義 定義 1 (準同型写像). を群とする. 写像 が次の条件を満たすとき から
  への準同型写像(homomorphism)という. - - . - . 特に群 から 自身への準同型写像は の自己準同型写像…
difficulty: intermediate
estimatedMinutes: 40
tags:
  - 準同型写像の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 準同型写像の定義

定義 1 (準同型写像). $(G_1,\circ_1,e_1,{}^{(-1)_{G_1}}),(G_2,\circ_2,e_2,{}^{(-1)_{G_2}})$を群とする. 写像$\varphi\colon G_1\to G_2$が次の条件を満たすとき$G_1$から$G_2$への準同型写像(homomorphism)という.

- $\forall x,y\in G_1,\,\varphi(x\circ_1 y)=\varphi(x)\circ_2\varphi(y)$

- $\varphi(e_1)=e_2$.

- $\forall x\in G_1,\, \varphi(x^{(-1)_{G_1}})=\varphi(x)^{(-1)_{G_2}}$.

特に群$G$から$G$自身への準同型写像は$G$の自己準同型写像(endomorphism)という. $G_1$から$G_2$への準同型写像全体の集合を$\mathop{\mathrm{Hom}}(G_1,G_2)$, $G$の自己準同型写像全体の集合を$\mathop{\mathrm{End}}(G)$で表す.

上の定義では演算を区別するために$\circ_1,\circ_2$と異なる記号を用いたが, 準同型の始域と終域に従えば誤解のおそれはないので, 基本的に演算は省略する. また, 単に準同型写像$\varphi\colon G_1\to G_2$と書いたとき, 特に断らなくとも$G_1$, $G_2$は群である.

例 2 (恒等写像は準同型). 群$G$の恒等写像$\mathrm{id}_G\colon G\to G$は準同型写像である.

### 準同型写像であることの同値な条件

$\varphi$が準同型写像であるとは, 定義に従えば群の構造(1)積(2)単位元(3)逆元を全て保つことである. ここで群の性質を用いればより簡潔な条件へと省くことができる.

命題 3 (準同型写像であることの同値な条件). 写像$\varphi\colon G_1\to G_2$が準同型写像であることは以下の条件が成り立つことと同値である.

$$
\begin{align*} \forall x,y\in G_1,\quad\varphi(xy)=\varphi(x)\varphi(y) \end{align*}
$$

証明. [準同型写像の定義:定義 1]の下で[準同型写像の定義:命題 3]が成り立つことは定義から従う. よって[準同型写像の定義:命題 3]が成り立つとき[準同型写像の定義:定義 1]の2. 3. が成り立つことを示せばよい. まず単位元に関して

$$
\begin{align*} \varphi(e_1)=\varphi(e_1e_1)=\varphi(e_1)\varphi(e_1) \end{align*}
$$

なので$\varphi(e_1)=e_2$となる. 次に

$$
\begin{align*} \varphi(x)\varphi(x^{-1})=\varphi(xx^{-1})=\varphi(e_1)=e_2 \end{align*}
$$

が成り立つので$\varphi(x^{-1})=\varphi(x)^{-1}$である. ◻

### 反準同型写像

定義 4 (反準同型写像). 写像$\varphi\colon G_1\to G_2$が次の条件を満たすとき$G_1$から$G_2$への反準同型写像(antihomomorphism)という.

$$
\begin{align*} \forall x,y\in G_1,\quad\varphi(xy)=\varphi(y)\varphi(x) \end{align*}
$$

アーベル群では準同型写像, 反準同型写像の区別はない.

反準同型写像$\varphi\colon G_1\to G_2$は, 演算の順序を逆にした群に関する準同型写像と見ることができる.

定義 5 (反対群). 群$(G,\cdot)$に対して, 集合$G^{\mathrm{op}}:=G$に演算$\circ_{\mathrm{op}}$を次のように定義した群$(G^{\mathrm{op}},\circ_{\mathrm{op}})$を群$(G,\circ)$の反対群(opposite group)という.

$$
\begin{align*} \forall x, y \in G^{\text{op}}, \quad x \circ_{\text{op}} y := y \cdot x \end{align*}
$$

反対群$G^{\text{op}}$は, 群$G$と同じ単位元, 逆元を持つ. また, 結合法則も元の群の結合法則から導かれる. アーベル群$G$では$G=G^{\mathrm{op}}$である. また, 群$(G^{\mathrm{op}})^{\mathrm{op}}$は$G$と演算の順番が一致するので$G$に等しい.

反準同型写像$\varphi\colon G_1\to G_2$の定義は, 群$G_2$の反対群$(G_2^{\mathrm{op}},\circ_{\mathrm{op}})$の定義を用いると次のように書ける.

$$
\begin{align*} \forall x,y\in G_1,\quad\varphi(xy) = \varphi(x) \circ_{\mathrm{op}} \varphi(y) \end{align*}
$$

つまり$G_1$から$G_2$への反準同型写像であることは$G_1$から$G_2^{\mathrm{op}}$への準同型写像であることと同値である.

同様に, 反準同型写像$\varphi\colon G_1\to G_2$の定義は, 群$G_1$の反対群$(G_2^{\mathrm{op}},\circ_{\mathrm{op}})$の定義を用いると次のように書ける.

$$
\begin{align*} \forall x,y\in G_1^{\mathrm{op}},\quad\varphi(x\circ_{\mathrm{op}}y) = \varphi(x)\varphi(y) \end{align*}
$$

つまり$G_1$から$G_2$への反準同型写像であることは$G_1^{\mathrm{op}}$から$G_2$への準同型写像と言い換えることもできる.

### 準同型写像と反準同型写像の合成の性質

命題 6 (準同型写像と反準同型写像の合成の性質).

- $\varphi\colon G_1\to G_2$, $\psi\colon G_2\to G_3$を準同型写像とする. このとき合成写像$\psi\circ\varphi\colon G_1\to G_3$は準同型写像である.

- $\varphi\colon G_1\to G_2$を準同型写像, $\psi\colon G_2\to G_3$を反準同型写像とする. このとき合成写像$\psi\circ\varphi\colon G_1\to G_3$は反準同型写像である.

- $\varphi\colon G_1\to G_2$, $\psi\colon G_2\to G_3$が反準同型写像であるとき, 合成写像$\psi\circ\varphi\colon G_1\to G_3$は準同型写像である.

証明.

- 合成$\psi\circ\varphi$について任意の$x,y\in G_1$に対し

$$
\begin{align*} (\psi\circ \varphi)(xy)=\psi(\varphi(xy))=\psi(\varphi(x)\varphi(y))=(\psi\circ \varphi)(x)\cdot (\psi\circ \varphi)(x) \end{align*}
$$

が成り立つので$\psi\circ\varphi\colon G_1\to G_3$も準同型写像である.

- 仮定より$\psi\colon G_2\to G_3^{\mathrm{op}}$は準同型写像である. 1. より合成写像$\psi\circ\varphi\colon G_1\to G_3^{\mathrm{op}}$は準同型写像である. これは$\psi\circ\varphi\colon G_1\to G_3$が反準同型写像であることを意味する.

- 仮定より$\varphi\colon G_1\to G_2^{\mathrm{op}}$, $\psi\colon G_2^{\mathrm{op}}\to G_3$は準同型写像である. 1. より合成写像$\psi\circ\varphi\colon G_1\to G_3$は準同型写像である.

◻

例 7 (逆元をとる写像は反準同型). 群$G$において写像$f\colon G\to G$を$f(x)=x^{-1}$と定めると,

$$
\begin{align*} f(xy)=(xy)^{-1}=y^{-1}x^{-1}=f(y)f(x) \end{align*}
$$

となるので$f$は反準同型写像である.

例 8. 群$G$からその反対群$G^{\mathrm{op}}$への写像${-}^{\mathrm{op}}\colon G\to G^{\mathrm{op}}$を$x\mapsto x$で定めると${-}^{\mathrm{op}}$は反準同型写像である.

### 生成系における準同型写像の一致

命題 9 (生成系の上で一致する準同型は等しい). $\varphi,\psi\colon G_1\to G_2$を準同型写像とする. また$G_1$の生成系を$S$とする. 任意の$s\in S$に対して$\varphi(s)=\psi(s)$ならば$\varphi=\psi$である.

証明. $G$は$S$で生成されるので, 任意の$g\in G$は

$$
\begin{align*} g=s_1^{\pm 1}s_2^{\pm 1}\cdots s_n^{\pm 1} \end{align*}
$$

と表される. $\varphi, \psi$は準同型写像であることと$S$上で一致することから

$$
\begin{align*} \varphi(g) &= \varphi(s_1^{\pm 1}s_2^{\pm 1}\cdots s_n^{\pm 1}) = \varphi(s_1)^{\pm 1}\varphi(s_2)^{\pm 1}\cdots \varphi(s_n)^{\pm 1} \\ &= \psi(s_1)^{\pm 1}\psi(s_2)^{\pm 1}\cdots \varphi(s_n)^{\pm 1}= \psi(s_1^{\pm 1}s_2^{\pm 1}\cdots s_n^{\pm 1}) \\ &= \psi(g) \end{align*}
$$

以上より$\varphi=\psi$が成り立つ. ◻

### 同型写像

定義 10 (同型写像). 写像$\varphi\colon G_1\to G_2$が以下の条件を満たすとき$\varphi$を$G_1$から$G_2$への同型写像(isomorphism)という.

- $\varphi\colon G_1\to G_2$は準同型写像である.

- $\varphi\colon G_1\to G_2$の逆写像が存在する, すなわち$\varphi$は全単射である.

- $\varphi$が1. を満たし, 逆写像$\varphi^{-1}\colon G_2\to G_1$が準同型写像である.

同型写像$\varphi\colon G_1\to G_2$が存在するとき$G_1$と$G_2$は同型(isomorphic)であるといい

$$
\begin{align*} G_1\cong G_2 \end{align*}
$$

と表す. 特に$G=G_1=G_2$であるとき$G_1$から$G_2$への同型写像を$G$の自己同型写像(automorphism)という. $G_1$から$G_2$への同型写像全体の集合を$\mathop{\mathrm{Iso}}(G_1,G_2)$, $G$の自己同型写像全体の集合を$\mathop{\mathrm{Aut}}(G)$で表す.

### 同型写像であることの同値な条件

準同型写像$\varphi$が同型写像であるとは, $\varphi$の逆写像が存在してそれも準同型であることである. ここで, 群の性質を用いれば後者の条件は省くことができる.

命題 11. 準同型写像$\varphi\colon G_1\to G_2$が同型写像であることは$\varphi\colon G_1\to G_2$が全単射であることと同値である.

証明. [準同型写像の定義:定義 10]の下で[準同型写像の定義:命題 11]が成り立つことは定義から従う. [準同型写像の定義:命題 11]が成り立つとき[準同型写像の定義:定義 10]の3. が成り立つこと, つまり準同型写像$\varphi$の逆写像$\varphi^{-1}\colon G_2\to G_1$が準同型写像であることを示せばよい. 任意の$x,y\in G_2$に対し$\varphi$は準同型なので

$$
\begin{align*} \varphi(\varphi^{-1}(x)\varphi^{-1}(y))=(\varphi\circ\varphi^{-1})(x)\cdot(\varphi\circ\varphi^{-1})(y)=xy \end{align*}
$$

である. よって

$$
\begin{align*} \varphi^{-1}(xy)=\varphi^{-1}(x)\varphi^{-1}(y) \end{align*}
$$

が成り立つ. つまり$\varphi^{-1}\colon G_2\to G_1$は準同型写像である. ◻

補足 代数系以外の他の対象における準同型の対応物, すなわちその構造を保つ写像においてこれが成り立つとは限らない. 例えば位相空間における連続写像は逆写像が存在してもそれが連続写像とは限らない. 順序集合における順序を保つ写像は逆写像が存在してもそれが順序を保つ写像とは限らない.

### 同型は同値関係

命題 12 (同型は同値関係). 群$G_1,G_2,G_3$に対して以下が成り立つ.

- $G_1\cong G_1$

- $G_1\cong G_2\implies G_2\cong G_1$

- $G_1\cong G_2,G_2\cong G_3\implies G_1\cong G_3$

証明.

- 恒等写像$G_1\to G_1$は全単射なので$G_1\cong G_1$である.

- $G_1\cong G_2$とすると全単射準同型写像$f\colon G_1\to G_2$が存在する. このとき$f^{-1}\colon G_2\to G_1$も[準同型写像の定義:命題 11]より準同型写像であって全単射であるから$G_2\cong G_1$である.

- $G_1\cong G_2,G_2\cong G_3$とすると2つの全単射準同型写像$f\colon G_1\to G_2$, $g\colon G_2\to G_3$が存在する. このとき[準同型写像の定義:命題 6]より合成写像$f\circ g\colon G_1\to G_3$は準同型写像で全単射である. よって$G_1\cong G_3$である.

◻
