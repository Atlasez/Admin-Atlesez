---
articleId: ja-mathematics-symmetric-groups
locale: ja
title: 対称群の定義
slug: symmetric-groups
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.symmetric-groups
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  対称群の定義 定義 1 ((一般の)対称群). 集合 に対し を から への全単射全体の集合とすると写像の合成を演算として群となる. これを
  の対称群(symmetric group)とよぶ. の元は置換(permuta…
difficulty: intermediate
estimatedMinutes: 25
tags:
  - 対称群の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 対称群の定義

定義 1 ((一般の)対称群). 集合$X$に対し$\mathop{\mathrm{Sym}}X$を$X$から$X$への全単射全体の集合とすると写像の合成を演算として群となる. これを$X$の対称群(symmetric group)とよぶ.

$\mathop{\mathrm{Sym}}(X)$の元は置換(permutation)とよぶ. 対称群$\mathop{\mathrm{Sym}}(X)$の単位元は$X$上の恒等写像$\mathrm{id}_X\in\mathop{\mathrm{Sym}}(X)$でこれを恒等置換(identity permutation)とよぶ. $f\in \mathop{\mathrm{Sym}}(X)$の逆元はその逆写像$f^{-1}\in \mathop{\mathrm{Sym}}(X)$である.

命題 2. $|X|\leq |Y|$ならば, $\mathop{\mathrm{Sym}}(X)$と同型な$\mathop{\mathrm{Sym}}(Y)$の部分群が存在する.

証明. 仮定より, 単射$f\colon X\to Y$が存在する. この$f$を一つ固定して, $\phi_f\colon S(X)\to S(Y)$を次のように定める. まず$y\in f(X)$であるとき, $f$が単射なので$y=f(x)$となる$x$がただ一つ存在するので$\phi_f(\sigma)(y)=f(\sigma(x))$とする. $y\not\in f(X)$であるとき, $\phi_f(\sigma)(y)=y$とする. 次の計算によって$\phi_f$が準同型写像であることが分かる.

$$
\begin{align*} \phi_f(\sigma)\phi_f(\tau)(y)&= \begin{cases} f(\sigma(\tau(x))) & (y=f(x)\in f(X)) \\ y & (y\not\in f(X)) \end{cases} \\ &=\phi_f(\sigma\tau)(y),\quad (\sigma,\tau\in S(X)) \end{align*}
$$

さらに$\phi_f$が単射であることを示す. $\phi_f(\sigma)=\phi_f(\tau)$とすると, 任意の$x\in X$に対して

$$
\begin{align*} f(\sigma(x))=f(\tau(x)) \end{align*}
$$

$f$は単射なので$\sigma(x)=\tau(x)$が成り立つ. つまり$\sigma=\tau$なので$\phi_f$は単射であることが分かる.

以上より$\mathop{\mathrm{Sym}}(X)$の$\phi_f$による像は$\mathop{\mathrm{Sym}}(X)$と同型で, $\mathop{\mathrm{Sym}}(Y)$の部分群となる. ◻

対称群は元となる集合の濃度によって特徴づけられる.

命題 3. 集合$X$, $Y$に対して$|X|=|Y|$ならば$\mathop{\mathrm{Sym}}(X)\cong \mathop{\mathrm{Sym}}(Y)$が成り立つ.

証明. 仮定より全単射$f\colon X\to Y$が存在する. この$f$を一つ固定して, $f$の逆写像$f^{-1}\colon Y\to X$を用いて

$$
\begin{align*} \phi_f\colon S(X)\to S(Y),\quad \sigma\mapsto f\sigma f^{-1} \end{align*}
$$

と定める. 次の計算によって$\phi_f$が準同型写像であることが分かる.

$$
\begin{align*} \phi_f(\sigma)\phi_f(\tau)=f\sigma f^{-1}f\tau f^{-1}=f(\sigma\tau)f^{-1}=\phi_f(\sigma\tau),\quad (\sigma,\tau\in S(X)) \end{align*}
$$

さらに$\phi_f$が全単射であることを示す. まず$\phi_f(\sigma)=\phi_f(\tau)$とすると

$$
\begin{align*} f\sigma f^{-1}=f\tau f^{-1}\Longrightarrow \sigma=\tau \end{align*}
$$

なので$\phi_f$が単射であることがわかる. 任意の$\sigma\in S(Y)$に対して$f^{-1}\sigma f\in S(X)$であり,

$$
\begin{align*} \phi_f(f^{-1}\sigma f)=ff^{-1}\sigma ff^{-1}=\sigma \end{align*}
$$

より$\phi_f$は全射であることも分かる. ◻

### Cayleyの定理

任意の群$G$は, 十分な大きさの対称群に対して埋め込むことができる.

定理 4 (Cayleyの定理). 群$G$に対して, $G$と同型な$\mathop{\mathrm{Sym}}(G)$の部分群が存在する.

証明. 写像$\rho\colon G\to \mathop{\mathrm{Sym}}(G);\,g\mapsto \rho(g)$を次で定める.

$$
\begin{align*} \rho(g)\colon G\longrightarrow G;\quad h\mapsto gh \end{align*}
$$

ここで, $\rho(g)$は逆写像$\rho(g^{-1})$を持つので$\rho(g)\in \mathop{\mathrm{Sym}}(G)$である. 任意の$g_1,g_2\in G$に対して

$$
\begin{align*} \rho(g_1g_2)(h) = (g_1g_2)h = g_1(g_2h) = (\rho(g_1)\circ \rho(g_2))(h) \end{align*}
$$

となるので, $\rho$は準同型写像である.

$\rho(g)\colon h\mapsto gh$が恒等写像になるのは$g=e$に限られるので, [準同型写像の像と核:命題 3]より$\rho$は単射. よって$\rho(G)$は$G$と同型であって, $\rho(G)$は$\mathop{\mathrm{Sym}}(G)$の部分群である. ◻

### $n$次対称群

定義 5 ($n$次対称群). $n\geq 2$, $I_n:=\{1,2,\ldots ,n\}$として$I_n$の対称群$\mathop{\mathrm{Sym}}{I_n}$を$S_n$と表し$n$次対称群という. $\sigma\in S_n$を次のように表す.

$$
\begin{align*} \sigma= \begin{pmatrix} 1 & 2 & \cdots & n-1 & n \\ \sigma(1) & \sigma(2) & \cdots & \sigma(n-1) & \sigma(n) \end{pmatrix} \end{align*}
$$

$S_n$の恒等置換を$e\in S_n$で表す.

$S_n$の位数は$n!$で, $n\geq 3$のとき非アーベル群である. $X$上の対称群や$n$次対称群はドイツ文字(フラクトゥール)のSを用いてそれぞれ$\mathfrak{S}(X),\mathfrak{S}_n$と書くこともある.

例 6. 実際の計算例を見てみる. $3$次対称群$S_3$において

$$
\begin{align*} \begin{pmatrix} 1 & 2 & 3 \\ 3 & 1 & 2 \end{pmatrix} \begin{pmatrix} 1 & 2 & 3 \\ 2 & 1 & 3 \end{pmatrix} = \begin{pmatrix} 1 & 2 & 3 \\ 1 & 3 & 2 \end{pmatrix} \\ \begin{pmatrix} 1 & 2 & 3 \\ 2 & 1 & 3 \end{pmatrix} \begin{pmatrix} 1 & 2 & 3 \\ 3 & 1 & 2 \end{pmatrix} = \begin{pmatrix} 1 & 2 & 3 \\ 3 & 2 & 1 \end{pmatrix} \end{align*}
$$

このとき演算の順番に注意する. 置換は写像なので上の例では右の置換から順に計算する.

### 巡回置換と互換

定義 7 (巡回置換, 互換). 整数$2\leq m\leq n$と, 相異なる整数$1\leq i_1,i_2,\ldots ,i_m\leq n$について, 添え字は$m$を法とするものとする. 置換$\sigma\in S_n$で

$$
\begin{align*} \begin{cases} \sigma(i_k)=i_{k+1} &(1\leq k\leq m) \\ \sigma(l)=l &(\text{otherwise}) \end{cases} \end{align*}
$$

となっているものを次のように表す.

$$
\begin{align*} \sigma=(i_1,i_2,i_3,\ldots ,i_m) \end{align*}
$$

このような置換を長さ$m$の巡回置換(cyclic permutation)という. 特に, 長さ2の巡回置換を互換(transposition)という.

例 8. 5次対称群$S_5$において

$$
\begin{align*} \begin{pmatrix} 1 & 2 & 3 & 4 & 5 \\ 4 & 2 & 3 & 5 & 1 \end{pmatrix} =(1,4,5) \end{align*}
$$

である. 巡回置換による表示は一意ではなく,

$$
\begin{align*} (1,4,5)=(4,5,1)=(5,1,4) \end{align*}
$$

である.

例 9. $S_2,S_3$は互換, 巡回置換の記法を用いて次のように表すことができる.

$$
\begin{align*} S_2 &= \{e,(1,\,2)\} \\ S_3 &= \{e,(1,2),(2,3),(3,1),(1,2,3),(1,3,2)\} \end{align*}
$$

$S_2$, $S_3$の元は上のように全て巡回置換であるが, $n\geq 4$において$S_n$の元は一般に巡回置換とは限らない. 実際,

$$
\begin{align*} (1,\,2)(3,\,4),\,(1,\,3)(2,\,4),\,(1,\,4)(2,\,3)\in S_4 \end{align*}
$$

は一つの巡回置換で表されない置換である.

命題 10. 長さ$m$の巡回置換$(i_1,i_2,\ldots ,i_m)$について次が成り立つ.

- $(i_1,i_2,\ldots ,i_m)^{-1}=(i_m,i_{m-1},\ldots ,i_1)$.

- $(i_1,i_2,\ldots ,i_m)$の位数は$m$である.

証明. 長さ$m$の巡回置換$(i_1,i_2,\ldots ,i_m)$を$\sigma$とおく. $\sigma$は$i_1,i_2,\ldots ,i_m$のみを動かす.

- $(i_m,i_{m-1},\ldots ,i_1)$を$\tau$とおいて$\tau\sigma=\sigma\tau=e$を示す. 任意の$1\leq k\leq m$に対して, $\tau$は$\tau(i_k)=i_{k-1}$となる巡回置換なので

$$
\begin{align*} (\tau\sigma)(i_k) &= \tau(i_{k+1}) = i_k \\ (\sigma\tau)(i_k) &= \sigma(i_{k-1}) = i_k \end{align*}
$$

よって$\sigma\tau=\tau\sigma=e$である. 以上より$\tau=\sigma^{-1}$である.

- 任意の$1\leq k\leq m$に対して巡回置換の定義より

$$
\begin{align*} \sigma^m(i_k)=i_{k+m}=i_m \end{align*}
$$

なので$\sigma^m=e$である. このとき$i_1,i_2,\ldots i_m$が相異なることから, $1\leq r< m$において$\sigma^r\neq e$である. すなわち$\sigma$の位数は$m$である.

◻

### 巡回置換の共役

補題 11 (巡回置換の共役). 巡回置換$\tau=(i_1,i_2,\ldots ,i_m)\in S_n$としたとき任意の$\sigma \in S_n$に対して

$$
\begin{align*} \sigma\tau \sigma^{-1}=(\sigma(i_1),\sigma(i_2),\ldots ,\sigma(i_m)) \end{align*}
$$

が成り立つ. つまり$\tau$とその共役$\sigma\tau\sigma^{-1}$は同じ長さの巡回置換である.

証明. $I_m:=\{i_1,i_2,\ldots ,i_m\}$とする. 示すべき式の右辺の巡回置換を$\mu$として, $(\sigma\tau\sigma^{-1})(i)=\mu(i)\,(1\leq i\leq n)$を示す.

- $\sigma^{-1}(i)\in I_m$のとき. ある$i_k\in I_m$で$i=\sigma(i_k)$と表される. すると

$$
\begin{align*} (\sigma\tau\sigma^{-1})(i)=(\sigma\tau)(i_k)=\sigma(i_{k+1}) \\ \mu(i) = \mu(\sigma(i_k))=\sigma(i_{k+1}) \end{align*}
$$

となり成り立つ.

- $\sigma^{-1}(i)\not\in I_m$のとき. $\mu(i)=i$であって

$$
\begin{align*} \sigma\tau(\sigma^{-1}(i))=(\sigma\sigma^{-1})(i)=i \end{align*}
$$

となり成り立つ.

◻
