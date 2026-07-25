---
articleId: ja-mathematics-schur-lemma
locale: ja
title: Schurの補題
slug: schur-lemma
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.schur-lemma
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  Schurの補題 補題 1 (Schurの補題). を の既約表現とする. を 準同型とすると は零写像か同型写像である. 証明. まず
  の核を考えると は 不変部分空間であるから は既約表現なので に限られる. のとき…
difficulty: intermediate
estimatedMinutes: 25
tags:
  - Schurの補題
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### Schurの補題

補題 1 (Schurの補題). $V,W$を$G$の既約表現とする. $\varphi\colon V\to W$を$G$準同型とすると$\varphi$は零写像か同型写像である.

証明. まず$\varphi$の核を考えると$\mathop{\mathrm{Ker}}\varphi\subset V$は$G$不変部分空間であるから$V$は既約表現なので$\mathop{\mathrm{Ker}}\varphi=\{0\},V$に限られる. $\mathop{\mathrm{Ker}}\varphi=V$のとき$\varphi$は零写像である. 次に$\mathop{\mathrm{Ker}}\varphi=\{0\}$とすると$\varphi$は単射. $\varphi$の像を考えると$\mathop{\mathrm{Im}}\varphi\subset W$は$G$不変部分空間である. $W$は既約表現なので$\mathop{\mathrm{Im}}\varphi=\{0\},W$となるが$\varphi\neq 0$なので$\mathop{\mathrm{Im}}\varphi=W$すなわち$\varphi$は全射. 以上より$\varphi$は零写像か同型写像である. ◻

### 既約表現上の自己$G$準同型写像

補題 2 (Schurの補題(Strong ver)). $V$を代数閉体$\mathbb{K}$上の有限次元線形空間で$G$の既約表現とする. $\varphi\colon V\to V$を$G$準同型写像とすると, ある$k\in\mathbb{K}$が存在して次のように書ける.

$$
\begin{align*} \varphi=k\cdot\mathrm{id}_V \end{align*}
$$

つまり$\operatorname{End}_G(V)\cong \mathbb{K}$である.

証明. $V$は有限次元なので線形写像$\varphi$は最小多項式をもち, $\mathbb{K}$は代数閉体なので最小多項式は$\mathbb{K}$内に根をもつ. よって$\varphi$は固有値$k\in\mathbb{K}$と$0$でない固有ベクトル$v_k$をもつ. このとき$(\varphi-k\cdot\mathrm{id}_V)(v_k)=0$である. また, $\varphi-k\cdot\mathrm{id}_V$は$G$準同型となるからSchurの補題([Schurの補題:補題 1])より$\varphi-k\cdot\mathrm{id}_V$は零写像か同型写像である. ここで$v_k\in\mathop{\mathrm{Ker}}(\varphi-k\cdot\mathrm{id}_V)$なので$\mathop{\mathrm{Ker}}(\varphi-k\cdot\mathrm{id}_V)\neq \{0\}$. よって$\varphi-k\cdot\mathrm{id}_V$は単射ではないため同型写像になり得ない. よって$\varphi-k\cdot\mathrm{id}_V=0$すなわち$\varphi=k\cdot\mathrm{id}_V$. ◻

系 3 (実線型空間の既約表現上の自己$G$準同型写像). $V$を$\mathbb{R}$上の有限次元線形空間で$G$の既約表現とする. $\varphi\colon V\to V$を$G$準同型とすると

$$
\begin{align*} \operatorname{End}_G(V)\cong \mathbb{R},\mathbb{C},\mathbb{H} \end{align*}
$$

である.

証明. $V$が有限次元線型空間なので$\operatorname{End}_G(V)$は有限次元線型空間である. [G準同型写像と表現の同値:命題 2]より$G$準同型写像の合成は$G$準同型写像なので$\operatorname{End}_G(V)$は写像の合成を積とした環である. $\varphi,\psi\in \operatorname{End}_G(V)$, $k\in \mathbb{R}$とすると$\varphi,\psi$が線形写像であることから

$$
\begin{align*} k(\psi\varphi) = (k\psi)\varphi = \psi(k\varphi) \end{align*}
$$

が成り立つ. つまり$\operatorname{End}_G(V)$は$\mathbb{R}$上の多元環である. さらに$\varphi\in\operatorname{End}_G(V)$で零写像でないとすると, $V$が既約表現であるからSchurの補題([Schurの補題:補題 1])より$\varphi$は同型写像であるから, $\varphi$は逆元を持つ. よって$\operatorname{End}_G(V)$は$\mathbb{R}$上の可除多元環である. Frobeniusの定理より$\mathbb{R}$上の可除多元環は$\mathbb{R}, \mathbb{C}, \mathbb{H}$のいずれかに同型なので$\operatorname{End}_G(V)\cong \mathbb{R},\mathbb{C},\mathbb{H}$である. ◻

[Schurの補題:補題 2]では$V$が既約表現であることを仮定して, $V$上の自己$G$準同型の構造を明らかにした. 限られた場合のみ, この逆が成立する.

命題 4. $V$を代数閉体$\mathbb{K}$上の有限次元線形空間で$G$の表現とする. $\operatorname{End}_G(V)\cong \mathbb{K}$とするとき次が成り立つ.

- $G$が有限群のとき, $(\rho,V)$は既約表現である.

- $G$がアーベル群のとき, $(\rho,V)$は一次元表現で既約表現である.

証明.

- $G$が有限群であるとする. Maschkeの定理より$U,W$を$V$の$G$不変部分空間として$V=U\oplus W$とできる. ここで$V$から$U$への射影$P_U\colon V\to U$を考え, それを$V$に埋め込む写像$\iota$との合成写像$\varphi:=\iota\circ P_U\colon V\to V$を考える. このとき$\varphi$は$G$準同型写像である. 任意の$v=u+w$に対し, $U,W$が$G$不変部分空間であることから$\rho(g)u\in U,\rho(g)w\in W$となるので

$$
\begin{align*} (\varphi\circ\rho(g))(v)=\varphi(\rho(u)+\rho(w))=\rho(u)=\rho(\varphi(v)) \end{align*}
$$

である. よって仮定よりある$k\in\mathbb{K}\setminus\{0\}$が存在して$\varphi=k\cdot\mathrm{id}_V$とかける. このとき

$$
\begin{align*} \varphi(v)=u,\quad \varphi(v)=kv=ku+kw \end{align*}
$$

となるが$k\neq 0$であることから$w=0$でないといけない. よって$W=\{0\}$かつ, $V=U$つまり$V$は既約.

- 次に$G$がアーベル群であるとする. 任意の$g,h\in G$に対し

$$
\begin{align*} \rho(g)\rho(h)=\rho(gh)=\rho(hg)=\rho(h)\rho(g) \end{align*}
$$

なので任意の$g\in G$に対して$\rho(g)$は$G$準同型写像. 仮定より$\operatorname{End}_G(V)$の基底として$\mathrm{id}_V$が取れるため, ある$k\in\mathbb{K}$で$\rho(g)=k\cdot\mathrm{id}_V$とかける. このとき$\operatorname{End}(V)=\operatorname{End}_G(V)$が成り立つ. これは$\varphi\in\operatorname{End}(V)$に対し

$$
\begin{align*} (\varphi\circ \rho(g))(v)=\varphi(kv)=k\varphi(v)=(\rho(g)\circ\varphi)(v) \end{align*}
$$

となることから従う. 以上より$\dim\operatorname{End}_G(V)=\dim\operatorname{End}(V)=(\dim V)^2=1$なので$\dim V=1$. 一次元表現はすべて既約であることから$(\rho,V)$は既約.

◻

例 5. [Schurの補題:命題 4]について$G$が非可換無限群の場合は$\dim\operatorname{End}_G(V)=1$でも$(\rho,V)$が既約表現とならないことが以下の例から分かる.

$GL(2,\mathbb{C})$の部分群$G$を

$$
\begin{align*} G:=\left\{ \begin{pmatrix} a & b \\ 0 & 1 \end{pmatrix} \;\middle|\;a\in\mathbb{C}\setminus\{0\},\;b\in\mathbb{C} \right\} \end{align*}
$$

と定めて, 次の$G$の$\mathbb{C}^2$上の表現を考える.

$$
\begin{align*} \rho\colon G \to \mathop{\mathrm{\mathit{GL}}}(\mathbb{C}^2)\quad A \mapsto (v\mapsto Av) \end{align*}
$$

この表現について$\dim\operatorname{End}_G(\mathbb{C}^2)=1$であるが可約表現である. 任意の$\varphi\in\operatorname{End}_G(\mathbb{C}^2)$に対し$\varphi$の行列表示について

$$
\begin{align*} \varphi:=\begin{pmatrix} x & y \\ z & w \end{pmatrix} ,\quad \forall a\neq 0,b\in\mathbb{C},\; \varphi\begin{pmatrix} a & b \\ 0 & 1 \end{pmatrix} =\begin{pmatrix} a & b \\ 0 & 1 \end{pmatrix} \varphi \end{align*}
$$

を満たす. $x,y,z,w$の条件は成分計算をすることにより$x=w$かつ$y=z=0$, すなわちある$c\in\mathbb{C}$で$\varphi=c\cdot\mathrm{id}_V$となることである. つまり$\dim\operatorname{End}_G(\mathbb{C}^2)=1$である. 一方, $\mathbb{C}^2$の$G$不変部分空間として

$$
\begin{align*} W=\left\langle \begin{pmatrix} 1 \\ 0 \end{pmatrix}\right\rangle\neq \{0\},\mathbb{C}^2 \end{align*}
$$

をとることができるので既約ではない.
