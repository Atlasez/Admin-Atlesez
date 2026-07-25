---
articleId: ja-mathematics-automorphism-groups
locale: ja
title: 自己同型群
slug: automorphism-groups
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.automorphism-groups
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  自己同型群の定義 定義 1 (自己同型群). 群 の自己同型写像全体の集合 は写像の合成を演算として群をなす. これを
  の自己同型群(automorphism group)という. 自己同型群の単位元は恒等写像である. …
difficulty: intermediate
estimatedMinutes: 40
tags:
  - 自己同型群
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 自己同型群の定義

定義 1 (自己同型群). 群$G$の自己同型写像全体の集合$\operatorname{Aut}(G)$は写像の合成を演算として群をなす. これを$G$の自己同型群(automorphism group)という.

自己同型群の単位元は恒等写像である. $\varphi\in \operatorname{Aut}(G)$の逆元はその逆写像$\varphi^{-1}$で, これが再び自己準同型写像であることは[準同型写像の定義:命題 11]から分かる. また, $\varphi,\psi\in \operatorname{Aut}(G)$の積$\varphi\circ\psi$も自己同型写像であることは[準同型写像の定義:命題 6]から分かる.

命題 2. $G_1\cong G_2$ならば$\operatorname{Aut}(G_1)\cong \operatorname{Aut}(G_2)$である.

証明. 仮定より同型写像$f\colon G_1\to G_2$が存在する. このとき$f$は逆写像$f^{-1}$を持つ. 写像

$$
\begin{align*} \Phi\colon \operatorname{Aut}(G_1)\to \operatorname{Aut}(G_2),\quad \varphi\mapsto f\varphi f^{-1} \end{align*}
$$

を考える. $f\varphi f^{-1}$は同型写像の合成なので同型写像である. また, $\varphi,\psi\in \operatorname{Aut}(G_1)$に対して

$$
\begin{align*} \Phi(\varphi\psi) &= f(\varphi\psi)f^{-1} \\ &= (f\varphi f^{-1})(f\psi f^{-1}) \\ &= \Phi(\varphi)\Phi(\psi) \end{align*}
$$

であるから$\Phi$は準同型写像である.

次に$\Phi$が全単射であることを示す. まず$\varphi\in\mathop{\mathrm{Ker}}\Phi$とすると

$$
\begin{align*} f\varphi f^{-1} &= \mathrm{id}_{G_2} \\ \varphi &= f^{-1}\mathrm{id}_{G_2}f \\ &= \mathrm{id}_{G_1} \end{align*}
$$

であるから$\varphi=\mathrm{id}_{G_1}$となる. よって$\Phi$は単射である. 次に$\psi\in \operatorname{Aut}(G_2)$をとると, $\varphi:=f^{-1}\psi f\in \operatorname{Aut}(G_1)$とすれば$\Phi(\varphi)=\psi$であるから$\Phi$は全射である. 以上より$\operatorname{Aut}(G_1)\cong \operatorname{Aut}(G_2)$が成り立つ. ◻

### 自己同型群の例:無限巡回群

命題 3 (無限巡回群の自己同型群). 加法群$(\mathbb{Z},+)$の自己同型群について$\operatorname{Aut}(\mathbb{Z})\cong \mathbb{Z}/2\mathbb{Z}$である.

証明. $f\in \operatorname{Aut}(\mathbb{Z})$とすると$f$は$\mathbb{Z}$の生成元$1,-1$によって決定される. さらに$f$は全射準同型なので

$$
\begin{align*} f(\mathbb{Z})=f(\langle 1\rangle)=\langle f(1)\rangle=\mathbb{Z} \end{align*}
$$

すなわち$f(1)$は$\mathbb{Z}$の生成元となるので$f(1)=\pm 1$である.

- $f(1)=1$のとき任意の$n\in\mathbb{Z}$に対して

$$
\begin{align*} f(n)=f(n\cdot 1)=nf(1)=n \end{align*}
$$

であるからこれは恒等写像である. これを$e$としておく.

- $f(1)=-1$のときは任意の$n\in\mathbb{Z}$に対して

$$
\begin{align*} f(n)=f(n\cdot 1)=nf(1)=-n \end{align*}
$$

となる. この準同型写像を$f_-$とおく. ここで$f_-\neq e$かつ$f_-^2=f_-$である.

以上より$\operatorname{Aut}(\mathbb{Z})=\{e,f_-\}\cong \mathbb{Z}/2\mathbb{Z}$が分かる. ◻

### 自己同型群の例:有限巡回群

命題 4 (有限巡回群の自己同型群). $G$を位数$n$の巡回群とするとき$\operatorname{Aut}(G)\cong (\mathbb{Z}/n\mathbb{Z})^{\times}$である.

証明. $G=\langle a\rangle$とする. このとき$f\in \operatorname{Aut}(G)$は生成元の行先$f(a)$を定めることで決定されることに注意する. $\varphi\colon (\mathbb{Z}/n\mathbb{Z})^{\times}\to \operatorname{Aut}(G)$を$\overline{k}\mapsto f_k$, $f_k(a):=a^k$で定める. このとき以下を確かめることで題意が示される.

- $\varphi$はwell-definedである. つまり代表元によらず定まり, $f_k\in \operatorname{Aut}(G)$.

- $\varphi$は全単射な群準同型である.

- まず$\varphi$が代表元によらず定まることを示す. $\overline{k}=\overline{l}\in (\mathbb{Z}/n\mathbb{Z})^{\times}$と仮定すると$k-l$は$n$で割り切れる. このとき$a^n=e$を用いると

$$
\begin{align*} f_k(a)f_l(a)^{-1}=a^{k}a^{-l}=a^{k-l}=e \end{align*}
$$

すなわち$f_k(a)=f_l(a)$が分かる. つまり$\varphi$は代表元によらず定まる. 今$(\mathbb{Z}/n\mathbb{Z})^{\times}$の代表元$k\in \mathbb{Z}$は$0\leq k<n$かつ$n$と互いに素であるものとして取ることができる. 次に$f_k\in \operatorname{Aut}(G)$について$f_k$が全単射であることを示す. $0\leq i,j<n$に対して$f(a^i)=f(a^j)$とすると$a^{ik}=a^{jk}$なので$a^{(i-j)k}=e$である. $a$の位数は$n$なので$(i-j)k$は$n$で割り切れる. $k$は$n$と互いに素なので$i-j$が$n$で割り切れる. このことから$a^{i-j}=e$となるから$a^i=a^j$より$f_k$の単射性が分かる. また, $\overline{kl}=\overline{1}\in(\mathbb{Z}/n\mathbb{Z})^{\times}$となる$l\in\mathbb{Z}$が存在する. このとき$kl=1+nx\,(x\in\mathbb{Z})$とすれば任意の$a^i\in G$に対して

$$
\begin{align*} f_k(a^{li})=a^{kli}=a^{(1+nx)i}=a^i \end{align*}
$$

となるから$f_k$が全射であることも分かる. 以上より$f_k\in \operatorname{Aut}(G)$.

- $\varphi$が群準同型であることは任意の$\overline{k},\overline{l}\in(\mathbb{Z}/n\mathbb{Z})^{\times}$に対して

$$
\begin{align*} \varphi(\overline{k}\overline{l})(a)=f_{kl}(a)=(a^l)^k=(f_kf_l)(a)=\varphi(\overline{k})\varphi(\overline{l}) \end{align*}
$$

であることから分かる. 次に$\varphi$が単射であることを示す. $\overline{k}\in(\mathbb{Z}/n\mathbb{Z})^{\times}$に対して$\varphi(\overline{k})(a)=f_k(a)=a^k=a$, つまり$f_k$が恒等写像であるとすると$\overline{k}=\overline{1}$なので$\mathop{\mathrm{Ker}}\varphi=\{\overline{1}\}$. [準同型写像の像と核:命題 3]より$\varphi$は単射. また, 任意の$f\in\operatorname{Aut}(G)$は$f(a)=a^m\in G,\,(0\leq m<n)$で表されるが$f(a)$は$G$の生成元になっているので$m$は$n$と互いに素である. よって$\overline{m}\in(\mathbb{Z}/n\mathbb{Z})^{\times}$より$\varphi(\overline{m})=f_{m}=g$. すなわち$\varphi$は全射.

以上より$\varphi$が群同型$\operatorname{Aut}(G)\cong (\mathbb{Z}/n\mathbb{Z})^{\times}$を与えることが分かる. ◻

### 内部自己同型群と外部自己同型群

定義 5 (内部自己同型群). 群$G$の内部自己同型写像([準同型写像の例:例 2])全体

$$
\begin{align*} \mathop{\mathrm{Inn}}(G):=\{\operatorname{Ad}_g\colon G\to G,\;x\mapsto x^g\mid g\in G\} \end{align*}
$$

を$G$の内部自己同型群(inner automorphism group)という.

アーベル群$G$の内部自己同型は全て恒等写像になるため, $\mathop{\mathrm{Inn}}(G)$は自明な群となる.

命題 6 (内部自己同型群は部分群). 内部自己同型群$\mathop{\mathrm{Inn}}(G)$は$\operatorname{Aut}(G)$の部分群である.

証明. まず恒等写像$\mathrm{id}_G=\operatorname{Ad}_{e}$であるから$\mathrm{id}_G\in \mathop{\mathrm{Inn}}(G)$. 次に$\operatorname{Ad}_{g},\operatorname{Ad}_{h}\in \mathop{\mathrm{Inn}}(G)$とすると任意の$x\in G$に対して

$$
\begin{align*} (\operatorname{Ad}_{g}\circ \operatorname{Ad}_{h})(x)=\operatorname{Ad}_{g}(x^h)=x^{hg}=\operatorname{Ad}_{hg}(x) \end{align*}
$$

であるから$\operatorname{Ad}_{g}\circ \operatorname{Ad}_{h}=\operatorname{Ad}_{hg}\in \mathop{\mathrm{Inn}}(G)$. 最後に$\operatorname{Ad}_{g}\in \mathop{\mathrm{Inn}}(G)$とすると任意の$x\in G$に対して

$$
\begin{align*} \operatorname{Ad}_{g}^{-1}(x)=x^{g^{-1}}=\operatorname{Ad}_{g^{-1}}(x) \end{align*}
$$

であるから$\operatorname{Ad}_{g}^{-1}=\operatorname{Ad}_{g^{-1}}\in \mathop{\mathrm{Inn}}(G)$. 以上より$\mathop{\mathrm{Inn}}(G)$は$\operatorname{Aut}(G)$の部分群である. ◻

命題 7 (内部自己同型群は正規部分群). 群$G$の内部自己同型群$\mathop{\mathrm{Inn}}(G)$は自己同型群$\operatorname{Aut}(G)$の正規部分群である.

証明. $\mathop{\mathrm{Inn}}(G)$が$\operatorname{Aut}(G)$の部分群であることは[自己同型群:命題 6]より分かる. $\varphi\in \operatorname{Aut}(G),\ \operatorname{Ad}_g\in \mathop{\mathrm{Inn}}(G)$とする. 任意の$x\in G$に対して

$$
\begin{align*} (\varphi\circ \operatorname{Ad}_g\circ \varphi^{-1})(x) &= \varphi(\operatorname{Ad}_g(\varphi^{-1}(x))) \\ &= \varphi(g^{-1}\varphi^{-1}(x)g) \\ &= \varphi(g)^{-1}x\varphi(g) \\ &= x^{\varphi(g)} \\ &= \operatorname{Ad}_{\varphi(g)}(x) \end{align*}
$$

であるから$\varphi\circ \operatorname{Ad}_g\circ \varphi^{-1}=\operatorname{Ad}_{\varphi(g)}\in \mathop{\mathrm{Inn}}(G)$. よって$\mathop{\mathrm{Inn}}(G)$は$\operatorname{Aut}(G)$の正規部分群である. ◻

[自己同型群:命題 7]より剰余群$\operatorname{Aut}(G)/\mathop{\mathrm{Inn}}(G)$が定義できる.

定義 8 (外部自己同型群). 剰余群$\operatorname{Aut}(G)/\mathop{\mathrm{Inn}}(G)$を$G$の外部自己同型群(outer automorphism group)といい, $\mathop{\mathrm{Out}}(G)$と表す.

### 内部自己同型群の性質

命題 9 (内部自己同型群と中心の関係). 群$G$の中心$Z(G)$と内部自己同型群$\mathop{\mathrm{Inn}}(G)$について$\mathop{\mathrm{Inn}}(G)\cong G/Z(G)$が成り立つ.

証明. 共役作用の置換表現$\operatorname{Ad}\colon G\to \mathop{\mathrm{Inn}}(G),\,g\mapsto \operatorname{Ad}_g$を考える. $\operatorname{Ad}$の核を求めると, $g\in \mathop{\mathrm{Ker}}\operatorname{Ad}$ならば任意の$x\in G$に対して$x^g=x$が成り立つので$g\in Z(G)$. 逆に$g\in Z(G)$ならば任意の$x\in G$に対して$x^g=x$であるから$g\in \mathop{\mathrm{Ker}}\operatorname{Ad}$. よって$\mathop{\mathrm{Ker}}\operatorname{Ad}=Z(G)$が分かる. また$\operatorname{Ad}$は全射であるから, 準同型定理([準同型定理と例:定理 1])から$\mathop{\mathrm{Inn}}(G)\cong G/Z(G)$が従う. ◻

### 直積群の自己同型群

命題 10 (直積群の内部自己同型群). 群$G_1,G_2$の直積群$G_1\times G_2$の内部自己同型群について $\mathop{\mathrm{Inn}}(G_1\times G_2)\cong \mathop{\mathrm{Inn}}(G_1)\times \mathop{\mathrm{Inn}}(G_2)$が成り立つ.

証明. [自己同型群:命題 9]より

$$
\begin{align*} \mathop{\mathrm{Inn}}(G_1\times G_2)\cong (G_1\times G_2)/Z(G_1\times G_2) \end{align*}
$$

が成り立つ. ここで中心の直積について

$$
\begin{align*} Z(G_1\times G_2)=Z(G_1)\times Z(G_2) \end{align*}
$$

である. したがって

$$
\begin{align*} \mathop{\mathrm{Inn}}(G_1\times G_2) &\cong (G_1\times G_2)/(Z(G_1)\times Z(G_2)) \\ &\cong (G_1/Z(G_1))\times (G_2/Z(G_2)) \\ &\cong \mathop{\mathrm{Inn}}(G_1)\times \mathop{\mathrm{Inn}}(G_2) \end{align*}
$$

が成り立つ. ◻

一方, 自己同型群について$\operatorname{Aut}(G_1\times G_2)\cong \operatorname{Aut}(G_1)\times \operatorname{Aut}(G_2)$は限られた場合のみ成り立つ.

命題 11. 有限群$G_1,G_2$の位数が互いに素であるとき$\operatorname{Aut}(G_1\times G_2)\cong \operatorname{Aut}(G_1)\times \operatorname{Aut}(G_2)$が成り立つ.

証明. 任意の$\varphi\in \operatorname{Aut}(G_1\times G_2)$に対して, 射影$\pi_1,\pi_2$, および包含写像$\iota_1,\iota_2$を用いて

$$
\begin{align*} \varphi_1=\pi_1\circ\varphi\circ\iota_1\colon G_1&\to G_1 \\ \varphi_2=\pi_2\circ\varphi\circ\iota_2\colon G_2&\to G_2 \end{align*}
$$

と定める. このとき$G_1$と$G_2$の位数が互いに素であることから, 準同型写像$\pi_1\circ \varphi\circ \iota_2\colon G_2\to G_1$と$\pi_2\circ \varphi\circ \iota_1\colon G_1\to G_2$は自明な写像になる. よって任意の$(x,y)\in G_1\times G_2$に対して

$$
\begin{align*} \pi_1\circ\varphi(x,y) &= \pi_1\circ\varphi\circ(\iota_1(x)\iota_2(y))=\varphi_1(x) \\ \pi_2\circ\varphi(x,y) &= \pi_2\circ\varphi\circ(\iota_1(x)\iota_2(y))=\varphi_2(y) \end{align*}
$$

すなわち

$$
\begin{align*} \varphi(x,y)=(\varphi_1(x),\varphi_2(y)) \end{align*}
$$

が成り立つ.

次に写像$\Phi\colon\operatorname{Aut}(G_1\times G_2)\to \operatorname{Aut}(G_1)\times \operatorname{Aut}(G_2),\ \varphi\mapsto (\varphi_1,\varphi_2)$が同型写像であることを示す. $\varphi,\psi\in \operatorname{Aut}(G_1\times G_2)$とすると

$$
\begin{align*} (\varphi_1,\varphi_2)(\psi_1,\psi_2)=(\varphi_1\psi_1,\varphi_2\psi_2) \end{align*}
$$

であり

$$
\begin{align*} \varphi_1\psi_1 &= (\pi_1\circ\varphi\circ\iota_1)\circ(\pi_1\circ\psi\circ\iota_1) \\ &= \pi_1\circ(\varphi\circ\psi)\circ\iota_1 \\ &=(\varphi\psi)_1 \end{align*}
$$

同様に$\varphi_2\psi_2=(\varphi\psi)_2$が成り立つ. よって$\Phi(\varphi\psi)=\Phi(\varphi)\Phi(\psi)$が成り立つから$\Phi$は準同型写像である. であるから$\Phi(\varphi\psi)=\Phi(\varphi)\Phi(\psi)$が成り立ち, $\Phi$は準同型写像. また$\varphi\in \mathop{\mathrm{Ker}}\Phi$とすると$\varphi_1=\mathrm{id}_{G_1},\ \varphi_2=\mathrm{id}_{G_2}$であるから任意の$(x,y)\in G_1\times G_2$に対して

$$
\begin{align*} \varphi(x,y)=(\varphi_1(x),\varphi_2(y))=(x,y) \end{align*}
$$

となる. よって$\varphi=\mathrm{id}_{G_1\times G_2}$であるから$\Phi$は単射. 最後に$(\psi_1,\psi_2)\in \operatorname{Aut}(G_1)\times \operatorname{Aut}(G_2)$をとると, $\varphi\colon G_1\times G_2\to G_1\times G_2$を

$$
\begin{align*} \varphi(x,y)=(\psi_1(x),\psi_2(y)) \end{align*}
$$

で定めると$\varphi\in \operatorname{Aut}(G_1\times G_2)$かつ$\Phi(\varphi)=(\psi_1,\psi_2)$であるから$\Phi$は全射.

以上より$\operatorname{Aut}(G_1\times G_2)\cong \operatorname{Aut}(G_1)\times \operatorname{Aut}(G_2)$が成り立つ. ◻

例 12. $G_1=G_2=\mathbb{Z}/2\mathbb{Z}$のとき$\operatorname{Aut}(G_1)\cong \operatorname{Aut}(G_2)\cong \{e\}$である. 一方で$\operatorname{Aut}(G_1\times G_2)$で自明でないものが存在する. $\sigma\in \operatorname{Aut}(G_1\times G_2)$を

$$
\begin{align*} \sigma\colon G_1\times G_2\to G_1\times G_2,\quad (x,y)\mapsto (y,x) \end{align*}
$$

で定めるとこれは自己同型写像であり, 自明でない. よって$\operatorname{Aut}(G_1\times G_2)\not\cong \operatorname{Aut}(G_1)\times \operatorname{Aut}(G_2)$である.

より具体的には$\operatorname{Aut}(\mathbb{Z}/2\mathbb{Z}\times \mathbb{Z}/2\mathbb{Z})\cong S_3$である.
