---
articleId: ja-mathematics-homomorphism-image-kernel
locale: ja
title: 準同型写像の像と核
slug: homomorphism-image-kernel
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.homomorphism-image-kernel
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  準同型写像による像と逆像 命題 1 (像, 逆像は部分群). を群 から への群準同型とする. をそれぞれ の部分群, をそれぞれ
  の正規部分群とする. このとき以下が成り立つ. - は の部分群. - は の部分群. …
difficulty: intermediate
estimatedMinutes: 20
tags:
  - 準同型写像の像と核
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 準同型写像による像と逆像

命題 1 (像, 逆像は部分群). $f\colon G_1\to G_2$を群$G_1$から$G_2$への群準同型とする. $H_1,H_2$をそれぞれ$G_1,G_2$の部分群, $N_1,N_2$をそれぞれ$G_1,G_2$の正規部分群とする. このとき以下が成り立つ.

- $f(H_1)$は$G_2$の部分群.

- $f^{-1}(H_2)$は$G_1$の部分群.

- $f(N_1)$は$f(G_1)$の正規部分群.

- $f^{-1}(N_2)$は$G_1$の正規部分群.

証明. まず準同型写像によって単位元は単位元に移されることより$e_{G_2}\in f(H_1),f(N_1)$と$e_{G_1}\in f^{-1}(H_2),f^{-1}(N_2)$が言える. このことから$f(H_1),f^{-1}(H_2),f(N_1),f^{-1}(N_2)$はいずれも空でない.

- 任意の$x,y\in f(H_1)$をとる. このときある$x',y'\in H_1$が存在して$x=f(x'),y=f(y')$と表せる. すると$f$は準同型なので

$$
\begin{align*} xy=f(x')f(y')=f(x'y') \end{align*}
$$

である. $H_1$が$G$の部分群なので$x'y'\in H_1$. よって$xy\in f(H_1)$である. 同様に$x'^{-1}\in H_1$であって

$$
\begin{align*} x^{-1}=f(x')^{-1}=f(x'^{-1}) \end{align*}
$$

なので$x^{-1}\in f(H_1)$も成り立つ. よって[部分群の定義:命題 4]より$f(H_1)$は$G$の部分群である.

- 任意の$x,y\in f^{-1}(H_2)$をとる. このとき$f(x),f(y)\in H_2$である. すると$f$は準同型で, $H_2$は$G$の部分群なので

$$
\begin{align*} f(x)f(y)=f(xy)\in H_2 \end{align*}
$$

よって$xy\in f^{-1}(H_2)$である. 同様に$f(x)^{-1}=f(x^{-1})\in H_2$であるから$x^{-1}\in f^{-1}(H_2)$も成り立つ. よって[部分群の定義:命題 4]より$f^{-1}(H_2)$は$G$の部分群である.

- 1. より部分群であることは分かっているので正規性を示す. 任意の$f(n)\in f(N_1)$と$f(x)\in f(G_1),\,(n\in N_1,x\in G_1)$に対して

$$
\begin{align*} f(x)f(n)f(x)^{-1}=f(xnx^{-1}) \end{align*}
$$

であって$N_1$が$G_1$の正規部分群なので$xnx^{-1}\in N_1$. よって$f(x)f(n)f(x)^{-1}\in f(N_1)$なので$f(N_1)$は$f(G_1)$の正規部分群である.

- 2. より部分群であることは分かっているので正規性を示す. 任意の$n\in f^{-1}(N_2)$と$x\in G_1$に対して

$$
\begin{align*} f(xnx^{-1})=f(x)f(n)f(x)^{-1} \end{align*}
$$

であって$f(n)\in N_2, f(x)\in G_2$であるから$N_2$が$G_2$の正規部分群より$f(x)f(n)f(x)^{-1}\in N_2$. よって$xnx^{-1}\in f^{-1}(N_2)$なので$f^{-1}(N_2)$は$G_1$の正規部分群.

◻

上の結果から$f$が全射の場合は$f(N_1)$は$G_2$の正規部分群となることが分かる. しかし一般に$f(N_1)$は必ずしも$G_2$の正規部分群になるとは限らない. 実際に次の例がある.

補足 2次対称群$S_2$から3次対称群$S_3$への準同型写像$f$を

$$
\begin{align*} \sigma\mapsto \begin{cases} f(\sigma)(1)=\sigma(1) \\ f(\sigma)(2)=\sigma(2) \\ f(\sigma)(3)=3 \end{cases} \end{align*}
$$

で定める. このとき$S_2$は$S_2$自身の正規部分群であるが$f(S_2)$は$S_3$の正規部分群ではない. 実際,

$$
\begin{align*} \begin{pmatrix} 1 & 2 & 3 \\ 2 & 3 & 1 \end{pmatrix} f( \begin{pmatrix} 1 & 2 \\ 2 & 1 \end{pmatrix} ) \begin{pmatrix} 1 & 2 & 3 \\ 2 & 3 & 1 \end{pmatrix}^{-1} =\begin{pmatrix} 1 & 2 & 3 \\ 1 & 3 & 2 \end{pmatrix} \not\in f(S_2) \end{align*}
$$

### 準同型写像の像と核

定義 2 (像, 核). $\varphi\colon G_1\to G_2$を群$G_1$から$G_2$への群準同型とする. $e_2$を$G_2$の単位元として

$$
\begin{align*} \mathop{\mathrm{Ker}}\varphi:=\varphi^{-1}(\{e_2\}), \quad \mathop{\mathrm{Im}}\varphi:=\varphi(G_1) \end{align*}
$$

をそれぞれ$\varphi$の核(kernel), 像(image)という.

準同型$\varphi\colon G_1\to G_2$に対して, $\{e_2\}$は$G_2$の正規部分群であるから[準同型写像の像と核:命題 1]の2. より$\mathop{\mathrm{Ker}}\varphi$は$G_1$の正規部分群である. 一方で[準同型写像の像と核:命題 1]の1. 3. および上の補足より, $\mathop{\mathrm{Im}}\varphi$は$G$の部分群であるが正規部分群であるとは限らない.

### 核による単射性の言い換え

命題 3 (単射性の言い換え). $\varphi\colon G_1\to G_2$を群$G_1$から$G_2$への群準同型とする. $e_1$を$G_1$の単位元とすると

$$
\begin{align*} \varphi\text{が単射}\iff \mathop{\mathrm{Ker}}\varphi=\{e_1\} \end{align*}
$$

証明. $\varphi$が単射であると仮定する. $x\in \mathop{\mathrm{Ker}}\varphi$とすると$G_2$の単位元を$e_2$として$\varphi(x)=e_2=\varphi(e_1)$が成り立つ. $\varphi$は単射なので$x=e_1$が分かる.

次に$\mathop{\mathrm{Ker}}\varphi=\{e_1\}$と仮定する. $x,y\in G_1$として$\varphi(x)=\varphi(y)$とすると, $\varphi(x)\varphi(y)^{-1}=\varphi(xy^{-1})=e_2$である. このことから$xy^{-1}\in\mathop{\mathrm{Ker}}\varphi$が分かるので, 仮定より$xy^{-1}=e_2$すなわち$x=y$が分かる. 以上より$\varphi$は単射である. ◻

### 生成系の像

命題 4 (生成系の像). $\varphi\colon G_1\to G_2$を群$G_1$から$G_2$への群準同型とし, $S$を$G_1$の部分集合とする. このとき次が成り立つ.

$$
\begin{align*} \varphi(\langle S\rangle)=\langle \varphi(S)\rangle \end{align*}
$$

証明. $\varphi(S)\subset \varphi(\langle S\rangle)$であるから$\langle \varphi(S)\rangle\subset \varphi(\langle S\rangle)$が成り立つ. 逆に$\varphi(\langle S\rangle)$の任意の元は

$$
\begin{align*} \varphi(s_1^{\pm 1}s_2^{\pm 1}\cdots s_n^{\pm 1})=\varphi(s_1)^{\pm 1}\varphi(s_2)^{\pm 1}\cdots \varphi(s_n)^{\pm 1} \end{align*}
$$

と表されるので$\varphi(\langle S\rangle)\subset \langle \varphi(S)\rangle$も成り立つ. よって$\varphi(\langle S\rangle)=\langle \varphi(S)\rangle$が成り立つ. ◻
