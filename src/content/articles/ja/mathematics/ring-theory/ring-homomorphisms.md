---
articleId: ja-mathematics-ring-homomorphisms
locale: ja
title: 環準同型写像の定義
slug: ring-homomorphisms
subject: mathematics
category: ring-theory
concepts:
  - id: math.ring-theory.ring-homomorphisms
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  環準同型写像の定義 定義 1 (環準同型写像) を環とする. 写像 が次の条件を満たすとき から への環準同型写像(ring
  homomorphism)という. - は加法群 から への群準同型写像である. すなわち -…
difficulty: intermediate
estimatedMinutes: 30
tags:
  - 環準同型写像の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 環準同型写像の定義

定義 1 (環準同型写像) $(R_1,+_{\small R_1},0_{\small R_1},-_{\small R_1},\cdot_{\small R_1}), (R_2,+_{\small R_2},0_{\small R_2},-_{\small R_2},\cdot_{\small R_2})$を環とする. 写像$\varphi\colon R_1\to R_2$が次の条件を満たすとき$R_1$から$R_2$への環準同型写像(ring homomorphism)という.

- $\varphi\colon R_1\to R_2$は加法群$(R_1,+_{\small R_1},0_{\small R_1},-_{\small R_1})$から$(R_2,+_{\small R_2},0_{\small R_2},-_{\small R_2})$への群準同型写像である. すなわち

$$
\begin{align*} \forall x,y\in R_1,\,\varphi(x+_{\small R_1} y)=\varphi(x)+_{\small R_2}\varphi(y) \end{align*}
$$

- $\varphi\colon R_1\to R_2$は半群$(R_1,\cdot_{\small R_1})$から$(R_2,\cdot_{\small R_2})$への半群の準同型写像である. すなわち

$$
\begin{align*} \forall x,y\in R_1,\,\varphi(x\cdot_{\small R_1} y)=\varphi(x)\cdot_{\small R_2}\varphi(y) \end{align*}
$$

特に環$R$から$R$自身への環準同型写像は$R$の自己準同型写像(endomorphism)という. $R_1$から$R_2$への環準同型写像全体の集合を$\operatorname{Hom}(R_1,R_2)$や$\operatorname{Hom}_{\mathrm{Ring}}(R_1,R_2)$と表し, $R$の自己準同型写像全体の集合を$\operatorname{End}(R)$や$\operatorname{End}_{\mathrm{Ring}}(R)$で表す.

上の定義では演算を区別するために$+_{\small R_1}$, $+_{\small R_2}$などとしているが, 写像の始域と終域に従えば誤解のおそれはないので, 基本的に演算は省略する. なお, 環準同型$\varphi$は加法群$(R_1,+_{\small R_1},0_{\small R_1},-_{\small R_1})$から$(R_2,+_{\small R_2},0_{\small R_2},-_{\small R_2})$への群準同型写像でもあるため, 群論の一般論から$\varphi(0_{\small R_1})=0_{\small R_2}$および$\varphi(-x)=-\varphi(x)$が直ちに従う.

定義 2 (単位的環準同型写像) $(R_1,+_{\small R_1},0_{\small R_1},-_{\small R_1},\cdot_{\small R_1},1_{\small R_1}), (R_2,+_{\small R_2},0_{\small R_2},-_{\small R_2},\cdot_{\small R_2},1_{\small R_2})$を単位的環とする. 環準同型写像$\varphi\colon R_1\to R_2$が単位元を保存する, すなわち

$$
\begin{align*} \varphi(1_{\small R_1})=1_{\small R_2} \end{align*}
$$

を満たすとき, $\varphi$を$R_1$から$R_2$への単位的環準同型写像(unital ring homomorphism)という.

一般に単位的環においては乗法の逆元が存在しないので, $\varphi(x+y)=\varphi(x)+\varphi(y)$や$\varphi(xy)=\varphi(x)\varphi(y)$のみから$\varphi(1_{\small R_1})=1_{\small R_2}$を導くことはできない.

例 3 (恒等写像は準同型) 環$R$の恒等写像$\mathrm{id}_R\colon R\to R$は環準同型写像である.

### 反準同型写像

定義 4 (反準同型写像) 環$R_1$から$R_2$への写像$\varphi\colon R_1\to R_2$が加法と単位元を保存し, かつ乗法に関して次の条件を満たすとき, 反準同型写像(antihomomorphism)という.

$$
\begin{align*} \forall x,y\in R_1,\quad\varphi(xy)=\varphi(y)\varphi(x) \end{align*}
$$

可換環においては乗法の交換法則が成り立つため, 準同型写像と反準同型写像の区別はない. 反準同型写像は$\varphi\colon R_1\to R_2$は, 環の乗法の順序を逆にした環に関する準同型写像とみることができる.

定義 5 (反対環) 環$(R,+,\cdot)$に対して, 集合$R^{\mathrm{op}}:=R$に加法をそのままに, 乗法$\circ_{\mathrm{op}}$を次のように定義した環$(R^{\mathrm{op}},+,\circ_{\mathrm{op}})$を環$R$の反対環(opposite ring)という.

$$
\begin{align*} \forall x, y \in R^{\mathrm{op}}, \quad x \circ_{\mathrm{op}} y := y \cdot x \end{align*}
$$

反対環$R^{\mathrm{op}}$は元の環$R$と同一の加法構造および乗法単位元を持つ. 可換環$R$においては$R=R^{\mathrm{op}}$である. また, 環$(R^{\mathrm{op}})^{\mathrm{op}}=$は$R$と乗法の順番が一致するので$R$に等しい.

反準同型写像$\varphi\colon R_1\to R_2$の定義は, $R_1$から$R_2^{\mathrm{op}}$への準同型写像であること, あるいは$R_1^{\mathrm{op}}$から$R_2$への準同型写像であると言い換えることができる.

### 準同型写像と反準同型写像の合成の性質

命題 6 (準同型写像と反準同型写像の合成の性質)

- $\varphi\colon R_1\to R_2$, $\psi\colon R_2\to R_3$を準同型写像とする. このとき合成写像$\psi\circ\varphi\colon R_1\to R_3$は準同型写像である.

- $\varphi\colon R_1\to R_2$を準同型写像, $\psi\colon R_2\to R_3$を反準同型写像とする. このとき合成写像$\psi\circ\varphi\colon R_1\to R_3$は反準同型写像である.

- $\varphi\colon R_1\to R_2$, $\psi\colon R_2\to R_3$がともに反準同型写像であるとき, 合成写像$\psi\circ\varphi\colon R_1\to R_3$は準同型写像である.

証明.

- 合成$\psi\circ\varphi$について任意の$x,y\in R_1$に対し

$$
\begin{align*} (\psi\circ \varphi)(x+y)&=\psi(\varphi(x+y))=\psi(\varphi(x)+\varphi(y))=(\psi\circ \varphi)(x)+(\psi\circ \varphi)(y)\\ (\psi\circ \varphi)(xy)&=\psi(\varphi(xy))=\psi(\varphi(x)\varphi(y))=(\psi\circ \varphi)(x)\cdot (\psi\circ \varphi)(y) \end{align*}
$$

が成り立つので$\psi\circ\varphi\colon R_1\to R_3$も環準同型写像である.

- 仮定より$\psi\colon R_2\to R_3^{\mathrm{op}}$は準同型写像である. 1. より合成写像$\psi\circ\varphi\colon R_1\to R_3^{\mathrm{op}}$は準同型写像である. これは$\psi\circ\varphi\colon R_1\to R_3$が反準同型写像であることを意味する.

- 仮定より$\varphi\colon R_1\to R_2^{\mathrm{op}}$, $\psi\colon R_2^{\mathrm{op}}\to R_3$は準同型写像である. 1. より合成写像$\psi\circ\varphi\colon R_1\to R_3$は準同型写像である.

◻

### 同型写像

定義 7 (同型写像) 写像$\varphi\colon R_1\to R_2$が以下の条件を満たすとき$\varphi$を$R_1$から$R_2$への環同型写像(ring isomorphism)という.

- $\varphi\colon R_1\to R_2$は環準同型写像である.

- $\varphi\colon R_1\to R_2$の逆写像が存在する, すなわち$\varphi$は全単射である.

- 逆写像$\varphi^{-1}\colon R_2\to R_1$も環準同型写像である.

環同型写像$\varphi\colon R_1\to R_2$が存在するとき$R_1$と$R_2$は同型(isomorphic)であるといい

$$
\begin{align*} R_1\cong R_2 \end{align*}
$$

と表す. 特に$R=R_1=R_2$であるとき$R_1$から$R_2$への同型写像を$R$の自己同型写像(automorphism)という. $R_1$から$R_2$への同型写像全体の集合を$\mathop{\mathrm{Iso}}(R_1,R_2)$や$\mathop{\mathrm{Iso}}_{\mathrm{Ring}}(R_1,R_2)$, $R$の自己同型写像全体の集合を$\operatorname{Aut}(R)$や$\operatorname{Aut}_{\mathrm{Ring}}(R)$で表す.

### 同型写像であることの同値な条件

準同型写像$\varphi$が同型写像であるとは, $\varphi$の逆写像が存在してそれも準同型写像であることである. ここで, 環の定義から逆写像が準同型であるという条件は省くことができる.

命題 8 環準同型写像$\varphi\colon R_1\to R_2$が同型写像であることは, $\varphi\colon R_1\to R_2$が全単射であることと同値である.

証明. 同型写像ならば全単射であることは定義から直ちに従う. 逆に$\varphi\colon R_1\to R_2$が全単射であると仮定する. このとき逆写像$\varphi^{-1}\colon R_2\to R_1$が存在する. さらに, $\varphi\colon R_1\to R_2$は環準同型写像であるから, 任意の$x,y\in R_2$に対して

$$
\begin{align*} \varphi(\varphi^{-1}(x)+\varphi^{-1}(y))&=\varphi(\varphi^{-1}(x))+\varphi(\varphi^{-1}(y))=x+y\\ \varphi(\varphi^{-1}(x)\cdot \varphi^{-1}(y))&=\varphi(\varphi^{-1}(x))\cdot \varphi(\varphi^{-1}(y))=xy \end{align*}
$$

が成り立つので$\varphi^{-1}\colon R_2\to R_1$も環準同型写像である. ◻

### 同型は同値関係

命題 9 (同型は同値関係) 環$R_1,R_2,R_3$に対して以下が成り立つ.

- $R_1\cong R_1$

- $R_1\cong R_2\implies R_2\cong R_1$

- $R_1\cong R_2,R_2\cong R_3\implies R_1\cong R_3$

証明.

- 恒等写像$R_1\to R_1$は全単射なので$R_1\cong R_1$である.

- $R_1\cong R_2$とすると全単射準同型写像$f\colon R_1\to R_2$が存在する. このとき$f^{-1}\colon R_2\to R_1$も[環準同型写像の定義:命題 8]より準同型写像であって全単射であるから$R_2\cong R_1$である.

- $R_1\cong R_2,R_2\cong R_3$とすると2つの全単射準同型写像$f\colon R_1\to R_2$, $g\colon R_2\to R_3$が存在する. このとき[環準同型写像の定義:命題 6]より合成写像$f\circ g\colon R_1\to R_3$は準同型写像で全単射である. よって$R_1\cong R_3$である.

◻
