---
articleId: ja-mathematics-homomorphism-theorem
locale: ja
title: 準同型定理
slug: homomorphism-theorem
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.homomorphism-theorem
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  準同型定理 定理 1 (準同型定理). を群 から への群準同型とする. を の正規部分群として, を自然な射影とする. このとき準同型写像
  で となるもの, すなわち以下の図式を可換にするものが一意的に存在する. さら…
difficulty: intermediate
estimatedMinutes: 20
tags:
  - 準同型定理
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 準同型定理

定理 1 (準同型定理). $\varphi\colon G_1\to G_2$を群$G_1$から$G_2$への群準同型とする. $N\subset \mathop{\mathrm{Ker}}{\varphi}$を$G$の正規部分群として, $\pi\colon G_1\to G_1/N$を自然な射影とする. このとき準同型写像$\overline{\varphi}\colon G_1/N\to G_2$で$\varphi=\overline{\varphi}\circ \pi$となるもの, すなわち以下の図式を可換にするものが一意的に存在する.

さらに$\overline{\varphi}\colon G_1/N \to \mathop{\mathrm{Im}}\varphi$は同型写像である. つまり次の群の同型が成り立つ.

$$
\begin{align*} G_1/N\cong \mathop{\mathrm{Im}}\varphi \end{align*}
$$

証明. 写像$\overline{\varphi}\colon G_1/N\to G_2$を$xN\mapsto \varphi(x)$で定める.

まず$\overline\varphi$がwell-definedであることを示す. つまり$\overline{\varphi}$が代表元の選び方によらず定まることを示す. $x_1N=x_2N\in G_1/N$と仮定する. このとき$x_2^{-1}x_1\in N\subset \mathop{\mathrm{Ker}}\varphi$なので$\varphi(x_2^{-1}x_1)=e_{G_2}$. よって$\varphi(x_1)=\varphi(x_2)$が分かる. すると

$$
\begin{align*} \overline{\varphi}(x_1N) &= \varphi(x_1) \\ &= \varphi(x_2) \\ &= \overline{\varphi}(x_2N) \end{align*}
$$

なので代表元の選び方によらず$\overline{\varphi}$の行先は定まる. $\overline\varphi$が準同型であることは$x_1N,x_2N\in G_1/N$に対し

$$
\begin{align*} \overline\varphi(x_1N)\overline\varphi(x_2N) &= \varphi(x_1)\varphi(x_2) \\ &= \varphi(x_1x_2) \\ &= \overline\varphi((x_1x_2)N) \\ &=\overline{\varphi}((x_1N)(x_2N)) \end{align*}
$$

からわかる. また, $\psi\colon G_1/N \to G_2$ を, $\varphi = \psi \circ \pi$ を満たす任意の準同型写像とする. 任意の $xN \in G_1/N$ に対して, 条件より

$$
\begin{align*} \psi(xN) &= \psi(\pi(x)) \\ &= (\psi \circ \pi)(x) \\ &= \varphi(x) \end{align*}
$$

が成り立つ. $\overline{\varphi}(xN) = \varphi(x)$であるから, $\overline{\varphi}$が一意的に定まることが示された.

次に$\overline{\varphi}$が全単射であることを示す. $x_1N,x_2N\in G/N$で

$$
\begin{align*} \overline{\varphi}(x_1N)=\overline{\varphi}(x_2N) \end{align*}
$$

と仮定すると$\varphi(x_1)=\varphi(x_2)$であり, このことから

$$
\begin{align*} \varphi(x_2)^{-1}\varphi(x_1)=\varphi(x_2^{-1}x_1)=e_{G_2} \end{align*}
$$

なので$x_2^{-1}x_1\in N$, つまり$x_1N=x_2N$なので$\overline{\varphi}$が単射であることが分かる. 全射であることは任意の$\varphi(x)\in \mathop{\mathrm{Im}}\varphi$に対して

$$
\begin{align*} \overline{\varphi}(xN)=\varphi(x) \end{align*}
$$

とできることから分かる. ◻

特に$N=\mathop{\mathrm{Ker}}\varphi$とすると, 同型

$$
\begin{align*} G_1/\mathop{\mathrm{Ker}}\varphi \cong \mathop{\mathrm{Im}}\varphi \end{align*}
$$

が成り立ち, この形で定理を適用することが多い. これは第一同型定理と呼ばれる.

準同型定理は群の同型を与える上で非常に有用な定理である. 次の例は準同型定理を用いて同型を与える例である.

### 同型定理

準同型定理を用いると準同型写像から同型写像を得ることができる. 以下の同型定理は準同型定理から導かれる代表的な定理である.

定理 2 (第二同型定理). $G$を群として$H,N\leq G$とする. $H\subset N_G(N)$を満たすとき同型

$$
\begin{align*} H/{(H\cap N)}\cong HN/N \end{align*}
$$

を与える同型写像が存在する.

証明. まず$H\subset N_G(N)$であることから, 任意の$h\in H$に対して$hNh^{-1}=N$が成り立つ. よって$NH=HN$が成り立つので[部分群の定義:命題 10]より$HN$は$G$の部分群である.

さらに$N$が$HN$の正規部分群であることを示すことで$HN/N$が定義されることを確かめる. $hn \in HN$と$x\in N$をとる. このとき

$$
\begin{align*} (hn)x(hn)^{-1} = h(nx n^{-1})h^{-1} \end{align*}
$$

である. ここで仮定より$H\subset N_G(N)$なので$hNh^{-1}=N$が成り立つ. $nxn^{-1}\in N$なので$h(nx n^{-1})h^{-1}\in N$である. よって$N\vartriangleleft HN$が分かる.

次に写像$\pi\colon H\to HN/N$を$h\mapsto hN\in HN/N$で定める. このとき$\pi$は準同型写像である. 実際, $h_1,h_2\in H$に対して

$$
\begin{align*} \pi(h_1h_2) &= h_1h_2N \\ &= (h_1N)(h_2N) \\ &= \pi(h_1)\pi(h_2) \end{align*}
$$

が成り立つ. 準同型定理([準同型定理:定理 1])より次の同型が成り立つ.

$$
\begin{align*} H/\mathop{\mathrm{Ker}}\pi \cong \mathop{\mathrm{Im}}\pi \end{align*}
$$

$HN/N$の任意の元は$(hn)N=hN\ (h\in H, n\in N)$と表されるので$\pi(h)=(hn)N$となるから$\pi$は全射である. よって$\mathop{\mathrm{Im}}(\pi)=HN/N$である. 次に$\mathop{\mathrm{Ker}}\pi$を求める.

$$
\begin{align*} \mathop{\mathrm{Ker}}\pi &= \{h\in H\mid \pi(h)=N\} \\ &= \{h\in H\mid h\in N\} \\ &= H\cap N \end{align*}
$$

以上より同型

$$
\begin{align*} H/{(H\cap N)}\cong HN/N \end{align*}
$$

が示された. ◻

特に$H\leq G$, $N\vartriangleleft G$のとき, $N_G(N)=G$であって

$$
\begin{align*} H/{(H\cap N)}\cong HN/N \end{align*}
$$

が成り立ち, この形で定理を適用することが多い.

定理 3 (第三同型定理). $G$を群として$N_1,N_2\vartriangleleft G$かつ$N_1\supset N_2$とする. このとき同型

$$
\begin{align*} (G/N_2)/(N_1/N_2)\cong G/N_1 \end{align*}
$$

を与える同型写像が存在する.

証明. 写像$\varphi$を次のように定めることができる.

$$
\begin{align*} \varphi\colon G/N_2\to G/N_1,\quad gN_2\mapsto gN_1 \end{align*}
$$

まずこの対応がwell-definedであることを示す. $gN_2=g'N_2$とすると$g'^{-1}g\in N_2\subset N_1$であるから$gN_1=g'N_1$. すなわち$\varphi(gN_2)=\varphi(g'N_2)$より示された. また$\varphi$は全射準同型であるから$\mathop{\mathrm{Im}}\varphi=G/N_1$である. さらに

$$
\begin{align*} \mathop{\mathrm{Ker}}\varphi &= \{gN_2\mid \varphi(gN_2)= gN_1=N_1\} \\ &= \{gN_2\mid g\in N_1\} \\ &= N_1/N_2 \end{align*}
$$

であるので$\varphi$に対して準同型定理([準同型定理:定理 1])を適用すれば$\varphi$が誘導する同型写像

$$
\begin{align*} \overline{\varphi}\colon (G/N_2)/(N_1/N_2)\stackrel{\cong}{\longrightarrow} G/N_1 \end{align*}
$$

が得られる. ◻
