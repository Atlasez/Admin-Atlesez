---
articleId: ja-mathematics-group-actions
locale: ja
title: 群の作用と置換表現の定義
slug: group-actions
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.group-actions
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  群の作用の定義 定義 1 (左群作用). 群 と集合 に対し, 演算 が定まっているとする. 次の条件を満たすとき は
  に左から作用する(act on from the left)といい, 演算 を左群作用(left g…
difficulty: intermediate
estimatedMinutes: 25
tags:
  - 群の作用と置換表現の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 群の作用の定義

定義 1 (左群作用). 群$G$と集合$X$に対し, 演算$\alpha\colon G\times X\to X$が定まっているとする. 次の条件を満たすとき$G$は$X$に左から作用する(act on $X$ from the left)といい, 演算$\alpha$を左群作用(left group action)という. このことを$\alpha\colon G\curvearrowright X$で表す. また, 左作用$\alpha(g,x)$は$g.x$と表記する.

- $\forall g_1,g_2\in G,\,x\in X,\,(g_1g_2). x=g_1.(g_2. x)$.

- $G$の単位元を$e$として$\forall x\in X,\,e. x=x$.

定義 2 (右群作用). 群$G$と集合$X$に対し, 演算$\alpha\colon X\times G\to X$が定まっているとする. 次の条件を満たすとき$G$は$X$に右から作用する(act on $X$ from the right)といい, 演算$\alpha$を右群作用(right group action)という. このことを$\alpha\colon X\curvearrowleft G$で表す. また, 右作用$\alpha(x,g)$は$x.g$と表記する.

- $\forall g_1,g_2\in G,\,x\in X,\,x.(g_1g_2)=(x. g_1). g_2$.

- $G$の単位元を$e$として$\forall x\in X,\,x. e=x$.

単に群の作用といえば左群作用を指すことが多い. 本記事では群作用を群の演算と区別するために$g.x$で表すが, 文献によっては$g\cdot x$や$gx$で表すこともある.

定義 3 (両側群作用). 群$G$, $H$と集合$X$に対し, 次の条件をみたすとき$G$, $H$は$X$に両側から作用する(act on $X$ from left and right)という. このことを$G\curvearrowright X\curvearrowleft H$で表す.

- $G$は$X$に左から作用する.

- $H$は$X$に右から作用する.

- $\forall g\in G, h\in H, x\in X,\,g.(x. h)=(g. x). h$.

特に両側作用の条件3. より$(g.x).h=g.(x.h)$であるからかっこを省略して$g.x.h$と書いてよいことが従う.

### 群の置換表現

Cayleyの定理([対称群:定理 3])より, 任意の群$G$は対称群に埋め込むことができる. これは群を対称群の部分として表現して調べることができるということである. すなわち群から対称群への準同型により, 群$G$の構造の部分や全体は対称群へ写し取られ, 表現される.

定義 4 (群の置換表現). 準同型写像$\rho\colon G\to \mathop{\mathrm{Sym}}(X)$を$G$の$X$上の置換表現(permutation representation)という.

次の命題により, 群の作用と置換表現は一対一に対応することが分かる.

命題 5 (群の作用と置換表現の対応). $G$の$X$への左作用$\alpha\colon G\times X\to X$全体の集合を$\mathcal{A}$とおく. このとき, 作用$\alpha\in\mathcal{A}$に対して置換表現を対応させる次の写像は全単射である.

$$
\begin{align*} \Phi\colon\mathcal{A}\longrightarrow \mathop{\mathrm{Hom}}(G,\mathop{\mathrm{Sym}}(X)),\quad \alpha\longmapsto \rho_{\alpha} \end{align*}
$$

ただし$\rho_{\alpha}(g)\colon x\longmapsto \alpha(g,x)$である.

証明. 簡単のために$\alpha(g,x)$は$g.x$と表記する. まず$\Phi$がwell-definedであること, つまり$\rho_{\alpha}\in\mathop{\mathrm{Hom}}(G,\mathop{\mathrm{Sym}}(X))$であることを示す. $\rho_{\alpha}(g)\colon G\to G$は逆写像$\rho_{\alpha}(g^{-1})\colon G\to G$を持つことが次の式から分かる.

$$
\begin{align*} (\rho_{\alpha}(g)\circ \rho_{\alpha}(g^{-1}))(x) &= g.(g^{-1}. x) = (gg^{-1}). x = e. x = x \\ (\rho_{\alpha}(g^{-1})\circ \rho_{\alpha}(g))(x) &= g^{-1}.(g. x) = (g^{-1}g). x = e. x = x \end{align*}
$$

よって$\rho_{\alpha}(g)$は$X$上の全単射であるから$\rho_{\alpha}(g)\in \mathop{\mathrm{Sym}}(X)$である.

また, 任意の$g_1,g_2\in G$に対して

$$
\begin{align*} \rho_{\alpha}(g_1g_2)(x) = (g_1g_2). x = g_1.(g_2. x) = (\rho_{\alpha}(g_1)\circ \rho_{\alpha}(g_2))(x) \end{align*}
$$

となることから$\rho_{\alpha}\in \mathop{\mathrm{Hom}}(G,\mathop{\mathrm{Sym}}(X))$であることが分かる.

次に$\Psi\colon \mathop{\mathrm{Hom}}(G,\mathop{\mathrm{Sym}}(X))\to \mathcal{A}$を次のように定めることができて, $\Phi$の逆写像を与えることを確かめる.

$$
\begin{align*} \Psi\colon \rho\longmapsto \alpha_{\rho},\quad \alpha_{\rho}(g,x)=g.x:=\rho(g)(x) \end{align*}
$$

まず$\alpha_{\rho}$が左群作用であることを示す. $\rho(e)=\mathrm{id}_X$より$e.x=x$である. また, 任意の$g_1,g_2\in G, x\in X$に対して

$$
\begin{align*} (g_1g_2).x=\rho(g_1g_2)(x) = (\rho(g_1)\circ \rho(g_2))(x) = \rho(g_1)(\rho(g_2)(x)) = g_1.(g_2.x) \\ \end{align*}
$$

となるから$\alpha_{\rho}\in\mathcal{A}$である. すると,

$$
\begin{align*} (\Phi\circ \Psi)(\rho)(g)(x) &= \Phi(\alpha_{\rho})(g)(x) = \alpha_{\rho}(g,x) = \rho(g)(x) \\ (\Psi\circ \Phi)(\alpha)(g,x) &= \Psi(\rho_{\alpha})(g,x) = \rho_{\alpha}(g)(x) = \alpha(g,x) \end{align*}
$$

なので$\Phi\circ\Psi=\mathrm{id}_{\mathop{\mathrm{Hom}}(G,\mathop{\mathrm{Sym}}(X))}$かつ$\Psi\circ \Phi=\mathrm{id}_{\mathcal{A}}$である. 以上より$\Phi\colon \mathcal{A}\to \mathop{\mathrm{Hom}}(G,\mathop{\mathrm{Sym}}(X))$は全単射である. ◻

同様に$G$の$X$への右作用$\alpha\colon X\times G\to X$に対して, 次の反準同型写像([準同型写像の定義:定義 4])$\rho\colon G\to \mathop{\mathrm{Sym}}(X)$を対応させることで一対一対応する.

$$
\begin{align*} \rho(g)(x):=\alpha(x,g)=x.g,\quad (g\in G, x\in X) \end{align*}
$$

$\rho$が反準同型写像であることは次の式から分かる.

$$
\begin{align*} \rho(g_1g_2)(x) = x.(g_1g_2) = (x. g_1). g_2 = (\rho(g_2)\circ \rho(g_1))(x) \end{align*}
$$

反準同型写像は反対群に関する準同型写像とみることもできる. つまり上の右群作用の表現$\rho\colon G\longrightarrow \mathop{\mathrm{Sym}}(X)$は準同型写像$\rho\colon G^{\mathrm{op}}\longrightarrow \mathop{\mathrm{Sym}}(X)$を定めていると考えてもよいので, $G$の右からの作用は$G^{\mathrm{op}}$の左からの作用とみなせる.

また, $G$と$H$の$X$への両側からの作用は, 次の準同型写像と一対一対応する.

$$
\begin{align*} \rho\colon G\times H^{\mathrm{op}}\longrightarrow \mathop{\mathrm{Sym}}(X),\quad \rho(g,h)(x):=g.x.h,\quad (g\in G, h\in H, x\in X) \end{align*}
$$

すなわち, $G$と$H$の両側からの作用は$G\times H^{\mathrm{op}}$の左からの作用とみなせる.

よって群の作用や置換表現は本質的には左群作用を考えれば十分である.

例 6 (自明な作用). $G$を群, $X$を集合とする. 任意の$g\in G, x\in X$に対して$g.x:=x$で定めると, これは群作用である. この作用を自明な作用(trivial action)という. 自明な作用の置換表現は$G$の元に対して$X$上の恒等写像を対応させる準同型写像である.
