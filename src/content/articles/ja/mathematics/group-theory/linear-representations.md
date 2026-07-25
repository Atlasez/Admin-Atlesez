---
articleId: ja-mathematics-linear-representations
locale: ja
title: 群の線形表現
slug: linear-representations
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.linear-representations
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  置換表現のうち, 線形空間 に作用し, またその線形構造を保つもの, すなわち に値を持つものを考える. 群の線形表現の定義 定義 1
  (群の線形表現). を群, を体 上の線形空間とする. 準同型写像 を の 上の線形…
difficulty: intermediate
estimatedMinutes: 35
tags:
  - 群の線形表現
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

置換表現のうち, 線形空間$V$に作用し, またその線形構造を保つもの, すなわち$\mathop{\mathrm{\mathit{GL}}}(V)$に値を持つものを考える.

### 群の線形表現の定義

定義 1 (群の線形表現). $G$を群, $V$を体$\mathbb{K}$上の線形空間とする. 準同型写像$\rho\colon G\to \mathop{\mathrm{\mathit{GL}}}(V)$を$G$の$V$上の線形表現(linear representation)または単に表現(representation)という. 組$(V,\rho)$は$G$の表現空間(representation space)という. また, $V$の次元を表現$(\rho,V)$の次元(dimension)という.

表現空間$(V,\rho)$について線形空間$V$に作用する表現$\rho$が文脈上明らかなとき, 省略して単に表現空間$V$という. また, 群$G$の表現$\rho$について線形空間$V$を明示したいとき, $(\rho,V)$とかくこともある。

表現空間が有限次元である表現を有限次元表現(finite-dimensional representation)という. また, $(\rho,V)$を$G$の有限次元表現とすると各$g\in G$に対して線形写像$\rho(g)\in \mathop{\mathrm{\mathit{GL}}}(V)$が定まる. $V$の基底を一つ取ることで$\rho(g)$の表現行列が定まる.

例 2 (自明表現). 群$G$の線形空間$V$上の自明表現(trivial representation)とは, 任意の$g\in G$に対して恒等写像$\mathrm{id}_V\in \mathop{\mathrm{\mathit{GL}}}(V)$を対応させる表現である. 自明な表現$\rho(g)$に対する$\rho(g)$の表現行列は単位行列である.

例 3 (2次元表現の例). 加法群$\mathbb{R}$の表現$\rho\colon \mathbb{R}\to GL(\mathbb{R}^2)$を表現行列

$$
\begin{align*} \rho(t)=\begin{pmatrix}1 & t \\ 0 & 1 \end{pmatrix},\quad (t\in \mathbb{R}) \end{align*}
$$

によって定めると$(\rho,\mathbb{R}^2)$は$\mathbb{R}$の2次元表現である.

### 部分表現

定義 4 ($G$不変部分空間と部分表現). $(\rho,V)$を群$G$の線形表現とする. $V$の部分空間$W$が$G$不変部分空間($G$-invariant subspace)または単に$G$不変($G$-invariant)であるとは, 任意の$g\in G$に対して$\rho(g)(W)\subset W$が成り立つことである.

このとき$W$上の表現$\rho|_W\colon G\to \mathop{\mathrm{\mathit{GL}}}(W)$が$\rho|_W(g):=\rho(g)|_W$によって定まり, $(\rho|_W,W)$を$V$の部分表現(subrepresentation)という.

$V$の部分表現$(\rho|_W,W)$は省略して, 単に$V$の部分表現$W$と書く.

例 5 (自明な$G$不変部分空間). $(\rho,V)$を群$G$の線形表現とする. このとき自明な$V$の部分空間$\{0\}$および$V$は$G$不変である. これを自明な$G$不変部分空間という.

命題 6 ($G$不変部分空間の共通部分と和空間は不変部分空間). $(\rho, V)$を群$G$の線形表現とし, $\{W_\lambda\}_{\lambda \in \Lambda}$を$V$の$G$不変部分空間の族とする. このとき, 共通部分$\bigcap_{\lambda \in \Lambda} W_\lambda$および和空間$\sum_{\lambda \in \Lambda} W_\lambda$は$V$の$G$不変部分空間である

証明. $v \in \bigcap_{\lambda \in \Lambda} W_\lambda$をとる. 定義より, 任意の$\lambda \in \Lambda$に対して$v \in W_\lambda$である. 各$W_\lambda$は$G$不変であるから, 任意の$g\in G$に対して$\rho(g)v \in W_\lambda$がすべての$\lambda \in \Lambda$について成り立つ. よって$\rho(g)v \in \bigcap_{\lambda \in \Lambda} W_\lambda$であり, 共通部分は$G$不変部分空間である.

次に$v \in \sum_{\lambda \in \Lambda} W_\lambda$とする. このとき$v$は$v_{\lambda_i}\in W_i,\ (1\leq i\leq n)$を用いて$v=\sum_{i=1}^n v_{\lambda_i}$と表せる. 任意の$g\in G$に対して

$$
\begin{align*} \rho(g)v=\sum_{i=1}^n \rho(g)v_{\lambda_i} \end{align*}
$$

である. 各$W_{\lambda_i}$は$G$不変であるから, $\rho(g)v_{\lambda_i}\in W_{\lambda_i}$が成り立つ. よって$\rho(g)v \in \sum_{\lambda \in \Lambda} W_\lambda$であり, 和空間も$G$不変部分空間である. ◻

### 既約表現の定義

定義 7 (既約表現). $(\rho,V)$を群$G$の線形表現とする. $V\neq \{0\}$かつ, 非自明な$G$不変部分空間をもたないとき, $(\rho,V)$を既約表現(irreducible representation)という. $(\rho,V)$が既約表現でないときは可約表現(reducible representation)という.

例 8 (一次元表現は既約表現). 一次元表現$(\rho,V)$について, $V$は部分空間として$\{0\}, V$のみを持つので既約表現である.

命題 9. $V$を群$G$の表現として$U,W$を$V$の非自明な既約部分表現とする. このとき$U,W$について$U\cap W=\{0\}$または$U=W$が成り立つ.

証明. $U\cap W$は$U,W$の部分空間であって, $U,W$が$G$不変なので$U\cap W$も$G$不変である. すると$U,W$が既約であるから $U\cap W=\{0\},U$かつ$U\cap W=\{0\},W$が成り立つ. すなわち$U\cap W=\{0\}$または$U\cap W=U=W$である. ◻

命題 10 (有限群の既約表現は有限次元表現). $G$を有限群, $(\rho, V)$を$G$の既約表現とする. このとき$V$は有限次元である.

証明. $v\in V$として$0$でないものを一つ取る. このとき$G$が有限群なので, 次の$V$の部分空間$W$は有限次元である.

$$
\begin{align*} W:=\mathop{\mathrm{Span}}\{\rho(g)v \mid g\in G\} \end{align*}
$$

さらに, 任意の$h\in G$に対して

$$
\begin{align*} \rho(h)(W)=\mathop{\mathrm{Span}}\{\rho(hg)v \mid g\in G\}=W \end{align*}
$$

なので$W$は$G$不変部分空間である. $v\neq 0$であったから$W\neq \{0\}$であり, $V$は既約表現なので$W=V$となる. 以上より$V$が有限次元であることが示された. ◻

### 群環上の加群と群の表現の対応

命題 11. 群$G$の$\mathbb{K}$線形空間$V$上の表現と群環$\mathbb{K}[G]$上の左加群$V$との間には一対一対応がある. 具体的には, 写像$\Phi\colon\operatorname{Hom}(G,\mathop{\mathrm{\mathit{GL}}}(V))\to \operatorname{Hom}(\mathbb{K}[G],\operatorname{End}(V))$で全単射なものが存在する. ただし$\operatorname{Hom}(G,\mathop{\mathrm{\mathit{GL}}}(V))$は群準同型写像による集合, $\operatorname{Hom}(\mathbb{K}[G],\operatorname{End}(V))$は環準同型写像による集合である.

証明. 写像$\Phi\colon\operatorname{Hom}(G,\mathop{\mathrm{\mathit{GL}}}(V))\to \operatorname{Hom}(\mathbb{K}[G],\operatorname{End}(V))$を$\rho\in \operatorname{Hom}(G,\mathop{\mathrm{\mathit{GL}}}(V))$として次のように定める.

$$
\begin{align*} \Phi(\rho)\colon\mathbb{K}[G]&\longrightarrow \operatorname{End}(V) \\ \sum_{g\in G}k_gg&\longmapsto\sum_{g\in G}k_g\rho(g) \end{align*}
$$

まず$\Phi(\rho)$が環準同型であることを示す. 任意の

$$
\begin{align*} x=\sum_{g\in G}k_gg,\ y=\sum_{g\in G}l_gg\in \mathbb{K}[G] \end{align*}
$$

に対し, 和について

$$
\begin{align*} \Phi(\rho)(x+y) &= \Phi(\rho)\left(\sum_{g\in G}(k_g+l_g)g\right) \\ &= \sum_{g\in G}(k_g+l_g)\rho(g) \\ &= \sum_{g\in G}k_g\rho(g) + \sum_{g\in G}l_g\rho(g) \\ &= \Phi(\rho)(x) + \Phi(\rho)(y) \end{align*}
$$

積について,

$$
\begin{align*} \Phi(\rho)(xy) &= \Phi(\rho)\left(\sum_{g,h\in G}k_gl_h(gh)\right) \\ &= \sum_{g,h\in G}k_gl_h\rho(gh) \\ &= \sum_{g,h\in G}k_gl_h\rho(g)\rho(h) \\ &= \left(\sum_{g\in G}k_g\rho(g)\right)\left(\sum_{h\in G}l_h\rho(h)\right) \\ &= \Phi(\rho)(x)\Phi(\rho)(y) \end{align*}
$$

単位元について$\delta_{g,e}$を$g=e$のとき1, それ以外のとき0となるクロネッカーのデルタとして

$$
\begin{align*} \Phi(\rho)(1_{\mathbb{K}[G]}) &= \Phi(\rho)\left(\sum_{g\in G}\delta_{g,e}g\right) \\ &= \rho(e) \\ &= \mathrm{id}_V \end{align*}
$$

であるから, $\Phi(\rho)$は環準同型である.

次に$\Phi$が次の写像$\Psi\colon \operatorname{Hom}(\mathbb{K}[G],\operatorname{End}(V))\to \operatorname{Hom}(G,\mathop{\mathrm{\mathit{GL}}}(V))$を逆写像としてもつことを示す. $G$は$\mathbb{K}[G]$の部分集合としてみなすことができるから, $r\in \operatorname{Hom}(\mathbb{K}[G],\operatorname{End}(V))$として次のように定める.

$$
\begin{align*} \Psi(r)\colon G&\longrightarrow \mathop{\mathrm{\mathit{GL}}}(V) \\ g&\longmapsto r(g) \end{align*}
$$

$r$が環準同型写像であることより, $\Psi(r)$が群準同型写像であることが従う. $\Psi\circ \Phi,\ \Phi\circ \Psi$をそれぞれ考えると次のようになる.

$$
\begin{align*} (\Psi\circ \Phi)(\rho)(g) &= \Psi(\Phi(\rho))(g) \\ &= \Phi(\rho)(g) \\ &= \rho(g) \\ (\Phi\circ \Psi)(r)\left(\sum_{g\in G}k_gg\right) &= \Phi(\Psi(r))\left(\sum_{g\in G}k_gg\right) \\ &= \sum_{g\in G}k_gr(g) \\ &= r\left(\sum_{g\in G}k_gg\right) \end{align*}
$$

よって$\Psi$が$\Phi$の逆写像であるから$\Phi$は全単射である. ◻

この対応により, 群$G$の表現$(\rho,V)$は群環$\mathbb{K}[G]$上の左加群$V$としてみなすことができ, 部分表現や既約表現は加群の部分加群や既約加群として考えることができる. つまり$G$の表現$(\rho,V)$の部分表現とは, 群環$\mathbb{K}[G]$上の左加群$V$の部分加群であり, $(\rho,V)$が既約表現であるとは, $V$が$\mathbb{K}[G]$上の既約加群であることである.
