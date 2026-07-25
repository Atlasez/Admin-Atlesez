---
articleId: ja-mathematics-module-homomorphisms
locale: ja
title: 加群の準同型写像
slug: module-homomorphisms
subject: mathematics
category: module-theory
concepts:
  - id: math.module-theory.module-homomorphisms
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  加群の準同型写像の定義 定義 1 (R準同型写像) を環とする. 左 加群 に対し写像 が 準同型写像,
  線形写像であるとは以下の条件を満たすことである. - はアーベル群の準同型写像である. - 任意の に対し . 同…
difficulty: intermediate
estimatedMinutes: 25
tags:
  - 加群の準同型写像
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 加群の準同型写像の定義

定義 1 (R準同型写像) $R$を環とする. 左$R$加群$M,N$に対し写像$f\colon M\to N$が$R$準同型写像,$R$線形写像であるとは以下の条件を満たすことである.

- $f\colon M\to N$はアーベル群の準同型写像である.

- 任意の$a\in R, x\in M$に対し$f(ax)=af(x)$.

同様に, 右$R$加群$M,N$に対し写像$f\colon M\to N$が$R$準同型写像,$R$線形写像であるとは以下の条件を満たすことである.

- $f\colon M\to N$はアーベル群の準同型写像である.

- 任意の$a\in R, x\in M$に対し$f(xa)=f(x)a$.

特に$R$加群$M$から$M$自身への$R$準同型写像は$M$の自己準同型写像といい, $\operatorname{End}_R(M)$や$\operatorname{End}(M)$で表す.

$R$準同型写像$f\colon M\to N$と言えば$M,N$が左$R$加群, 右$R$加群かでどちらの準同型写像であるかは明らかなため用語は統一して扱う.

両側$(R,S)$加群$M,N$に対し写像$f\colon M\to N$が準同型写像であるとは, 左$R$加群として$R$準同型写像かつ右$S$加群として$S$準同型写像であることである.

また, 右$R$加群$M,N$に対して$f\colon M\to N$が$R$準同型写像であるとは, $M,N$を左$R^{\mathrm{op}}$加群と見なしたときの$R^{\mathrm{op}}$準同型写像であることと同値である. 同様に両側$(R,S)$加群$M,N$に対して$f\colon M\to N$が準同型写像であるとは, $M,N$を左$R\otimes_{\mathbb{Z}} S^{\mathrm{op}}$加群と見なしたときの$R\otimes_{\mathbb{Z}} S^{\mathrm{op}}$準同型写像であることと同値である.

例 2 (恒等写像) 任意の$R$加群$M$に対して, 恒等写像$M\to M;\ x\mapsto x$は準同型写像である.

例 3 (零写像) 任意の$R$加群$M,N$に対して, 写像$M\to N;\ x\mapsto 0$は準同型写像である. この準同型写像を零写像といい, 単に$0\colon M\to N$で表す.

例 4 (包含写像) 任意の$R$加群$M$の部分加群$N$に対して, 包含写像$N\to M;\ x\mapsto x$は準同型写像である.

### 準同型写像の合成の性質

命題 5 $R$準同型写像$f\colon M_1\to M_2$, $g\colon M_2\to M_3$の合成$g\circ f\colon M_1\to M_3$は$R$準同型写像である.

証明. 合成$g\circ f$について任意の$x,y\in M_1$に対し

$$
\begin{align*} (g\circ f)(x+y)&=g(f(x+y))=g(f(x)+f(y))=(g\circ f)(x)+(g\circ f)(y)\\ (g\circ f)(ax)&=g(f(ax))=g(af(x))=a g(f(x))=a(g\circ f)(x) \end{align*}
$$

が成り立つので$g\circ f$は$R$準同型写像である. ◻

### 同型写像

定義 6 (同型写像) $R$を環とし, $M_1, M_2$を左$R$加群とする. 写像$f\colon M_1\to M_2$が以下の条件を満たすとき$f$を$M_1$から$M_2$への$R$同型写像($R$-isomorphism)という.

- $f\colon M_1\to M_2$は$R$準同型写像である.

- $f\colon M_1\to M_2$の逆写像が存在する, すなわち$f$は全単射である.

- 逆写像$f^{-1}\colon M_2\to M_1$も$R$準同型写像である.

$R$同型写像$f\colon M_1\to M_2$が存在するとき$M_1$と$M_2$は同型(isomorphic)であるといい

$$
\begin{align*} M_1\cong M_2 \end{align*}
$$

と表す. 特に$M=M_1=M_2$であるとき$M_1$から$M_2$への同型写像を$M$の自己同型写像(automorphism)という.

### 同型写像であることの同値な条件

準同型写像$f$が同型写像であるとは, $f$の逆写像が存在してそれも準同型写像であることである. ここで, 加群の定義から逆写像が準同型であるという条件は省くことができる.

命題 7 $R$準同型写像$f\colon M_1\to M_2$が同型写像であることは, $f\colon M_1\to M_2$が全単射であることと同値である.

証明. 同型写像ならば全単射であることは定義から直ちに従う. 逆に$f\colon M_1\to M_2$が全単射であると仮定する. このとき逆写像$f^{-1}\colon M_2\to M_1$が存在する. さらに, $f\colon M_1\to M_2$は$R$準同型写像であるから, 任意の$x,y\in M_2$と$a\in R$に対して

$$
\begin{align*} f(f^{-1}(x)+f^{-1}(y))&=f(f^{-1}(x))+f(f^{-1}(y))=x+y\\ f(a f^{-1}(x))&=a f(f^{-1}(x))=ax \end{align*}
$$

が成り立つので$f^{-1}\colon M_2\to M_1$も$R$準同型写像である. ◻

### 同型は同値関係

命題 8 (同型は同値関係) 左$R$加群$M_1,M_2,M_3$に対して以下が成り立つ.

- $M_1\cong M_1$

- $M_1\cong M_2\implies M_2\cong M_1$

- $M_1\cong M_2,M_2\cong M_3\implies M_1\cong M_3$

証明.

- 恒等写像$M_1\to M_1$は全単射な$R$準同型写像なので$M_1\cong M_1$である.

- $M_1\cong M_2$とすると全単射な$R$準同型写像$f\colon M_1\to M_2$が存在する. このとき$f^{-1}\colon M_2\to M_1$も[加群の準同型写像:命題 7]より$R$準同型写像であって全単射であるから$M_2\cong M_1$である.

- $M_1\cong M_2,M_2\cong M_3$とすると2つの全単射な$R$準同型写像$f\colon M_1\to M_2$, $g\colon M_2\to M_3$が存在する. このとき[加群の準同型写像:命題 5]より合成写像$g\circ f\colon M_1\to M_3$は$R$準同型写像で全単射である. よって$M_1\cong M_3$である.

◻
